# Roadmap Maestro — Bloque 1 (`Auditoría`): Vinculación en Dos Niveles, Multi-Fecha 1:N, Planificación Relacional y Alertas Configurables

Este directorio define el plan de implementación completo, modular y atómico para reconstruir el **Bloque 1 (`Auditoría`: Programación, Calendario y Resultado)** y su infraestructura relacional en **`Sitio` (`procesos_por_sitio`)**, preservando el 100% de las garantías de seguridad, tipado estricto (`strict: true`, `0 any`), patrón **Universal Multi View / Detail View en 3 Zonas**, **Mandato Cero-UUID** y gobernanza **Soft-Delete / Audit Log** documentados en `public/doc/`.

---

## 1. Resumen Ejecutivo y Evolución Arquitectónica

La arquitectura previa de `Auditoría` asumía erróneamente a `auditoria` (1 certificado único con fechas planas `fecha_programacion` y `fecha_reprogramacion`) como entidad raíz del dominio. En la operación real de un Organismo de Certificación bajo ISO/IEC 17021-1, múltiples certificados —de la misma organización o de organizaciones distintas— se planifican y ejecutan de forma coordinada, evolucionan de naturaleza entre ciclos y atraviesan múltiples revisiones de fechas (pre-programación por mes/año y reprogramaciones reales).

Esta reconstrucción introduce **siete pilares estructurales integrados**:

1. **Entidad Maestra Superior de Vinculación (`public.programa_auditoria`):**
   - Se sitúa **por encima** de las filas individuales de `auditoria` y `certificado` para orquestar agrupaciones en **dos niveles** (o modo individual):
     - **Individual (`INDIVIDUAL`):** 1 organización, 1 certificado, 1 `auditoria` sin vinculación externa (`tipo_vinculacion = 'Individual'`).
     - **Nivel 1 — Intra-Organización (`NIVEL_1_INTRA_ORG`):** agrupa `2..N` certificados de la **misma organización** (ej. *Example, C.A.* con `SGC + SGA + SGSST`) bajo una etiqueta descriptiva (ej. `Planta Santa Cruz`) y naturaleza explícita.
     - **Nivel 2 — Inter-Organización (`NIVEL_2_INTER_ORG`):** vincula certificados y auditorías entre **dos o más organizaciones distintas** (ej. grupo corporativo / empresa conjunta) ejecutadas en una campaña coordinada, conservando el aislamiento estricto por organización en RLS para clientes.
   - **Taxonomía de Naturaleza de Vinculación (`tipo_vinculacion`):**
     - `Individual`: auditoría aislada de un único certificado.
     - `Combinada`: misma visita a 2+ normas distintas en una empresa que mantiene procesos y documentación separados.
     - `Integrada`: evaluación de un Sistema Integrado de Gestión (múltiples normas en un manual único, revisión por la dirección compartida y procesos comunes).
     - `Conjunta`: auditoría a la misma organización ejecutada en equipo por 2+ Organismos de Certificación distintos.
     - `Simultánea`: misma visita cubriendo alcances o sectores IAF distintos de una empresa que generan certificados separados de la misma norma.
     - `Multientidad`: auditoría simultánea a distintas empresas de un mismo grupo corporativo que no comparten procesos ni sistemas de gestión.
     - `Multisitio`: auditoría a un grupo o empresa con función central común y sedes/operaciones sujetas a muestreo.
   - **Evolución entre Ciclos:** cada ciclo anual crea su propio `programa_auditoria` (con referencia opcional `id_ciclo_origen`), permitiendo que un cliente evaluado en Año 1 como `Combinada` (`SGC + SGA`) evolucione limpiamente en Año 2 a `Integrada` sin corromper su historial.
   - **Preservación de `auditoria` por Certificado:** cada certificado participante conserva su fila `auditoria` (`id_programa_auditoria` + `id_certificado`), garantizando trazabilidad intacta de hallazgos, competencias (`auditor_esta_calificado`), `cobertura_normativa_certificado`, sitios/procesos/turnos y aislamiento RLS por organización.

