# Step 3.2: Database Reset & Seed Verification

## 1. Objetivo

Ejecutar el reinicio completo de la base de datos en Supabase a través del endpoint administrativo del servidor (`POST /api/reset-db`), verificando que todos los scripts SQL en `public/supabase/queries/` (`00_delete_tables.sql` a `06_datos_prueba.sql`) se ejecuten en estricto orden alfabético sin errores y que `src/main.ts` hidrate completamente las nuevas entidades.

---

## 2. Flujo de Ejecución del Endpoint `POST /api/reset-db` (`server.ts`)

`server.ts` implementa `runAllQueriesInOrder()`, que lee todos los `.sql` en `public/supabase/queries/`, los ordena lexicográficamente y los ejecuta contra el proyecto Supabase configurado (`VITE_SUPABASE_URL` + `VITE_SUPABASE_TOKEN` o `VITE_SUPABASE_DATABASE_KEY`):

1. `00_delete_tables.sql` — Reinicio limpio del esquema `public` y concesión de permisos base.
2. `01_creacion.sql` — Extensiones, tipos ENUM, **35 tablas** (incluyendo `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`), triggers `updated_at`, triggers de soft-delete, guardia de archivos y `audit_log`.
3. `02_cobertura_normativa.sql` — Funciones de cobertura normativa y calificación de auditores.
4. `03_indices_optimizacion.sql` — Índices parciales únicos (`WHERE deleted_at IS NULL`) y B-Tree/GiST incluyendo los nuevos índices de fechas, contactos, teléfonos y emails.
5. `04_rls.sql` — `REVOKE DELETE`, `archive_record`, activación RLS y políticas granulares en las 35 tablas.
6. `05_usuarios.sql` — Perfiles base de demostración y roles (`ADMIN`, `WORKER`, `AUDITOR`, `CLIENT`).
7. `06_datos_prueba.sql` — Semillas operativas idempotentes incluyendo `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado` y `email_contacto_certificado` para `FN-QMS-2024-001`.

---

## 3. Procedimiento de Ejecución y Verificación

### 3.1 Ejecución del Reset
Con el servidor local corriendo en el puerto `3000` (`npm run dev`):

```bash
curl -sS -X POST http://localhost:3000/api/reset-db | jq .
```

**Respuesta esperada (`HTTP 200`):**
```json
{
  "ok": true,
  "executedFiles": [
    { "file": "00_delete_tables.sql", "durationMs": 120 },
    { "file": "01_creacion.sql", "durationMs": 450 },
    { "file": "02_cobertura_normativa.sql", "durationMs": 180 },
    { "file": "03_indices_optimizacion.sql", "durationMs": 210 },
    { "file": "04_rls.sql", "durationMs": 320 },
    { "file": "05_usuarios.sql", "durationMs": 150 },
    { "file": "06_datos_prueba.sql", "durationMs": 290 }
  ],
  "totalDurationMs": 1720
}
```
*(Alternativamente, desde la vista **Estado DB** de la SPA si existe botón de reinicio conectado a `/api/reset-db`).*

### 3.2 Verificación de Esquema y Semillas en Vivo
1. Confirmar que las 4 tablas responden vía API REST/Supabase JS con RLS activo:
   - `fecha_certificado` devuelve las fechas sembradas (`Otorgamiento`, `Ultima Auditoría`, `Vencimiento`) para `40000000-0000-0000-0000-000000000001`.
   - `contacto_certificado` devuelve los contactos sembrados con sus hijos en `telefono_contacto_certificado` y `email_contacto_certificado`.
2. Verificar la hidratación en `src/main.ts`:
   - Iniciar sesión (o cargar vista autenticada de `ADMIN`/`WORKER`) y abrir el certificado `FN-QMS-2024-001`.
   - Comprobar en la pestaña **Fecha** y **Contacto** que los contadores reflejan exactamente los registros insertados por `06_datos_prueba.sql` sin fallos en consola de navegador ni errores HTTP 400/403/404.
   - Probar en vivo un ciclo completo:
     1. Crear una fecha o contacto nuevo → verificar persistencia tras recargar página.
     2. Editar el registro → verificar actualización en Supabase y entrada en `audit_log`.
     3. Intentar archivar un `contacto` con teléfonos activos → verificar bloqueo amigable por `get_archive_dependency_summary`.
     4. Archivar teléfono/email hijo y luego archivar el contacto → verificar `archive_record` (`deleted_at IS NOT NULL`) y desaparición inmediata de la lista activa.

---

## 4. Criterios de Aceptación del Step 3.2

- [ ] `POST /api/reset-db` retorna `200 OK` con `"ok": true` y los 7 archivos `.sql` ejecutados en secuencia exacta (`00` → `06`).
- [ ] Cero errores de sintaxis SQL, claves foráneas, RLS o conflictos de índices parciales durante el reset.
- [ ] La SPA en `http://localhost:3000` hidrata los registros sembrados de `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado` y `email_contacto_certificado` sin errores de consola o red.
