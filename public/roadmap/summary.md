# Roadmap Maestro — Reconstrucción del Bloque 1 (`Auditoría`), Contexto Histórico y Motor de Planificación Relacional

Este directorio define el plan de implementación completo, modular y atómico para reconstruir el **Bloque 1 (`Auditoría`: Programación, Calendario y Resultado)** y su infraestructura relacional de soporte en **`Sitio` (`procesos_por_sitio`)**, preservando el 100% de las garantías de seguridad, tipado estricto (`strict: true`, `0 any`), patrón **Universal Multi View / Detail View en 3 Zonas**, **Mandato Cero-UUID** y gobernanza **Soft-Delete / Audit Log** documentados en `public/doc/`.

---

## 1. Resumen Ejecutivo y Alcance

La arquitectura previa de `Auditoría` trataba la programación como un registro rígido (campos obligatorios en alta inicial, relación 1:1 `procesos_sitio_auditoria → turnos_sitio_auditoria`, sin procesos vinculados al sitio físico, sin asignación granular de auditores por sitio/proceso y sin control de días-auditor `tiempo_auditoria`). Asimismo, las vistas `programacionView.ts`, `calendarioView.ts` y `resultadoView.ts` aún conservaban patrones heredados (modales de creación, botones dentro de `<td>`, barras de filtros heterogéneas).

Esta reconstrucción introduce **cinco pilares estructurales**:
1. **Jerarquía Completa de Sitio (`procesos_por_sitio`):** Paralelo a `turnos_por_sitio`, cada `sitio` declara explícitamente qué `proceso` del certificado opera en esa sede física, con validación cruzada de certificado en PostgreSQL.
2. **Muestreo Granular `Sitio → Proceso → 1..N Turnos`:** Desacopla `procesos_sitio_auditoria` de una relación 1:1 rígida con un único turno mediante la tabla puente `turnos_proceso_sitio_auditoria`, permitiendo evaluar un mismo proceso en múltiples turnos del sitio.
3. **Asignación Flexible de Auditores y Balanceo Dual de Días (`tiempo_auditoria`):** Incorpora `equipo_auditor_sitio` (asignación y días por auditor en cada sitio) y `equipo_auditor_proceso_sitio` (co-evaluación M:N por proceso dentro del sitio), sincronizados con `equipo_auditor` para mantener compatibilidad intacta con las políticas RLS existentes.
4. **Borradores Progresivos y Máquina Dual Estado/Etiquetas:** Permite guardar auditorías parciales en cualquier etapa de planificación mediante columnas `NULLABLE`, separando el **estado de ciclo persistido en BD** (`estado_ciclo`) de las **etiquetas dinámicas calculadas en tiempo real** (`tag_planificacion`, `% asignación`, `cuadre días`, `Atrasada / Vencida`).
5. **Estandarización Total UI/UX del Bloque 1 + Planificador Visual con Contexto Histórico:** Unifica `Programación`, `Calendario` (Multi View de 3 modos con **Calendario** por defecto) y `Resultado` bajo `universalTemplate.ts` + `detailTemplate.ts` (`'read' | 'add' | 'edit'`), integrando el **Constructor Visual Tipo Árbol/Acordeón** y el panel colapsable **"Historial del Certificado"** para continuidad multisitio y rotación ISO/IEC 17021-1.

---

## 2. Arquitectura Relacional Propuesta (Evolución ER)

### 2.1 Diagrama Entidad-Relación Objetivo

```text
certificado (1) ──┬──< sitio (N) ──┬──< turnos_por_sitio (N) ───────────────────────┐
                  │                └──< procesos_por_sitio (N) [NUEVA] ────────────┐│
                  │                                                                ││
                  ├──< proceso (N) ────────────────────────────────────────────────┘│
                  │                                                                 │
                  └──< auditoria (N) [Borrador progresivo: campos NULLABLE + tiempo_auditoria]
                         │
                         ├──< equipo_auditor (N:M resumen/RLS: id_auditoria, id_auditor, rol_auditor)
                         │
                         └──< sitios_por_auditoria (N) [+ tiempo_auditoria NUMERIC(6,2)]
                                │
                                ├──< turnos_sitio_auditoria (N) ──> turnos_por_sitio
                                │      ▲
                                │      └────< turnos_proceso_sitio_auditoria (N:M) [NUEVA]
                                │               ▲
                                ├──< procesos_sitio_auditoria (N) [REDISEÑADA]
                                │      │   (FK id_procesos_por_sitio + id_proceso validado)
                                │      └──< equipo_auditor_proceso_sitio (N:M) [NUEVA]
                                │
                                └──< equipo_auditor_sitio (N:M) [NUEVA]
                                       (+ tiempo_auditoria NUMERIC(6,2), asignacion_completa_sitio BOOLEAN)
```