2. **Arquitectura Relacional Multi-Fecha 1:N (`public.auditoria_fecha`):**
   - Se **eliminan** las columnas planas `fecha_programacion` y `fecha_reprogramacion` de `public.auditoria`.
   - Toda programación temporal vive en la tabla hija 1:N `public.auditoria_fecha`, soportando dos modos de precisión:
     - **`PREPROGRAMADA_MES`:** estimación anticipada por **Mes + Año** (`anio`, `mes`) cuando aún no existen días exactos de calendario.
     - **`REAL`:** rango calendario exacto (**Fecha Inicio → Fecha Fin**, `fecha_inicio <= fecha_fin`).
   - Cada fila registra **`numero_secuencia`** (`>= 1`, orden cronológico), **`tag`** (`'Programación' | 'Reprogramación'`) y **`observacion`** (motivo o comentario de cambio). La **fecha vigente** es siempre la entrada activa con `MAX(numero_secuencia)`.
   - **Días-Auditor vs. Rango Calendario Real:** distingue los días-auditor requeridos/asignados (`tiempo_auditoria` en `0.25d`) de la duración física en días calendario (`fecha_inicio..fecha_fin`). Por ejemplo, `6.00 días-auditor` ejecutados por `2 auditores` (`3.00d` c/u) pueden ejecutarse perfectamente en un rango real de `3 días calendario`.

3. **Rediseño de `Programación` (Flujo en 2 Pasos + Filtro de Certificados Sin Programar):**
   - **Multi View:** lista maestra de campañas (`programa_auditoria`) e individuales bajo `universalTemplate.ts`, acompañada de un filtro/vista operativa para detectar **certificados sin auditoría programada**, filtrable por `certificado.estatus` (`Activo`, `Estudio`, `Suspendido`, `Planificado`, `En Espera`, etc.).
   - **Detail View en 2 Pasos (dentro de `detailTemplate.ts` `'read' | 'add' | 'edit'`):**
     - **Paso 1:** vincular certificados (Individual / Nivel 1 / Nivel 2), asignar etiqueta descriptiva, naturaleza (`tipo_vinculacion`) y seleccionar el tipo de auditoría y metodología por cada certificado.
     - **Paso 2 ("The Hard Magic"):** gestor de fechas 1:N + planificador visual jerárquico por cada certificado (`Sitios → Procesos del Sitio → 1..N Turnos → Auditores + Días 0.25d`), balanceo dual-bucket vs rango calendario real, panel **"Historial del Certificado"** y rotación ISO/IEC 17021-1.

4. **Jerarquía Completa de Sitio (`procesos_por_sitio`) y Muestreo `Sitio → Proceso → 1..N Turnos`:**
   - Cada `sitio` declara sus procesos operativos en `procesos_por_sitio` (espejo de `turnos_por_sitio`), validado por certificado en PostgreSQL.
   - `procesos_sitio_auditoria` se desacopla de un único turno mediante la tabla puente `turnos_proceso_sitio_auditoria` (`1..N` turnos).

5. **Asignación Flexible de Auditores y Balanceo Dual de Días (`tiempo_auditoria`):**
   - `equipo_auditor_sitio` (días por auditor en sede + modo rápido *"Asignar a todo el Sitio"*) y `equipo_auditor_proceso_sitio` (co-evaluación M:N por proceso), sincronizados con `equipo_auditor` para mantener compatibilidad RLS.

6. **Borradores Progresivos y Máquina Dual Estado/Etiquetas:**
   - Permite guardar en cualquier paso del flujo (`Borrador`, `En Programación`, etc.) sin bloquear por datos pendientes o desfases, calculando etiquetas dinámicas en tiempo real (`computeAuditPlanningStatus`).

