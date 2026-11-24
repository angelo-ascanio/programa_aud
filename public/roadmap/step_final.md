# Paso Final: Verificación Integral QA, Playwright 4 Roles y Sincronización Documental

## Objetivo del Paso
Validar de extremo a extremo todo el sistema tras completar los Pasos 1.1–5.1: idempotencia SQL completa (`00`–`07.sql`), compilación TypeScript estricta, linter, suite unitaria completa, pruebas E2E reales en Chromium (Desktop `1440x900` y Mobile `390x844`) cubriendo los **4 roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`)**, y sincronización integral de la documentación técnica en `public/doc/`.

---

## Archivos Afectados
- `public/doc/project_resume.md`
- `public/doc/database_architecture.md`
- `public/doc/backend_api_security.md`
- `public/doc/frontend_architecture.md`
- `public/doc/testing_and_operations.md`
- Eventuales ajustes menores en tests (`src/**/*.test.ts` o scripts Playwright) si el QA E2E detecta un caso borde.

---

## Checklist Obligatorio de Verificación

### 1. Base de Datos e Idempotencia SQL (`00`–`07.sql`)
- Ejecutar reset completo de BD (vía `POST /api/reset-db` o secuencia ordenada `00_delete_tables.sql` → `01_creacion.sql` → `02_datos_base.sql` → `03_indices_optimizacion.sql` → `04_rls.sql` → `05_funciones_rpc.sql` / triggers → `06_datos_prueba.sql` → `07_auth_setup.sql`).
- Ejecutar `06_datos_prueba.sql` una **segunda vez** para comprobar 100% idempotencia sin errores `27000` ni conflictos de índices únicos parciales.
- Verificar que todas las tablas tienen RLS habilitado, cero `.delete()` sobre entidades con `deleted_at` en frontend (`grep -rn "\.delete(" src/`) y cero UUIDs filtrados en consola o UI.

### 2. Puerta Estática, Compilación y Pruebas Unitarias
Ejecutar y exigir 0 errores en:
1. `npx tsc --noEmit` (y verificar cero `: any` / `as any` en `src/`).
2. `npm run lint`
3. `npm test` (toda la suite Vitest en verde).
4. `npm run build`

### 3. Pruebas E2E Playwright en Navegador Real (Chromium)
Probar la app levantada en `http://localhost:3000` en **Desktop (`1440x900`)** y **Mobile (`390x844`)** con cero errores de consola/red (`console.error`, `pageerror`, respuestas `5xx`):

1. **Rol `ADMIN` / `WORKER`:**
   - **Bloque 2 → `Vínculo` (justo debajo de `Certificado`):**
     - Verificar Multi View por Conglomerado con nombres cortos.
     - Abrir un conglomerado: comprobar Zona Superior (`LIBRE`) + Zona Inferior (Cajas Agrupadoras limpias sin texto ruido en modo lectura).
     - Hacer clic en un certificado `LIBRE` → comprobar Pop-up de Asignación con cajas **colapsadas** por defecto → expandir una caja (`▸` → `▾`) para inspeccionar miembros → asignar a una caja.
     - Editar caja: verificar herencia de naturaleza, modificar override individual de un certificado, desvincular un certificado incluso si tiene auditorías en curso/cerradas (debe permitirse y volver a `LIBRE`), e intentar re-vincular a otra caja desde `LIBRE`.
   - **Wizard `+ Auditoría` (3 Fases):**
     - Fase 1: probar selección bidireccional `Conglomerado` ↔ `Organización` con nombres cortos.
     - Fase 2: elegir caja `Vínculo` → confirmar todos los certificados en **ON por defecto** → apagar al menos un certificado (subconjunto o 1 solo) y avanzar.
     - Fase 3: configurar fecha → validar tabla de 2 columnas (`Relación / Naturaleza` pre-cargada y editable | `Tipo de Auditoría`) → guardar y confirmar creación sin afectar las cajas de Bloque 2.
   - **Bloque 1 → `Relación` (Paso 1 antes de `Designación`):**
     - Verificar que el menú y stepper bar muestran `1. Relación` → `2. Designación {Tipo, Fecha, Sitio, Temporal}` → `3. Tiempo` → ... → `8. Revisión` + `Resumen`.
     - En `Relación` Multi View (Org/Conglomerado), hacer clic en una fila → confirmar **Pop-up Selector** de certificado/auditoría con codenames compactos (`YYYY-MM ShortTipo`) → entrar a Detail View limpia estilo `Tipo` → modificar naturaleza de una auditoría y confirmar persistencia.
   - **Codenames y Nombres Cortos:** Verificar `2026-11 Seg.1` (y similares) + abreviaciones de conglomerado en `Calendario`, `Relación`, `Designación`, `Resumen`, `Breadcrumbs` y `Conglomerados`, junto con ausencia de desbordamientos en `1440x900` y `390x844` y cero `<button>` dentro de `<tbody>`.
