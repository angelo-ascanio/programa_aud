# Step Final — Actualización Documental (`public/doc/*`), Validación Integral de BD y E2E Playwright Multi-Rol

## 1. Objetivo y Alcance Estricto
Cerrar formalmente el ciclo de mejora de compartición selectiva de hijos de certificado actualizando toda la documentación técnica en `public/doc/` para reflejar exactamente el nuevo esquema, motor normativo, seguridad RLS e interfaz, y ejecutar la batería completa de verificación técnica en base de datos, tests unitarios, compilación y navegador real Chromium con Playwright.

---

## 2. Archivos Afectados
- `public/doc/project_resume.md`
- `public/doc/architecture/database_architecture.md`
- `public/doc/architecture/backend_api_security.md`
- `public/doc/architecture/frontend_architecture.md`
- `public/doc/architecture/testing_and_operations.md`

---

## 3. Tareas a Ejecutar

### 3.1 Actualización de Documentación Técnica (`public/doc/`)
1. **`public/doc/project_resume.md`**:
   - Actualizar conteos exactos de tablas (50 → 54 tablas), índices en `03_indices_optimizacion.sql`, triggers, políticas RLS en `04_rls.sql`, archivos/casos `node:test`, y documentar la capacidad de compartición selectiva de hijos de certificado dentro de `grupo_empresarial` y resolución cross-standard `Proceso ↔ Requisito`.
2. **`public/doc/architecture/database_architecture.md`**:
   - Documentar las 4 nuevas tablas puente (`contacto_certificado_compartido`, `turno_certificado_compartido`, `proceso_certificado_compartido`, `sitio_certificado_compartido`), la evolución de `requisitos_por_proceso` (`PK (id_proceso, id_certificado, id_requisito)`), `procesos_por_sitio.id_certificado`, funciones `*_pertenece_a_certificado`, triggers de conglomerado/cobertura y actualización de `evaluar_cobertura_certificado`.
3. **`public/doc/architecture/backend_api_security.md`**:
   - Documentar las políticas RLS Nivel 2 (`CLIENT` sin fugas entre organizaciones del mismo conglomerado), restricciones `REVOKE DELETE`, `archive_record` y validaciones Zero-UUID en `certificadoSharePersistence.ts`.
4. **`public/doc/architecture/frontend_architecture.md`**:
   - Documentar `certificadoShareDomain.ts`, `procesoClauseResolver.ts`, `sitioShareDomain.ts`, `shareModalView.ts` y el comportamiento en `certificadoView.ts` + vistas hijas (`contactoView`, `turnoView`, `procesoView`, `sitioView`).
5. **`public/doc/architecture/testing_and_operations.md`**:
   - Actualizar inventario de suites de pruebas unitarias y comandos operativos de verificación.

### 3.2 Auditoría Técnica y Verificación Final Obligatoria
1. **Base de Datos PostgreSQL/Supabase:**
   - Reset completo idempotente (`00_delete_tables.sql` → `07_normas_requisitos_csv.sql`) sin errores.
   - Comprobar conteo exacto de tablas, `REVOKE DELETE`, `fn_prevent_hard_delete`, índices parciales `WHERE deleted_at IS NULL` y políticas RLS en `04_rls.sql`.
2. **Calidad de Código, Tests Unitarios y Build:**
   - `npm run lint` (`tsc --noEmit` con `strict: true` y `0 any`) → `0` errores.
   - `npm test` → 100% de suites y casos pasando.
   - `npm run build` → bundle limpio sin warnings fatales.
3. **Verificación Real en Navegador (Playwright Headless Chromium) en `1440×900` y `375×812`:**
   - **`ADMIN` / `WORKER`:**
     - Flujo **`Contacto`**: en Certificado X, compartir Contactos A y B hacia Certificado Y del mismo Conglomerado manteniendo C solo en X; verificar aparición en Y, edición viva y posterior desvinculación limpia de B en Y (manteniendo B en X).
     - Flujo **`Turno`**: compartir Turno desde X hacia Y (con asignación a `Sitio 0` de Y); verificar visibilidad en `Certificado Y → Turnos` y en `5. Turno` del planificador de auditoría.
     - Flujo **`Proceso` (Cross-Standard ISO 9001 → ISO 14001)**: compartir Proceso P desde Cert X (9001) hacia Cert Y (14001), verificando en el modal:
       - `4.4.1 / 4.4.2` sugerido como `4.4` en 14001.
       - `8.2` marcado con alerta semántica y **desmarcado** por defecto.
       - `8.3` omitido por inexistente en 14001.
       - Confirmar y validar que Cert X mantiene sus cláusulas 9001 intactas, Cert Y solo muestra cláusulas 14001 y recalcula su cobertura normativa correctamente.
     - Flujo **`Sitio`**: compartir un Sitio de X hacia Y (que ya tiene `Sitio 0`), verificando asignación automática de `Sede #1` en Y, propagación controlada de turnos/procesos con su resolución normativa, y creación/asignación válida en auditoría (`sitios_por_auditoria`, `4. Proceso`).
   - **`CLIENT` (Aislamiento Nivel 2):**
     - Autenticado en Org B (Cert Y): visualiza los registros compartidos dentro de Cert Y, **0 fugas** de nombres/códigos de Org A / Cert X, **0 botones** `Compartir` o `Desvincular`.
   - **`AUDITOR`:**
     - Verifica ausencia total de controles `Compartir` / `Desvincular` y respeto de alcance RBAC.
   - **Salud Visual y Consola:**
     - `0` errores en `console` / `pageerror`, `0` requests fallidos `4xx/5xx` inesperados, `0` UUIDs crudos visibles en el DOM, `0` overflow horizontal en desktop (`1440×900`) y móvil (`375×812`).