7. **Sección `Calendario` Unificada y Alertas Inteligentes Configurables (`configuracion_alerta_auditoria`):**
   - Multi View de 3 modos (`[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]`, Calendario por defecto) que renderiza cada campaña vinculada como **evento coordinado** (con soporte tanto para rangos `REAL` usando `MAX(numero_secuencia)` como para chips/bandas `PREPROGRAMADA_MES`).
   - Motor de alertas con umbrales persistidos y editables (`ADMIN`/`WORKER`): auditorías próximas (desde última fecha real), auditorías pre-programadas por mes/año sin confirmar al acercarse la ventana, atrasadas, conflictos de doble asignación de auditor en fechas superpuestas, desfases de días y rotación de Auditor Líder.

---

## 2. Arquitectura Relacional Objetivo (Diagrama ER)

```text
organizacion (1) ──< certificado (N) ──┬──< sitio (N) ──┬──< turnos_por_sitio (N) ─────────────────────┐
                                       │                └──< procesos_por_sitio (N) [NUEVA] ──────────┐│
                                       ├──< proceso (N) ──────────────────────────────────────────────┘│
                                       │                                                               │
programa_auditoria (1) [NUEVA]         │                                                               │
  │ (Individual / Nivel 1 / Nivel 2;   │                                                               │
  │  etiqueta, tipo_vinculacion)       │                                                               │
  └──< auditoria (N) ──────────────────┘ [SIN fecha_programacion / fecha_reprogramacion]               │
         │                                                                                             │
         ├──< auditoria_fecha (N) [NUEVA 1:N: numero_secuencia, tag, PREPROGRAMADA_MES | REAL]         │
         ├──< equipo_auditor (N:M resumen/RLS: id_auditoria, id_auditor, rol_auditor)                  │
         └──< sitios_por_auditoria (N) [+ tiempo_auditoria NUMERIC(6,2), modalidad]                    │
                │                                                                                      │
                ├──< turnos_sitio_auditoria (N) ──> turnos_por_sitio ◄─────────────────────────────────┘
                │      ▲
                │      └────< turnos_proceso_sitio_auditoria (N:M) [NUEVA]
                │               ▲
                ├──< procesos_sitio_auditoria (N) [REDISEÑADA: id_procesos_por_sitio + id_proceso]
                │      └──< equipo_auditor_proceso_sitio (N:M) [NUEVA]
                │
                └──< equipo_auditor_sitio (N:M) [NUEVA: tiempo_auditoria 0.25d, asignacion_completa_sitio]

configuracion_alerta_auditoria (1) [NUEVA: umbrales configurables de alertas del calendario]
```

### 2.1 Invariantes de Integridad en PostgreSQL (Triggers `BEFORE INSERT OR UPDATE`)

| Tabla | Regla de Integridad Validada en PostgreSQL |
| :--- | :--- |
| `programa_auditoria` / `auditoria` | Si `nivel_vinculacion = 'INDIVIDUAL'`, máximo `1` auditoría activa por programa y `tipo_vinculacion = 'Individual'`. Si `nivel_vinculacion = 'NIVEL_1_INTRA_ORG'`, todas las auditorías activas del programa deben pertenecer a la **misma `organizacion`** vía `certificado.id_organizacion`. Si `nivel_vinculacion = 'NIVEL_2_INTER_ORG'`, se permiten `2+` organizaciones distintas. |
| `auditoria_fecha` | `tipo_fecha = 'PREPROGRAMADA_MES'` exige `anio` y `mes (1..12)` sin `fecha_inicio`/`fecha_fin`. `tipo_fecha = 'REAL'` exige `fecha_inicio` y `fecha_fin >= fecha_inicio`. `(id_auditoria, numero_secuencia)` único entre activas. |
| `procesos_por_sitio` | `sitio.id_certificado = proceso.id_certificado` (ambos activos `deleted_at IS NULL`). |
| `sitios_por_auditoria` | `auditoria.id_certificado = sitio.id_certificado`. |
| `turnos_sitio_auditoria` | `turnos_por_sitio.id_sitio = sitios_por_auditoria.id_sitio`. |
| `procesos_sitio_auditoria` | `procesos_por_sitio.id_sitio = sitios_por_auditoria.id_sitio` y `NEW.id_proceso := procesos_por_sitio.id_proceso`. |
| `turnos_proceso_sitio_auditoria` | `procesos_sitio_auditoria.id_sitios_por_auditoria = turnos_sitio_auditoria.id_sitios_por_auditoria`. |
| `equipo_auditor_sitio` / `equipo_auditor_proceso_sitio` | Auditor activo + sitio/proceso activo + `tiempo_auditoria` en múltiplos de `0.25d` + sincronización idempotente hacia `equipo_auditor` para coherencia RLS. |