2. **Rol `AUDITOR`:**
   - Confirmar que **Bloque 2 (`Certificación` / `Vínculo`)** está completamente oculto y bloqueado por ruta directa `#/certificacion/vinculo`.
   - Confirmar en **Bloque 1 (`Relación` y pipeline)** acceso únicamente de lectura a sus auditorías asignadas (sin selects ni botones de mutación de programación).
3. **Rol `CLIENT`:**
   - Confirmar acceso **solo lectura** en Bloque 2 `Vínculo` (aislado Nivel 2 a su organización/conglomerado autorizado, sin cajas ajenas ni botones de edición/desvinculación).
   - Confirmar acceso **solo lectura** en Bloque 1 `Relación` y `Resumen` aislado a sus auditorías.

### 4. Sincronización de Documentación (`public/doc/*.md`)
Actualizar los 5 documentos oficiales para reflejar la arquitectura final implementada:
- **`public/doc/project_resume.md`:** Nuevo flujo `Relación` (Paso 1 Bloque 1) + `Vínculo` (Bloque 2 debajo de `Certificado`), Wizard 3 fases y estándar de codenames/nombres cortos.
- **`public/doc/database_architecture.md`:** Nuevas columnas (`grupo_empresarial.abreviacion`, `tipo_auditoria.abreviacion`, `vinculo_certificado.tipo_vinculacion_override`, `auditoria.tipo_vinculacion`), desacople de triggers `fn_validar_desvinculacion_certificado` y `fn_validar_auditoria_en_programa`, e índices nuevos.
- **`public/doc/backend_api_security.md`:** Reglas RBAC Bloque 2 `Vínculo` vs Bloque 1 `Relación`, aislamiento Nivel 2 `CLIENT`, exclusión `AUDITOR` en Bloque 2 y flujo transaccional del wizard 3 fases.
- **`public/doc/frontend_architecture.md`:** Inventario de módulos (`codenameDomain.ts`, `relacionDomain.ts`, `relacionView.ts`, `vinculoDomain.ts`, `vinculoView.ts`, `auditWizardDomain.ts`, `auditWizardModal.ts`), nuevo pipeline `1. Relación` → `2. Designación` → ... y convención universal "Less Is More".
- **`public/doc/testing_and_operations.md`:** Conteos actualizados de archivos de prueba/suites unitarias, checklist E2E de 4 roles incluyendo `Vínculo`, `Relación`, Wizard 3 fases y verificación de idempotencia SQL.

---

## Criterios de Aceptación Finales
- Reset SQL + segunda corrida de `06_datos_prueba.sql`: **0 errores**.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`: **100% en verde**.
- Playwright Desktop + Mobile en los 4 roles: **0 fallos funcionales, visuales, RBAC o de consola**.
- Documentos en `public/doc/` 100% sincronizados con la realidad del código y SQL.
