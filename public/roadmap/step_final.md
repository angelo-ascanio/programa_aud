# Step Final: Auditoría Transversal, Matriz RBAC, Pruebas Automatizadas y Compuertas de Calidad

## 1. Objetivo
Validar de extremo a extremo que **todas las entidades raíz, hijas y nietas** de los bloques **`Extra`** y **`Certificación`** cumplen con el 100% de la arquitectura canónica de `public/certificado/`, manteniendo intacto el bloque `Auditoría`, con cero errores de TypeScript (`0 any`), cero regresiones visuales o de layout, y pruebas unitarias/E2E aprobadas.

---

## 2. Auditoría Transversal Obligatoria (Checklist Final)

### 2.1 Auditoría de Vistas y Código Estático (`grep`)
Ejecutar verificaciones estáticas sobre `src/views/` y `src/lib/` (excluyendo el bloque `Auditoría`):
1. **Cero botones al pie de formularios Detail View:** Confirmar que ninguna vista de `Extra` o `Certificación` conserva botones `Cancelar`, `Guardar` o `Crear` debajo de Zona 2.
2. **Orden estricto en cabecera (`'add' | 'edit'`):** Confirmar que en todas las Detail Views `Save` (`bg-emerald-600`) antecede a `Cancel` (`bg-rose-50`).
3. **Cero banners verdes inline de éxito:** Confirmar que no quedan `saveSuccessMessage`, `createSuccessMessage`, `shiftActionMessage` ni `requisitoActionMessage` renderizando banners verdes dentro del flujo de la página; todo éxito invoca `showFloatingToast(..., 'success')`.
4. **Cero columnas `acciones` o `<button>` dentro de `<td>` en Multi Views y Child Tabs:** Confirmar que todas las tablas de `Extra` y `Certificación` usan `renderListViewTable` (`table-fixed`, `<colgroup>`, `tableId`, suma `defaultWidthPct === 100`, `getRowAttrs`).
5. **Cero formularios de creación inline ni modales residuales:** Confirmar eliminación de `renderCreateOrganizacionForm`, `renderCreateAuditorForm`, `renderCreateAcreditacionForm`, `#newSubsectorModalBackdrop`, `#inspectClauseBackdrop`, `#newAccreditationBackdrop`, `#createTelefonoContactoForm`, `#createEmailContactoForm`.
6. **Booleanos sin asterisco `*` y con contraste en lectura:** Verificar `renderDetailBooleanField` en todo campo booleano.
7. **Política Cero-UUID:** Ninguna función de persistencia inserta UUIDs sintéticos (`a000...`, `da00...`, `f000...`).

### 2.2 Verificación E2E de Flujos Padre → Hijo → Nieto y Breadcrumbs
Comprobar cada ruta completa ida y vuelta por breadcrumb sin saltos de línea (`whitespace-nowrap`):
1. **Extra:**
   - `Extra > Estatus / Tipo / Metodología`: `+` → `'add'` → guardar → `'read'` → `'edit'` → guardar → breadcrumb regreso.
   - `Extra > Acreditaciones > Organismos`: `+ Nuevo Organismo` → crear → `+ Nueva Acreditación` → guardar → clic en chip `Organismo` / `Norma` / `Sector IAF`.
   - `Extra > Sectores IAF`: crear Sector → `+ Nuevo Sub-Sector` → guardar → editar categoría de riesgo → comprobar disponibilidad inmediata en cascada de `Certificado`.
   - `Extra > Normas ISO`: crear Norma → `+ Nuevo Requisito` con `id_requisito_padre` → verificar cálculo LTREE `ruta_materializada` → prevenir ciclo al editar padre.
