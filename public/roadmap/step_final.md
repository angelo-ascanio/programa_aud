# Paso Final — Actualización Documental (`/public/doc/`) y Verificación Integral End-to-End

## 1. Objetivo
Sincronizar toda la documentación arquitectónica del proyecto en `/public/doc/` con los cambios implementados a lo largo de los Pasos `1.1` al `4.4` y ejecutar la validación completa de base de datos, tests unitarios, compilación estricta, lint, build de producción y pruebas E2E en navegador real (Playwright Chromium) con los 4 roles en Desktop y Mobile.

---

## 2. Archivos Involucrados
- `public/doc/project_resume.md`
- `public/doc/architecture/database_architecture.md`
- `public/doc/architecture/frontend_architecture.md`
- `public/doc/architecture/backend_api_security.md`
- `public/doc/architecture/testing_and_operations.md`

---

## 3. Actualizaciones Documentales Requeridas

### 3.1. `public/doc/project_resume.md`
- Registrar el catálogo **`Experto` (`experto_tecnico`)** en Bloque 2 (`Certificación`, inmediatamente después de `Auditor`) y su asignación global en Bloque 1 **`3. Auditor`**.
- Actualizar el mapa de navegación oficial de Bloque 1:
  - `1. Designación` → `{ Relación, Tipo, Fecha, Sitio, Temporal }`
  - `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión` + `Resumen`.
- Documentar el patrón estándar unificado de las 13 secciones (**Multi View por Organización → Pop-up agrupado por auditoría vinculada → Vista Detalle compacta de 3 zonas "Less Is More"**).

### 3.2. `public/doc/architecture/database_architecture.md`
- Documentar las nuevas tablas SQL (`experto_tecnico`, `telefono_experto_tecnico`, `email_experto_tecnico`, `sector_iaf_experto`, `subsector_iaf_experto`, `experto_tecnico_auditoria`), sus `CHECK` constraints, funciones en `02_cobertura_normativa.sql`, índices en `03_indices_optimizacion.sql`, gobernanza `archive_record` / `get_archive_dependency_summary` / `audit_log` y los seeds optimizados en `06_datos_prueba.sql` (incluyendo Sector `13` / Sub-Sector `13.2` + brecha IAF).

### 3.3. `public/doc/architecture/frontend_architecture.md`
- Documentar `expertoTecnicoDomain.ts`, `expertoTecnicoView.ts`, `orgMultiViewPickerDomain.ts`, `orgMultiViewPickerView.ts`, el nuevo `auditSectionShell.ts` (Zona 1 de datos sin repeticiones con botones Org/Cert+Versión y tooltips con nombre de campo; Zona 2 en 1 fila con `<select>` corto de auditoría + `<select>` condicional de certificados vinculados; Zona 3 directa "Less Is More"), las opciones limpias de `<select>` de `Tipo` y la estructura actualizada de `header.ts` y `auditCardBreadcrumb.ts`.

### 3.4. `public/doc/architecture/backend_api_security.md`
- Documentar políticas RLS/DCL de las 6 nuevas tablas (`04_rls.sql`), incluyendo aislamiento Nivel 2 (`CLIENT`) y permisos `AUDITOR` vs `WORKER` / `ADMIN` sobre `experto_tecnico` y `experto_tecnico_auditoria`, así como `expertoTecnicoPersistence.ts`.

### 3.5. `public/doc/architecture/testing_and_operations.md`
- Actualizar inventario de suites de tests (incluyendo `expertoTecnico*`, `orgMultiViewPicker*` y tests actualizados de navegación/UI) y checklist operativo de verificación en Chromium.

---

## 4. Batería Obligatoria de Verificación End-to-End

### 4.1. Base de Datos PostgreSQL / Supabase (Reset Limpio + Idempotencia)
1. Ejecutar desde cero `public/supabase/queries/` en orden estricto:
   - `00` → `01_creacion.sql` → `02_cobertura_normativa.sql` → `03_indices_optimizacion.sql` → `04_rls.sql` → `05_auditoria.sql` → `06_datos_prueba.sql` → `07` (si aplica).