---

## 3. Reglas de Fechas 1:N, Balanceo Dual-Bucket y Rango Calendario

1. **Resolución de Fecha Vigente:**
   - Para cualquier `auditoria`, su estado temporal vigente proviene del registro activo en `auditoria_fecha` con mayor `numero_secuencia`.
   - Toda reprogramación agrega una nueva fila (`numero_secuencia = anterior + 1`, `tag = 'Reprogramación'`, `observacion` descriptiva) conservando la historia completa.
2. **Cubo 1 (Demanda) vs. Cubo 2 (Capacidad) vs. Rango Calendario:**
   - **Cubo 1:** `Σ sitios_por_auditoria.tiempo_auditoria` (`0.25d` pasos).
   - **Cubo 2:** `Σ equipo_auditor_sitio.tiempo_auditoria` (`0.25d` pasos).
   - **Cuadre:** `delta = asignado_sitio - requerido_sitio` (`0` = `Cuadrado ✓`, `< 0` = faltan días, `> 0` = exceso; **nunca bloquea el guardado progresivo**).
   - **Compatibilidad de Rango Real:** si la fecha vigente es `REAL` (`fecha_inicio..fecha_fin`), `diasCalendario = (fecha_fin - fecha_inicio) + 1`. Cada auditor no debería superar `diasCalendario * 1.00` días dentro del mismo evento (alerta informativa/validación), mientras la suma de todos los auditores puede ser `N auditores × diasCalendario` (ej. `2 auditores × 3.00d = 6.00 días-auditor` en un span de `3 días calendario`).

---

## 4. Gobernanza, Seguridad y Mandatos Obligatorios en Todos los Pasos

