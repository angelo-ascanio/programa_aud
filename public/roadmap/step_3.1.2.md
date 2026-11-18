# Step 3.1.2 — `Calendario` Multi View 3-Modos (`[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]`), Eventos Unificados y Alertas Configurables

## Objetivo
Refactorizar **`Calendario`** (`#auditorias/calendar`) en un Multi View completo de **3 modos** bajo `universalTemplate.ts` (con **`📅 Calendario`** por defecto) que renderiza campañas vinculadas como **eventos unificados**, distingue fechas `REAL` (`MAX(numero_secuencia)`) de estimaciones `PREPROGRAMADA_MES`, muestra la bandeja de **Alertas Inteligentes** calculadas y provee al staff (`ADMIN`/`WORKER`) el configurador visual de umbrales persistidos en `public.configuracion_alerta_auditoria`.

---

## Archivos a Modificar / Ampliar
- `src/views/universalTemplate.ts` (soporte opcional limpio de 3er modo `'calendar'`)
- `src/views/calendarioView.ts` (Multi View 3 modos + eventos unificados + panel de alertas + modal/drawer `"⚙ Configurar Alertas"`)
- `src/main.ts` (`getMultiViewDomainAdapter` para `'calendario'`, cambio entre `Calendario | Tarjetas | Tabla`, navegación `Mes | Trimestre | Cronograma` y handlers de configuración de alertas)
- `src/lib/auditMultiViews.test.ts` (pruebas DOM/HTML de Calendario 3-modos, eventos unificados, RBAC de configuración de alertas y Cero-UUID)

---

## Especificación Técnica Detallada

### 1. Extensión Opcional `'calendar'` en `universalTemplate.ts`
- Extender `UniversalViewMode = 'grid' | 'list' | 'calendar'`.
- Cuando `options.enableCalendarMode === true` (habilitado exclusivamente en `Calendario`):
  - Columna 4 de controles renderiza `[📅 Calendario | ⊞ Tarjetas | ☰ Tabla]` (`role="group"`, `aria-pressed`).
  - En `viewMode === 'calendar'`, el cuerpo principal junto al mismo `#multiViewFacetSidebar` colapsable renderiza `options.customCalendarViewHtml`, compartiendo exactamente el buscador único `type="text"`, totalizador `"Mostrando X de Y"` y facetas $S_{-k}$.
- Todos los demás dominios mantienen intacto `[⊞ | ☰]`.

### 2. `Calendario` (`#auditorias/calendar` en `calendarioView.ts`)
1. **Estado por Defecto y Facetas Compartidas:**
   - Inicializar `state.multiViewDomains.calendario.viewMode = 'calendar'`.
   - Facetas $S_{-k}$ compartidas en los 3 modos: `nivel_vinculacion`, `tipo_vinculacion`, `precision_fecha` (`Fecha Real | Pre-programada Mes/Año | Sin Fecha`), `tag_planificacion` y `alerta_activa`.
2. **Modo `'calendar'` (`Mes | Trimestre | Cronograma`):**
   - **Eventos Unificados de Campaña:** un programa vinculado (`Nivel 1` o `Nivel 2`) aparece como un **evento coordinado** (ej. `"Planta Santa Cruz · Integrada · 2 certs · 6.00d-aud / 3d cal."`), usando siempre la última fecha (`MAX(numero_secuencia)`). Si fue reprogramada, luce indicador discreto (`Reprog. #N`). Para `CLIENT` en Nivel 2, el evento muestra únicamente las organizaciones/certificados a las que tiene acceso por RLS.
   - **Pre-programadas Mes/Año (`PREPROGRAMADA_MES`):** renderizadas como bandas o chips mensuales estilizados (`"Mes estimado · Sin días exactos"`) en `Mes`, `Trimestre` y `Cronograma`.
   - **Bandeja `"Pendientes de fecha"`:** lista compacta de campañas/auditorías sin entradas en `auditoria_fecha`, clicables directo al Detail View.
   - Clic en cualquier evento navega al Detail View del `programa_auditoria` empujando breadcrumb (`Calendario > Planta Santa Cruz`).
3. **Modos `'grid'` (`Tarjetas`) y `'list'` (`Tabla`):**
   - Tarjetas estandarizadas y tabla `table-fixed` de 6 columnas sin `<button>` en `<tbody>`, respetando exactamente los filtros activos de búsqueda y facetas.

### 3. Bandeja de Alertas Inteligentes y Configuración (`ADMIN`/`WORKER`)
1. **Panel Colapsable de Alertas Activas:**
   - Renderizado en la parte superior del cuerpo de `Calendario`, alimentado por `computeAuditAlerts(programs, state.auditAlertConfig, todayIso)`.
   - Filtros rápidos por categoría: `Atrasadas`, `Próximas`, `Pre-programadas sin confirmar`, `Conflictos de Auditor` y `Desfases de Días/Span`. Clic en una alerta navega directamente al `programa_auditoria` afectado.
2. **Botón y Modal/Drawer `"⚙ Configurar Alertas"` (Solo `ADMIN`/`WORKER` aprobados):**
   - Oculto en el DOM para `AUDITOR` y `CLIENT`.
   - Permite editar y persistir en `public.configuracion_alerta_auditoria`:
     - `dias_aviso_proxima` (días antes de última fecha `REAL`)
     - `dias_aviso_preprogramada_sin_confirmar` (días antes de iniciar el mes `PREPROGRAMADA_MES`)
     - `ciclos_rotacion_auditor_lider`
     - Toggles: `alertar_atrasadas`, `alertar_conflicto_auditor`, `alertar_desfase_dias_o_span`, `alertas_activas`.
   - Al guardar, actualiza el estado en vivo con toast en `#archiveGovernanceToast`.

---

## Criterios de Verificación de Step 3.1.2
1. `#auditorias/calendar` abre por defecto en `📅 Calendario` y conmuta entre `Calendario | Tarjetas | Tabla` conservando filtros y búsqueda.
2. Campañas vinculadas muestran evento unificado con su última fecha (`MAX(numero_secuencia)`) y las `PREPROGRAMADA_MES` se distinguen claramente de las fechas `REAL`.
3. Modificar los umbrales en `"⚙ Configurar Alertas"` actualiza inmediatamente las alertas mostradas (y el botón no existe para `AUDITOR` / `CLIENT`).
4. `npx tsx --test src/lib/auditMultiViews.test.ts` y `npm run lint` pasan al 100%.