### 2.2 Invariantes de Integridad Subconjunto (PostgreSQL Triggers)

| Tabla | Regla de Integridad Validada en Trigger (`BEFORE INSERT OR UPDATE`) |
| :--- | :--- |
| `procesos_por_sitio` | `sitio.id_certificado = proceso.id_certificado` (ambos activos `deleted_at IS NULL`). |
| `sitios_por_auditoria` | `auditoria.id_certificado = sitio.id_certificado`. |
| `turnos_sitio_auditoria` | `turnos_por_sitio.id_sitio = sitios_por_auditoria.id_sitio`. |
| `procesos_sitio_auditoria` | `procesos_por_sitio.id_sitio = sitios_por_auditoria.id_sitio` y `procesos_por_sitio.id_proceso = NEW.id_proceso` (auto-alineado desde `procesos_por_sitio`). |
| `turnos_proceso_sitio_auditoria` | `procesos_sitio_auditoria.id_sitios_por_auditoria = turnos_sitio_auditoria.id_sitios_por_auditoria` (mismo sitio de la misma auditoría). |
| `equipo_auditor_proceso_sitio` | `auditor` activo y `procesos_sitio_auditoria` activo. Además trigger/sincronización idempotente garantiza presencia del auditor en `equipo_auditor` de la `auditoria` padre para coherencia RLS. |
| `equipo_auditor_sitio` | `sitios_por_auditoria` activo, `tiempo_auditoria >= 0` en múltiplos de `0.25` días, y sincronización hacia `equipo_auditor`. |

---

## 3. Máquina de Estados: Ciclo Persistido vs Etiquetas Dinámicas (`Tags`)

Se separa estrictamente lo que el usuario/flujo persiste en `public.auditoria.estado_ciclo` de los indicadores derivados calculados por el motor puro `src/lib/auditPlanningEngine.ts`:

```text
                    [Estados Persistidos en BD: auditoria.estado_ciclo]

  ┌──────────────┐   datos mínimos   ┌─────────────────┐   100% completo   ┌────────────┐
  │   Borrador   │ ────────────────> │ En Programación │ ────────────────> │ Programada │
  └──────────────┘                   └─────────────────┘                   └────────────┘
         │                                    │                                   │
         │                                    │                                   ▼
         │                                    │                           ┌──────────────┐
         │                                    │   reprogramar fecha       │ En Ejecución │
         │                                    ├─────────────────────────> └──────────────┘
         │                                    │                                   │
         │                                    ▼                                   ▼
         │                            ┌──────────────┐                    ┌──────────────┐
         └──────────────────────────> │  Cancelada   │                    │   Auditada   │
                                      └──────────────┘                    └──────────────┘
                                             ▲                                    ▲
                                             └─────── Reprogramada ───────────────┘

        [Etiquetas Dinámicas Calculadas (computeAuditPlanningStatus, no bloquean guardado)]
  - `Borrador / En Programación`: falta fecha, tipo, metodología o sitios en alcance.
  - `Parcialmente Asignada`: hay sitios pero falta ≥1 proceso, ≥1 turno de proceso, ≥1 auditor o hay desfase de días (`delta !== 0`).
  - `Programada / Lista`: todos los campos maestros completos + cada sitio tiene procesos + cada proceso tiene ≥1 turno y ≥1 auditor + `cuadre === 0`.
  - `Atrasada / Vencida` (alerta superpuesta): `(fecha_fin ?? fecha_programacion) < hoy` y `estado_ciclo NOT IN ('Auditada', 'Cancelada')`.
```

---

## 4. Reglas de Balanceo Dual de Días-Auditor (`tiempo_auditoria`)

Toda duración de auditoría se expresa en **días decimales (`NUMERIC(6,2)`)** con granularidad mínima de **`0.25d`** (cuarto de día: `0.25`, `0.50`, `0.75`, `1.00`, etc.) para alinear con guías IAF MD 5:

1. **Cubo 1 — Demanda Planificada por Sitio y Total Auditoría:**
   - Cada `sitios_por_auditoria` define `tiempo_auditoria >= 0` (ej. *Sitio 0 Sede Principal = 2.00d*, *Sitio 1 Planta Valencia = 3.00d*).
   - `auditoria.tiempo_auditoria` representa el total planificado de la auditoría (`Σ sitios_por_auditoria.tiempo_auditoria`, permitiendo también meta contractual de referencia).
2. **Cubo 2 — Asignación de Capacidad por Auditor y Sitio:**
   - Cada `equipo_auditor_sitio` registra `tiempo_auditoria >= 0` asignado a ese auditor en ese sitio específico (ej. en *Sitio 0*: *Auditor Líder = 1.50d*, *Auditor Técnico = 0.50d* → Suma Cubo 2 Sitio 0 = `2.00d`).
   - Un mismo auditor puede trabajar jornadas distintas en diferentes sitios de la misma auditoría; su carga total en la auditoría es la suma de sus filas activas en `equipo_auditor_sitio`.
3. **Invariante de Cuadre (Informativo y No Bloqueante):**
   - Por Sitio: `delta_sitio = asignado_sitio - requerido_sitio`.
     - `delta === 0` y `requerido > 0` → `Cuadrado ✓` (`emerald`).
     - `delta < 0` → `Faltan {abs(delta)}d` (`amber`).
     - `delta > 0` → `Exceso +{delta}d` (`rose`).
   - Global de Auditoría: `Σ asignado_sitios` vs `Σ requerido_sitios` (y contraste contra `auditoria.tiempo_auditoria` si difiere).
   - **Regla UX clave:** El desfase de días **nunca bloquea el guardado progresivo**, pero impide que la etiqueta automática ascienda a `Programada / Lista`.

---

## 5. Decisiones UX: Planificador Visual Jerárquico y Contexto Histórico

1. **Panel Colapsable "Historial del Certificado" dentro del Detail View de `Auditoría`:**
   - Visible inmediatamente al seleccionar/tener un `id_certificado` tanto en `'read'`, `'add'` como `'edit'`.
   - Muestra en línea de tiempo compacta las auditorías previas del certificado: código, tipo, metodología, fechas, sitios visitados, procesos auditados, turnos cubiertos y equipo auditor con días por sede.
   - Destaca automáticamente:
     - **Alertas de Rotación ISO/IEC 17021-1:** Si el Auditor Líder propuesto ha liderado 3+ ciclos consecutivos previos en el mismo certificado.
     - **Procesos Pendientes / No Cubiertos Recientemente:** Procesos activos del certificado ausentes en la última auditoría para orientar el muestreo multisitio y de seguimiento.
2. **Constructor Visual Tipo Árbol/Acordeón (`Certificado → Sitios → Procesos → Turnos → Auditores + Días`):**
   - Cada `sitio` del certificado aparece como nodo de acordeón seleccionable con interruptor de inclusión, input numérico `0.25d` (Cubo 1) y badge de cuadre en vivo.
   - Dentro de un sitio incluido:
     - **Checklist de `Procesos del Sitio`** alimentada estrictamente por `procesos_por_sitio` del sitio (con acceso rápido a alerta si el sitio aún no tiene procesos configurados en `Sitio`).
     - **Chips multi-selección de `Turnos`** por cada proceso marcado, filtrados desde `turnos_por_sitio` de ese sitio.
     - **Asignación de Auditores Competentes (2 modos complementarios):**
       - *Modo Rápido (1 clic):* **"Asignar a todo el Sitio"** (marca `asignacion_completa_sitio = TRUE` y cubre todos los procesos del sitio automáticamente).
       - *Modo Granular:* Matriz/chips **"Asignar por Proceso"** (`equipo_auditor_proceso_sitio`) que permite co-evaluación multi-auditor sin exclusividad 1:1.
     - **Inputs de Días por Auditor en el Sitio (Cubo 2):** Slider/stepper `0.25d` + barra superior de balanceo en tiempo real.
3. **Calendario como Multi View de 3 Modos (`[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]`):**
   - En `#auditorias/calendar`, el modo por defecto es **Calendario** (conservando sub-modos `Mes` / `Trimestre` / `Cronograma`), compartiendo la barra superior unificada, el buscador único `type="text"`, el totalizador `"Mostrando X de Y"` y el panel lateral colapsable de facetas $S_{-k}$ con `Tarjetas` y `Tabla` (`table-fixed`).

