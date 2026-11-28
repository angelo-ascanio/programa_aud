# Paso 3.1 — Ruta `#database-sync`, Menú `ADMIN`, RBAC y Vista `Sincronización SQL`

> **Objetivo:** Incorporar la nueva sección **`Sincronización SQL`** (`#database-sync`) en el menú administrativo exclusivo de `ADMIN`, blindar las guardias RBAC de navegación y construir el componente declarativo `src/views/databaseSeedSyncView.ts` con los 3 bloques (`Auditoría`, `Certificación`, `Extra`), selección por sección o por bloque completo, indicadores de cascada Padre→Hijos y vista previa limpia.

---

## 1. Archivos Exactos a Crear o Modificar

- **Modificar:**
  - `src/lib/healthCheck.ts` (ampliar `ActiveRoute` con `'database-sync'` y actualizar `canAccessRoute` con `evaluateAdminAccess(profile).allowed`).
  - `src/lib/accessControl.ts` (reconocer `'database-sync'` en `parseHashRouteString` y guardias de subvista).
  - `src/views/header.ts` (agregar ítem **`🔄 Sincronización SQL`** con `data-nav="database-sync"` en el bloque `isAdmin`, justo debajo de `Respaldo DB`).
- **Crear:**
  - `src/views/databaseSeedSyncView.ts`
  - `src/views/databaseSeedSyncView.test.ts`
- **Actualizar si aplica por aserciones de navegación/menú:**
  - `src/lib/phase21NavigationShell.test.ts`, `src/lib/accessControl.test.ts`, `src/lib/healthCheck.test.ts`.
- **No modificar aún en este paso:** `src/main.ts` (se conecta en Paso 3.2).

---

## 2. Reglas Técnicas Clave

1. **Ubicación y RBAC en Navegación (`header.ts`, `healthCheck.ts`, `accessControl.ts`):**
   - `ActiveRoute` pasa a incluir `'database-sync'`.
   - `canAccessRoute(profile, 'database-sync')` retorna `true` **únicamente** cuando `evaluateAdminAccess(profile).allowed === true` (`ADMIN` + `APPROVED`).
   - En `src/views/header.ts`, dentro del bloque `isAdmin` del menú desplegable de usuario (junto a `🩺 Estado DB` y `🗄️ Respaldo DB`), renderizar:
     - `data-nav="database-sync"`, `data-nav-reset="true"`, etiqueta **`Sincronización SQL`**, icono `🔄`, tooltip `"Sincronizar cambios de base de datos hacia 06_datos_prueba.sql y 07_normas_requisitos_csv.sql"`.
   - Para `WORKER`, `AUDITOR` y `CLIENT`, el botón **no debe renderizarse** en el DOM.

2. **Diseño Visual "Less Is More" en `src/views/databaseSeedSyncView.ts`:**
   - Sigue la estructura limpia de `databaseBackupView.ts` y `databaseStatusView.ts` (`max-w-[1720px]`, tarjetas con borde suave `border-slate-200`, botones accesibles, 100% en **español**, **Zero-UUID** en etiquetas operativas).
   - **Panel de Selección de los 3 Bloques (`Auditoría`, `Certificación`, `Extra`):**
     - Controles rápidos en cabecera: `"Seleccionar Todo"`, `"Limpiar Selección"`, y toggle `"Incluir dependencias padre (FK) faltantes"` (activo por defecto).
     - **3 Tarjetas / Columnas de Bloques:** cada bloque tiene:
       - Checkbox maestro de bloque (`data-action="toggle-sync-block"`, `data-block-id="auditorias|certificacion|extra"`) con soporte visual para estado parcial (`indeterminate`) vs completo.
       - Lista de secciones seleccionables (`data-action="toggle-sync-section"`, `data-section-id="..."`):
         - En **`Auditoría`**: `Calendario`, subgrupo `1. Designación` (`1.1 Relación`, `1.2 Tipo`, `1.3 Fecha`, `1.4 Sitio`, `1.5 Temporal`), `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión`, `Resumen`.
         - En **`Certificación`**: `Conglomerado`, `Organización`, **`Certificado`** *(con insignia/subtexto claro de cascada automática: `Incluye Versiones, Alcance, Sitios, Fechas, Contactos, Procesos, Cláusulas y Turnos`)*, `Vínculo`, `Auditor` *(incluye Contacto y Evaluaciones In Situ)*, `Experto`.
         - En **`Extra`**: **`Norma`** *(con distintivo explícito: `Destino especial: 07_normas_requisitos_csv.sql`)*, `Sector IAF`, `Acreditación`, `Estatus`, `Tipo`, `Metodología`.
   - **Zona de Acción en 2 Pasos y Resultados:**
     - Botón primario Paso 1: **`🔍 Analizar Diferencias (Vista Previa)`** (`data-action="preview-sql-seed-sync"`).
     - Panel de resumen previsualizado: tarjetas resumen por archivo afectado (`06_datos_prueba.sql` / `07_normas_requisitos_csv.sql`), tabla `table-fixed` con `<colgroup>` sumando `100%` (`0 <button>` dentro de `<tbody>`) mostrando Tabla, Registros Nuevos, Modificados, Archivados/Enlaces, Sin Cambios y Ejemplos Legibles (sin UUIDs).
     - Visor colapsable (`<details>`) para inspeccionar el SQL generado antes de confirmar.
     - Advertencias claras (`warnings`), si existen.
     - Botón Paso 2 (habilitado solo tras previsualizar cambios reales): **`💾 Aplicar Sincronización a Archivos SQL`** (`data-action="apply-sql-seed-sync"`).
     - Banner de confirmación tras escribir en disco, con enlace opcional a `Respaldo DB` / `Reset DB` para validar reinicio.

---

## 3. Checklist de Verificación

- [ ] `Sincronización SQL` aparece en el menú de cuenta únicamente cuando `profile.role === 'ADMIN' && profile.status === 'APPROVED'`.
- [ ] `canAccessRoute` y `parseHashRouteString` soportan `'database-sync'` / `#/database-sync` y rechazan roles no-`ADMIN`.
- [ ] La vista muestra los 3 bloques exactos, todas las secciones, cascada Padre→Hijos de `Certificado` y distintivo especial `07_normas_requisitos_csv.sql` en `Extra → Norma`.
- [ ] Cumplimiento estricto Zero-UUID en tarjetas y tablas (`table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`).
- [ ] Ejecución exitosa de `npx tsx --test src/views/databaseSeedSyncView.test.ts src/lib/accessControl.test.ts src/lib/healthCheck.test.ts src/lib/phase21NavigationShell.test.ts` y `npm run lint`.