2. **Certificación:**
   - `Certificación > Organizaciones`: crear Organización → pestaña `Acceso Cliente` → `+ Otorgar Acceso` → crear/aprobar/archivar acceso.
   - `Certificación > Auditores`: crear Auditor → `+ Asignar Competencia` → asignar Norma, Sector y Sub-Sector (cascada viva) → desvincular competencia M:N.
   - `Certificación > Certificados` (árbol completo):
     - Tab `sitios` → `+ Nueva Sede` → Sede #1 → vincular turno → volver por breadcrumb.
     - Tab `procesos` → `+ Nuevo Proceso` → vincular requisito filtrado por Norma del Certificado → clic fila requisito.
     - Tab `turnos` → `+ Nuevo Turno` → guardar y editar horario.
     - Tab `no_aplicables` → `+ Declarar Exclusión` → elegir cláusula de la Norma → guardar justificación ISO 4.3.
     - Tab `fechas` → `+ Nueva Fecha` → guardar → editar fecha.
     - Tab `contactos` → `+ Nuevo Contacto` → `+ Agregar Teléfono` / `+ Agregar Correo` → guardar nieto → regresar al contacto.

### 2.3 Matriz de Pruebas RBAC
| Rol / Estado | Multi View CTA `+` | Detail `'add' | 'edit'` | Botones `[✏️] [🕒] [🗄️]` | Pestaña `Acceso Cliente` |
| :--- | :--- | :--- | :--- | :--- |
| `ADMIN` (`APPROVED`) | Visible y habilitado | Permitido | Visible | Lectura + Alta/Edición/Archivo |
| `WORKER` (`APPROVED`) | Visible y habilitado | Permitido | Visible (restauración solo Admin) | Lectura + Alta/Edición/Archivo |
| `WORKER` (`PENDING` / `REJECTED`) | Oculto | Bloqueado → `'read'` | Oculto | Oculto |
| `AUDITOR` (`APPROVED`) | Oculto | Bloqueado → `'read'` | Oculto | Oculto |
| `CLIENT` (`APPROVED`) | Oculto (solo orgs autorizadas) | Bloqueado → `'read'` | Oculto | Oculto |

---

## 3. Actualización de Suites de Pruebas (`node:test`)
Ampliar y verificar las suites existentes bajo `src/lib/`:
1. `src/lib/detailViewsPhase42.test.ts` — Cobertura de `renderDetailFormTopActions`, orden `Save` antes que `Cancel`, ausencia de botones inferiores y booleanos con contraste en lectura.
2. `src/lib/phase421DetailTemplate.test.ts` — Cobertura `isCreateMode: true` (oculta `🕒`, `🗄️` y `childTabsHtml`) y `customParentZoneHtml` en todas las nuevas vistas (`organismoAcreditacionView`, `subsectorIafView`, `requisitoView`, `clientAccessView`, `competenciaAuditorView`, `noAplicableView`, etc.).
3. `src/lib/phase62UiIntegrity.test.ts` — Reglas estructurales anti-regresión:
   - Suma `defaultWidthPct === 100` en todas las tablas Multi View y Child Tabs de `Extra` y `Certificación`.
   - Ausencia de columna `acciones` y botones en `<tbody>` en todos los directorios.
   - Verificación `isApprovedStaffProfile` ante usuarios `PENDING`.
4. Tests de dominio puro (`extraDomain.test.ts`, `acreditacionDomain.test.ts`, `competencyMatrix.test.ts`, `sitioDomain.test.ts`, `procesoDomain.test.ts`, `turnoDomain.test.ts`, `certificadoSubEntities.test.ts`, `breadcrumb.test.ts`).

---

## 4. Compuertas de Calidad Obligatorias (CLI)
Al concluir cada paso y al finalizar el roadmap completo, deben pasar sin errores ni advertencias críticas:
```bash
npx tsx --test src/lib/*.test.ts
npm run lint
npm run build
```
Además, realizar auditoría visual en navegador (`http://localhost:3000`) comprobando:
- Sin scroll horizontal en viewport desktop (`1280x800`) ni truncamientos rotos en breadcrumbs o celdas `table-fixed`.
- Toast flotante `#archiveGovernanceToast` centrado inferior sin desplazamiento del layout al guardar/crear.
- Cero errores en consola del navegador ni llamadas fallidas 400/403 contra Supabase.
