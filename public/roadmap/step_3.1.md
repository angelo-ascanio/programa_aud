# Paso 3.1: Actualización de Multi View de `Auditor` (`Bloque 2 → Certificación`)

## 1. Objetivo del Paso
Evolucionar el Multi View (Vista Lista y Vista Cuadrícula) de **Bloque 2 → Certificación → Auditor** en `src/views/auditorView.ts` y sus filtros reactivos en `src/lib/competencyMatrix.ts` para aprovechar los 47 perfiles reales del CSV con máxima claridad visual ("Less Is More"), cero sobrecarga, desambiguación de homónimos (`SIGLAS · C.I.`), indicadores semánticos de evaluación in situ y cobertura de esquemas complementarios (`MARCA`, `HACCP`).

> **Alcance estricto:** Exclusivamente Multi View (`auditorView.ts` en su sección Lista/Grid), motor de facetas/búsqueda en `competencyMatrix.ts` y pruebas unitarias/vista correspondientes. El Detail View y pestañas hijas se ejecutan en el **Paso 3.2**.

---

## 2. Archivos Permitidos a Modificar
- `src/views/auditorView.ts` (sección Multi View: `renderAuditorListView`, `renderAuditorGridCard`, definición de columnas y facetas)
- `src/lib/competencyMatrix.ts` (extensión de `filterAuditors`, extractores de facetas y buscador textual)
- `src/lib/competencyMatrix.test.ts` (y tests de render Multi View si se requiere)

---

## 3. Diseño Funcional y Visual Detallado

### 3.1 Reglas Invariantes del Multi View
- Mantener el contenedor universal `renderUniversalTemplate` (`List` + `Grid`), botón `+ Nuevo Auditor` exclusivamente en barra superior para `ADMIN`/`WORKER`, y soporte completo de `archiveConfig` (toggle `Ver archivados` solo para `ADMIN`).
- **Tabla Lista (`renderListViewTable`):**
  - `table-fixed` estricto con `<colgroup>` cuyos porcentajes sumen exactamente **100%** (ej. `24% + 16% + 20% + 22% + 10% + 8% = 100%`).
  - **Cero `<button>` dentro de `<tbody>`:** filas completas clicables (`data-action="open-auditor-detail"` + soporte teclado Enter/Space).
  - **Política Zero-UUID:** nunca mostrar UUIDs en textos visibles, `title` ni atributos textuales visibles al usuario.

### 3.2 Columnas de Vista Lista (6 Columnas Balanceadas)
| Columna | Ancho | Contenido Exacto |
| :--- | :--- | :--- |
| **Auditor** | `24%` | `nombre` (negrita) + subtítulo compacto `SIGLAS · C.I. <cedula>` (desambiguación automática de `Yurima Carrillo` `7137643` vs `12310919`) + profesión abreviada. |
| **Normas y Esquemas** | `16%` | Chips limpios para `ISO 9001`, `14001`, `45001`, `22000`, `27001` y distintivo discreto para `esquemas_complementarios` (`MARCA`, `HACCP`). |
| **Sectores IAF** | `20%` | Conteo de sectores y resumen de los primeros códigos/sub-sectores IAF (`+N más`), mostrando `"Sin sectores asignados"` para auditores pendientes (`KSG`, `LMR`, `PG`). |
| **Contacto** | `22%` | Correo principal + contador `(+1)` si tiene correo secundario; teléfono principal + contador `(+N)` si tiene múltiples teléfonos. |
| **Eval. In Situ** | `10%` | Badge único de estado basado en `evaluateAuditorInSituStatus`: `Vigente`, `Por Vencer`, `Vencido`, `S/R`, `Condicionado`, más ícono discreto con tooltip si `observacion_sectores` requiere Experto Técnico. |
| **Auditorías** | `8%` | Conteo `tabular-nums` de auditorías en las que participa el auditor. |

### 3.3 Tarjetas de Vista Cuadrícula (`Grid`)
- Cada card muestra:
  1. Encabezado: `SIGLAS` en recuadro monoespaciado compacto, `nombre`, `C.I. <cedula>` y estado de `Eval. In Situ`.
  2. Línea de `profesion` (truncada limpiamente sin desbordar).
  3. Bloque técnico: normas ISO + `esquemas_complementarios` + resumen de sectores/subsectores (`31.4`, `17.1`, etc.).
  4. Pie: teléfono/correo principal + alerta breve de 1 línea si requiere Experto Técnico (`observacion_sectores`) + contador de auditorías.

### 3.4 Búsqueda Global y Facetas Reactivas $S_{-k}$
1. **Buscador unificado (`searchExtractor` / `filterAuditors`):**
   - Indexar `nombre`, `siglas`, `cedula_identidad`, `profesion`, todos los `telefonos`, todos los `emails`, `normas`, `esquemas_complementarios`, códigos/descripciones de `sectores_iaf` y `subsectores_iaf`, `observaciones_evaluacion` y `observacion_sectores`.
2. **Facetas reactivas $S_{-k}$ (`computeReactiveFacetCounts`):**
   - `Norma / Esquema`: normas ISO activas (`ISO 9001:2015`, `14001`, `45001`, `22000`, `27001`) + opción para esquemas complementarios (`MARCA`, `HACCP`).
   - `Sector IAF`: sectores IAF presentes en los auditores (`01`..`39`).
   - `Evaluación In Situ`: `Vigente`, `Por Vencer`, `Vencido`, `S/R`, `Pendiente / Condicionado`.
   - `Condición Sectorial`: `Requiere Experto Técnico` vs `Sin condicionamiento`.
   - `Profesión`: agrupamiento limpio de profesiones normalizadas (`Ingeniero Industrial`, `Ingeniero Químico`, `Ingeniero Mecánico`, etc.).

---

## 4. Criterios de Verificación del Paso 3.1
1. `npx tsc --noEmit` y `npm test` pasan con 0 errores.
2. Tests HTML verifican: `table-fixed`, `<colgroup>` sumando `100%`, `0 <button>` en `<tbody>`, presencia de ambas `Yurima Carrillo` claramente diferenciadas por `C.I. 7137643` y `C.I. 12310919`, y `assertZeroUuidExposure`.
3. Verificación Playwright en escritorio (`1440x900`) y móvil (`390x844`): Multi View lista y cuadrícula de los 48 auditores sin desbordes horizontales, con filtros reactivos $S_{-k}$ actualizando conteos correctamente.