- **Soft-Delete Exclusivo:** `REVOKE DELETE` + `fn_prevent_hard_delete` + `archive_record` + `get_archive_dependency_summary` + `fn_guard_parent_archival` + `PROTECTED_SOFT_DELETE_TABLES` para **todas** las nuevas tablas (`programa_auditoria`, `auditoria_fecha`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`). `configuracion_alerta_auditoria` opera como configuración singleton/activa con auditoría en `audit_log` y sin `DELETE` físico.
- **Mandato Cero-UUID:** Cero UUIDs en texto visible, `title`, `aria-label`, `placeholder`, `value` o breadcrumbs (`assertValidUuid()` obligatorio antes de mutaciones SQL; `assertZeroUuidExposure()` en pruebas).
- **RBAC Estricto + Aislamiento Nivel 2:**
  - Solo `ADMIN` y `WORKER` (`status === 'APPROVED'`) mutan programas, fechas 1:N, planificación y umbrales de alerta.
  - `AUDITOR` ve únicamente las auditorías donde está asignado en `equipo_auditor` y su `programa_auditoria` contenedor (sin exponer certificados no asignados).
  - `CLIENT` ve únicamente las auditorías de sus organizaciones aprobadas en `client_organization_access`; en programas **Nivel 2 Inter-Organización**, el cliente de la *Organización A* **jamás** accede a certificados, sitios ni resultados de la *Organización B*.
  - Solo `ADMIN` ve `"Mostrar Archivados"` y ejecuta `Restaurar`.
- **Calidad de Código y UI:** TypeScript `strict: true`, `0 any`, `universalTemplate.ts` (`table-fixed` + `<colgroup>` suma 100%, `0 <button>` en `<tbody>`), `detailTemplate.ts` en 3 Zonas (`'read' | 'add' | 'edit'`, Guardar-primero / Cancelar-segundo arriba, cero botones al pie, `#archiveGovernanceToast`, breadcrumbs 1 línea `<= 24` chars).

---

## 5. Índice Maestro de Pasos

| Paso | Archivo | Foco Principal | Entregables Clave |
| :--- | :--- | :--- | :--- |
| **1.1** | [`step_1.1.md`](./step_1.1.md) | Esquema SQL, Triggers e Índices | `programa_auditoria`, refactorización `auditoria` (sin fechas planas), `auditoria_fecha` 1:N, `configuracion_alerta_auditoria`, `procesos_por_sitio`, rediseño `procesos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`, triggers e índices parciales. |
| **1.2** | [`step_1.2.md`](./step_1.2.md) | RLS 4 Roles, DCL, RPCs y Semillero | `REVOKE DELETE`, `archive_record`, `get_archive_dependency_summary`, RLS con aislamiento Nivel 2 inter-org, compatibilidad `02_cobertura_normativa.sql` y `06_datos_prueba.sql` (Individual, Nivel 1 Combinada→Integrada, Nivel 2 Multientidad, fechas 1:N y `PREPROGRAMADA_MES`). |
| **2.1** | [`step_2.1.md`](./step_2.1.md) | `Sitio` Processes + Motores Puros | Tab `Procesos del Sitio` (`sitioDomain.ts` + `sitioView.ts`); `auditPlanningEngine.ts` (vinculación 2 niveles, fechas 1:N `MAX(numero_secuencia)`, span calendario vs días-auditor, conflictos de agenda, certificados sin programar por `estatus`, alertas configurables, rotación e historial) + pruebas `node:test`. |
| **2.2** | [`step_2.2.md`](./step_2.2.md) | Hidratación, Gobernanza y Persistencia | Carga paginada (`programa_auditoria`, `auditoria`, `auditoria_fecha`, `configuracion_alerta_auditoria`, árbol), `PROTECTED_SOFT_DELETE_TABLES`, `BreadcrumbEntityType`, persistencia transaccional Paso 1/Paso 2 y sincronización de tests de migración SQL/RLS. |
| **3.1** | [`step_3.1.md`](./step_3.1.md) | Multi Views Bloque 1 + Alertas Calendario | `Programación` (campañas + filtro de certificados sin programar por `estatus`), `Calendario` 3-modos (`Calendario | Tarjetas | Tabla`, eventos unificados de grupo, `PREPROGRAMADA_MES`, bandeja de alertas + configuración de umbrales) y `Resultado` bajo `universalTemplate.ts`. |
| **3.2** | [`step_3.2.md`](./step_3.2.md) | Detail View en 2 Pasos (`detailTemplate.ts`) | Detail View `'read' | 'add' | 'edit'` para `programa_auditoria`: **Paso 1** (vinculación Individual/Nivel 1/Nivel 2, etiqueta, taxonomía, selección de certificados y tipos) + **Paso 2** (selector por certificado, historial de fechas 1:N con `Programación`/`Reprogramación` y sincronización grupal) + `sitioAuditoriaView.ts`. |
| **4.1** | [`step_4.1.md`](./step_4.1.md) | Planificador Visual Paso 2 e Historial | `auditPlannerView.ts` (Árbol `Sitios → Procesos → Turnos → Auditores + Días`, validación Días-Auditor vs Rango Calendario Real y conflictos de agenda) + **"Historial del Certificado"** con evolución de ciclo (`Combinada → Integrada`) y rotación ISO/IEC 17021-1. |
| **Final** | [`step_final.md`](./step_final.md) | Cierre Integral, E2E y Documentación | `npm test`, `npm run lint` (`0 any`), `npm run build`, Cero-UUID, `POST /api/reset-db`, E2E Chromium 4 roles (incl. aislamiento Nivel 2, 1:N reprogramación, pre-programación mes/año, alertas configurables) y sincronización de `public/doc/`. |
