# Step Final: Verification, Automated Tests & Sign-Off Checklist

## 1. Objetivo

Consolidar la calidad técnica, funcional y visual de toda la modernización del dominio `certificado`, actualizando las suites de pruebas automatizadas (`node:test`), validando compilación estricta de TypeScript, superando el pipeline de build y comprobando el renderizado responsivo entre `375px` y `1920px`.

---

## 2. Actualización de Suites de Pruebas Automatizadas (`src/lib/*.test.ts`)

### 2.1 Revisión y Ajuste de Suites Existentes
- **`src/lib/phase421DetailTemplate.test.ts` & `src/lib/detailViewsPhase42.test.ts`:**
  - Actualizar aserciones sobre `renderDetailPageTemplate` para reflejar el layout compacto y la rejilla de 4 columnas en padres (`lg:grid-cols-4`).
  - Actualizar pruebas de `renderCertificadoView`:
    - Verificar exactamente **4 padres** (`Organización`, `Norma`, `Estatus`, `Sector IAF`).
    - Verificar que la Zona de Datos Directos contenga **solo** `numero_certificado`, `multisitio` y `alcance` (afirmar ausencia de `Fecha de Emisión`, `Fecha de Vencimiento`, `Organismo Acreditador` y `Sub-Sector IAF` en esa sección).
    - Verificar presencia de las **7 pestañas** en `Certificado`: `Sitio`, `Proceso`, `Turno`, `No Aplicables`, `Auditoría`, `Fecha`, `Contacto`.
- **`src/lib/breadcrumb.test.ts`:**
  - Agregar casos para los nuevos `BreadcrumbEntityType`: `'fecha_certificado'`, `'contacto_certificado'`, `'telefono_contacto'`, `'email_contacto'`, validando truncamiento a 24 caracteres y prevención de bucles al retroceder desde `Email` → `Contacto` → `Certificado`.
- **`src/lib/phase11SqlMigration.test.ts` & `src/lib/phase12RlsHardening.test.ts`:**
  - Validar presencia de DDL, triggers (`trg_prevent_hard_delete_*`, `trg_sync_soft_delete_*`, `audit_*_trigger`, `trg_guard_archival_contacto_certificado`), `REVOKE DELETE`, `archive_record`, `get_archive_dependency_summary` y políticas RLS para las 4 tablas nuevas (`fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`).
- **`src/lib/archiveGovernance.test.ts` & `src/lib/zeroUuid.test.ts`:**
  - Verificar que las vistas `fechaView.ts`, `contactoView.ts`, `telefonoView.ts` y `emailView.ts` no expongan UUIDs en pantalla ni en atributos visibles de usuario.

### 2.2 Nuevas Pruebas Unitarias (`src/lib/certificadoSubEntities.test.ts`)
Crear suite dedicada para validar:
- Validación de los 7 valores de `tipo_fecha` (`Otorgamiento`, `Renovación`, `Vencimiento`, `Modificación`, `Suspensión`, `Cancelación`, `Ultima Auditoría`) y formato `YYYY-MM-DD`.
- Validación de creación/edición de `contacto_certificado` (`nombre` requerido, `cargo` nullable), `telefono_contacto_certificado` (`tipo_telefono` por defecto `'Oficina'`, formato telefónico válido) y `email_contacto_certificado` (`tipo_email` por defecto `'Trabajo'`, formato email RFC válido).
- Renderizado de `renderFechaView`, `renderContactoView`, `renderTelefonoView` y `renderEmailView` en modos lectura, edición inline (para `ADMIN`/`WORKER`), solo lectura (para `CLIENT`/`AUDITOR`) y estados vacíos.

---

## 3. Verificación de Compilación, Lint y Build

Ejecutar y confirmar salida limpia (código `0`, `0` errores, `0 any`):

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

- Verificar que `src/` no contenga ningún uso de `: any` ni `as any`.
- Verificar que `vite build` genere todos los chunks configurados en `vite.config.ts` sin advertencias críticas de resolución.

---

## 4. Verificación Visual y Responsiva en Navegador Real (`375px` a `1920px`)

Inspeccionar en navegador real (Chromium) las vistas afectadas en los siguientes viewports clave:
- **Móvil (`375x812`):**
  - Cabecera de ficha de detalle sin desbordamiento horizontal; título truncado limpiamente entre `[←]` y `[✏️][🕒][🗑️]`.
  - Zona de Padres y Datos Directos apilados en 1 columna con espaciado compacto.
  - Barra de 7 pestañas de `Certificado` con wrap limpio y tabla horizontalmente desplazable si aplica.
- **Tablet (`768x1024`):**
  - Zona de Padres en `2x2` (`sm:grid-cols-2`), Zona de Datos Directos equilibrada.
- **Desktop (`1440x900`) y Widescreen (`1920x1080`):**
  - Zona de Padres en 1 sola fila de 4 tarjetas (`lg:grid-cols-4`).
  - Zona de Datos Directos compacta (`numero_certificado` + `multisitio` en fila 1, `alcance` en fila 2).
  - Barra de pestañas y contenido inicial de `Fecha` / `Contacto` visibles por encima del pliegue (`above the fold`).
  - Navegación profunda `Certificado` → `Contacto` → `Teléfono` / `Email` sin saltos de layout ni solapamientos de texto.

---

## 5. Checklist de Aprobación Final (Sign-Off)

- [ ] **Step 1:** Ficha de `Certificado` compacta; Zona de Padres con 4 FKs exactas; Zona de Datos con `numero_certificado`, `multisitio`, `alcance` únicamente.
- [ ] **Step 2.1:** 4 tablas SQL (`fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`) completas en `01`, `03`, `04` y `06`.
- [ ] **Step 2.2:** Pestañas **"Fecha"** y **"Contacto"** operativas en `Certificado` Detail View e hidratadas desde Supabase.
- [ ] **Step 3.1:** Vistas `fechaView.ts`, `contactoView.ts`, `telefonoView.ts` y `emailView.ts` integradas con breadcrumbs, edición inline, bitácora forense y archivo lógico.
- [ ] **Step 3.2:** `POST /api/reset-db` exitoso (`00` → `06`) y flujo CRUD verificado contra base de datos real.
- [ ] **Calidad:** `npx tsc --noEmit`, `npm run lint`, `npm test` y `npm run build` en verde; `0` errores en consola de navegador entre `375px` y `1920px`.