2. Re-ejecutar `06_datos_prueba.sql` una **segunda vez** para confirmar idempotencia total (0 errores `23505`, `27000`, `42P01`, sin duplicados).

### 4.2. Calidad Estática, Tests Unitarios y Build
- `npx tsc --noEmit` → 0 errores (`strict: true`, confirmar `grep -rnE ": any\b|as any\b|<any>" src/` = 0).
- `npx tsx --test src/**/*.test.ts` (o todas las suites `*.test.ts`) → 100% en verde.
- `npm run lint` → 0 errores.
- `npm run build` → compilación limpia sin warnings fatales.

### 4.3. Verificación en Navegador Real (Playwright Chromium — Desktop `1440×900` y Mobile `390×844`)
Probar sobre la app corriendo en `http://localhost:3000` autenticándose con los **4 roles** (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`):
1. **Navegación Bloque 2 (`Certificación → Experto`):**
   - Aparece justo después de `Auditor`.
   - Crear/editar un experto técnico con disponibilidad, notas, teléfono, email y competencia únicamente de Sector/Sub-Sector IAF (sin normas ISO).
2. **Navegación Bloque 1 y Simplificación `Tipo`:**
   - `1. Designación` contiene `{ Relación, Tipo, Fecha, Sitio, Temporal }` en ese orden exacto.
   - `2. Tiempo`, `3. Auditor`, `4. Proceso`, `5. Turno`, `6. Resultado`, `7. Revisión`, `Resumen`.
   - En `Designación → Tipo` y Wizard `+ Auditoría`, las opciones de tipo muestran nombres limpios sin `(etapa_ciclo)`.
3. **Multi View por `Organización` + Pop-up Agrupado (13 secciones):**
   - Verificar vista Grid, vista List (`table-fixed`, `<colgroup>` 100%, `0 <button>` en `<tbody>`), facetas y buscador en las 13 secciones (`Vínculo` + 12 secciones de Bloque 1).
   - Abrir Pop-up por Organización: validar barra de búsqueda interna, Col 1 agrupando auditoría vinculada, Col 2 un certificado por fila, Col 3+ datos de dominio; hacer clic en un certificado para entrar a su Vista Detalle.
4. **Template Unificado de Vista Detalle ("Less Is More"):**
   - En Zona 1: verificar botón Org (abreviación + tooltip `"Organización: <Nombre Completo>"` → clic navega a Org), botón Certificado con versión integrada (`FN-... vN` → clic navega a Cert), acciones `+ Auditoría` e `Historial de Cambios` a la derecha, sin repetición de fechas/nombres, y tooltips en badges sin etiqueta.
   - En Zona 2: verificar fila única con `<select>` corto de auditorías (`"2026-01 Renov."`) y `<select>` condicional de certificados vinculados (`"FN-..."`, oculto en individuales).
   - En Zona 3: revisar `Temporal`, `Tiempo`, `Auditor` (incluyendo brecha IAF + asignación global de Experto Técnico con días y observación), `Proceso`, `Turno`, `Resultado` y `Revisión`.
5. **Integridad RBAC, Nivel 2 y Layout:**
   - `CLIENT`: aislamiento estricto Nivel 2 (solo sus organizaciones autorizadas), solo lectura en todo Bloque 1 y bloqueado en `Experto`.
   - `AUDITOR`: solo lectura en `Experto` y catálogos.
   - **0 errores de consola**, **0 errores HTTP 4xx/5xx inesperados**, **0 UUIDs crudos visibles**, **0 scroll horizontal** en Desktop (`1440×900`) y Mobile (`390×844`).

---

## 5. Criterios de Aceptación Finales
1. Toda la documentación en `/public/doc/` está alineada con el código y el esquema SQL reales.
2. Reset de DB, `tsc --noEmit`, todas las pruebas unitarias, `npm run lint`, `npm run build` y el recorrido Playwright completo en los 4 roles pasan sin fallos.