---

## 6. Gobernanza, Seguridad y Mandatos Obligatorios en Todos los Pasos

- **Soft-Delete Exclusivo:** `REVOKE DELETE` + `fn_prevent_hard_delete` + `archive_record` + `get_archive_dependency_summary` + `fn_guard_parent_archival` + `PROTECTED_SOFT_DELETE_TABLES` para **todas** las nuevas tablas (`procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`).
- **Mandato Cero-UUID:** Cero UUIDs en texto visible, `title`, `aria-label`, `placeholder`, `value` o breadcrumbs (`assertValidUuid()` obligatorio antes de mutaciones SQL; `assertZeroUuidExposure()` en pruebas).
- **RBAC Estricto:** Solo `ADMIN` y `WORKER` (`status === 'APPROVED'`) mutan planificación/catálogos; `AUDITOR` opera lectura contextual + ejecución en sus auditorías asignadas; `CLIENT` solo lectura de auditorías de sus organizaciones aprobadas en `client_organization_access`; solo `ADMIN` ve `"Mostrar Archivados"` y ejecuta `Restaurar`.
- **Calidad de Código:** TypeScript `strict: true`, `0 any`, lógica pura en `src/lib/` testeada con `node:test`, vistas declarativas con `escapeHtml()` en `src/views/`, cero botones dentro de `<tbody>` en tablas `table-fixed`.

---

## 7. Índice Maestro de Pasos

| Paso | Archivo | Foco Principal | Entregables Clave |
| :--- | :--- | :--- | :--- |
| **1.1** | [`step_1.1.md`](./step_1.1.md) | Esquema SQL, Triggers e Índices | `procesos_por_sitio`, rediseño `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, borradores `auditoria`, triggers subconjunto, soft-delete e índices parciales. |
| **1.2** | [`step_1.2.md`](./step_1.2.md) | RLS, DCL, RPCs y Semillero Histórico | `REVOKE DELETE`, `archive_record`, `get_archive_dependency_summary`, políticas RLS 4 roles, actualización `02_cobertura_normativa.sql` si aplica y `06_datos_prueba.sql` multi-auditoría histórica. |
| **2.1** | [`step_2.1.md`](./step_2.1.md) | `Sitio` Processes + Dominio Puro Auditoría | Tab `Procesos del Sitio` (`sitioDomain.ts` + `sitioView.ts`), contratos y motor puro `auditPlanningEngine.ts` (estados vs tags, cuadre dual-bucket, historial y rotación), pruebas unitarias. |
| **2.2** | [`step_2.2.md`](./step_2.2.md) | Hidratación, Gobernanza y Persistencia | Carga paginada en `src/main.ts`, `PROTECTED_SOFT_DELETE_TABLES`, `BreadcrumbEntityType`, RPCs/upserts progresivos y pruebas de gobernanza. |
| **3.1** | [`step_3.1.md`](./step_3.1.md) | Multi Views Bloque 1 Estandarizados | Directorio `Programación` limpio, `Calendario` 3-modos (`Calendario | Tarjetas | Tabla`, defecto Calendario) y alineación `Resultado` bajo `universalTemplate.ts`. |
| **3.2** | [`step_3.2.md`](./step_3.2.md) | Detail Views Unificados en 3 Zonas | Detail Views `'read' | 'add' | 'edit'` para `Auditoria` y sub-entidades (`detailTemplate.ts`, top Guardar-first/Cancelar-second, sin botones al pie, toast `#archiveGovernanceToast`, breadcrumbs 1 línea). |
| **4.1** | [`step_4.1.md`](./step_4.1.md) | Planificador Visual y Contexto Histórico | `auditPlannerView.ts` (Árbol/Acordeón `Certificado → Sitios → Procesos → Turnos → Auditores + Días`, modos Rápido/Granular, barra de cuadre) + panel **"Historial del Certificado"**. |
| **Final** | [`step_final.md`](./step_final.md) | Cierre Integral y Documentación | `npm test`, `npm run lint` (`0 any`), `npm run build`, auditoría Cero-UUID, `POST /api/reset-db`, verificación Chromium E2E 4 roles y actualización obligatoria de `public/doc/`. |
