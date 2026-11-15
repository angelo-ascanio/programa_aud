# Step 2.2: `Certificado` Parent ID Expansion (`id_subsector_iaf`) & Children Zone ("Fecha" & "Contacto" Tabs)

## 1. Objetivo

Incorporar la nueva clave foránea **`id_subsector_iaf`** (creada en el `Step 2.1`) dentro de la **Zona de Padres** de la vista de detalle de `Certificado` (`src/views/certificadoView.ts`) y expandir su **Zona de Hijos** para integrar las nuevas pestañas **"Fecha"** (`fecha_certificado`) y **"Contacto"** (`contacto_certificado`), actualizando los modelos de dominio TypeScript (`src/lib/multisiteSampling.ts`), la rejilla responsiva de `src/views/detailTemplate.ts` y la hidratación de consultas reales en `src/main.ts`.

---

## 2. Alcance de Archivos a Modificar

1. `src/lib/multisiteSampling.ts`
2. `src/views/detailTemplate.ts` (soporte de rejilla widescreen para 5 tarjetas padre)
3. `src/views/certificadoView.ts`
4. `src/main.ts`

---

## 3. Especificación de Contratos y UI

### 3.1 Expansión de Tipos en `src/lib/multisiteSampling.ts`
Definir interfaces estrictamente tipadas (`0 any`) para las nuevas sub-entidades y consolidar `id_subsector_iaf` en `CertificadoDetailEntity`:

```ts
export type TipoFechaCertificado =
  | 'Otorgamiento'
  | 'Renovación'
  | 'Vencimiento'
  | 'Modificación'
  | 'Suspensión'
  | 'Cancelación'
  | 'Ultima Auditoría';

export interface TelefonoContactoEntity {
  id: string;
  id_contacto: string;
  telefono: string;
  tipo_telefono: string;
}

export interface EmailContactoEntity {
  id: string;
  id_contacto: string;
  email: string;
  tipo_email: string;
}

export interface FechaCertificadoEntity {
  id: string;
  id_certificado: string;
  fecha: string; // YYYY-MM-DD
  tipo_fecha: TipoFechaCertificado | string;
}

export interface ContactoCertificadoEntity {
  id: string;
  id_certificado: string;
  nombre: string;
  cargo: string | null;
  telefonos: TelefonoContactoEntity[];
  emails: EmailContactoEntity[];
}
```

- Actualizar `CertificadoDetailEntity` incorporando/asegurando:
  - `id_subsector_iaf: string;` (junto a `subsector_iaf_codigo?: string`, `subsector_iaf_descripcion?: string`, `subsector_categoria_riesgo?: 'ALTO' | 'MEDIO' | 'BAJO'` para renderizado Zero-UUID del 5.º vínculo padre).
  - `fechas: FechaCertificadoEntity[];`
  - `contactos: ContactoCertificadoEntity[];`
  *(Nota: mantener `fecha_emision` y `fecha_vencimiento` como opcionales o derivadas internamente de `fechas` únicamente para el directorio/listado principal de `Certificados` si la columna `Vigencia` del directorio los sigue mostrando, derivándolas de `Otorgamiento` y `Vencimiento` en `fechas`).*
- Expandir `CertificadoChildTab`:
  ```ts
  export type CertificadoChildTab =
    | 'sitios'
    | 'procesos'
    | 'turnos'
    | 'no_aplicables'
    | 'auditorias'
    | 'fechas'
    | 'contactos';
  ```

### 3.2 Incorporación de `id_subsector_iaf` en Zona de Padres (`src/views/certificadoView.ts` & `src/views/detailTemplate.ts`)

1. **Zona de Padres (`parents: DetailParentChip[]` en `renderCertificadoDetailPage`):**
   Ampliar el arreglo `parents` de 4 a **5 tarjetas padre** (estrictamente las 5 claves foráneas de `public.certificado` tras el `Step 2.1`), en el siguiente orden:
   1. `id_organizacion` → **Organización** (`organizacion_nombre (organizacion_rif)`), `navAction` a `certificacion / organizations / org`.
   2. `id_norma` → **Norma** (`norma_codigo`), `navAction` a `extra / standards / norma`.
   3. `id_estatus` → **Estatus** (`estatus`), `navAction` a `extra / estatus / estatus`.
   4. `id_sector_iaf` → **Sector IAF** (`Sector ${sector_iaf} · ${sector_iaf_descripcion}`), `navAction` a `extra / iaf / sector_iaf`.
   5. `id_subsector_iaf` → **Sub-Sector IAF** (`${subsector_iaf_codigo} · ${subsector_iaf_descripcion}` o etiqueta de riesgo `${subsector_categoria_riesgo}` si está hidratado; fallback limpio `'Sub-Sector IAF asignado'`, **Zero-UUID**), icono `'🧩'`, `navAction` hacia `extra / iaf` con `entityType: 'sector_iaf'`, `entityId: cert.id_sector_iaf`, `sectorNumber: cert.sector_iaf` (abriendo el `Sector IAF` padre en la pestaña `'subsectores'`).

   > **Regla de Pureza de Zona de Datos Directos:** `Sub-Sector IAF` reside exclusivamente en la **Zona de Padres** como relación FK (`id_subsector_iaf`). La **Zona de Datos Directos** (`customRecordBodyHtml`) y `#editCertForm` mantienen únicamente `numero_certificado`, `multisitio` y `alcance`.

2. **Soporte de Rejilla para 5 Padres (`src/views/detailTemplate.ts`):**
   Actualizar `parentGridColsClass` en `renderDetailPageTemplate` para evitar una 5.ª tarjeta huérfana en widescreen manteniendo la densidad compacta del `Step 1`:
   - `resolvedParents.length >= 5` → `'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'`
   - `resolvedParents.length === 4` → `'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'`
   - `resolvedParents.length <= 3` → `'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'`

### 3.3 Integración de Pestañas en `src/views/certificadoView.ts`
En `renderCertificadoDetailPage`:
1. Actualizar `validTabs` con `'fechas'` y `'contactos'`.
2. Agregar las 2 nuevas pestañas a `childTabs` pasado a `renderDetailPageTemplate`:
   - `{ id: 'fechas', label: 'Fecha', symbol: '📅', count: (cert.fechas || []).length }`
   - `{ id: 'contactos', label: 'Contacto', symbol: '👤', count: (cert.contactos || []).length }`
3. En `renderActiveChildTab`, añadir los casos `case 'fechas':` y `case 'contactos':` usando `renderListViewTable` (misma experiencia ordenable, redimensionable con `tableColumnWidths['cert-tab-fechas']` / `['cert-tab-contactos']` y clic en fila completa `<tr>`).

#### Especificación de Tab "Fecha" (`renderFechasChildTab`)
- **Columnas (`ColumnDefinition<FechaCertificadoEntity>[]`):**
  1. `tipo_fecha` (**Tipo de Fecha**, badge semántico por evento: verde para `Otorgamiento`/`Renovación`, ámbar para `Suspensión`/`Modificación`, rojo para `Cancelación`, azul/neutro para `Vencimiento`/`Ultima Auditoría`).
  2. `fecha` (**Fecha**, `font-mono tabular-nums`, formato legible `YYYY-MM-DD`).
  3. `estado_temporal` (**Referencia Temporal**, columna calculada informativa: ej. `Vigente`, `Próxima a vencer`, `Histórica` respecto a la fecha actual).
- **Click de fila (`getRowAttrs`):**
  - `data-action="select-fecha-detail" data-fecha-id="${escapeHtml(f.id)}" data-cert-id="${escapeHtml(certId)}"`
- **Acción de alta contextual (si `isStaff`):**
  - Botón `+ Registrar Fecha` sobre la tabla (o panel compacto inline) para crear un registro en `public.fecha_certificado`.

#### Especificación de Tab "Contacto" (`renderContactosChildTab`)
- **Columnas (`ColumnDefinition<ContactoCertificadoEntity>[]`):**
  1. `nombre` (**Nombre Completo**, negrita con icono `👤`).
  2. `cargo` (**Cargo / Rol**, o `'No especificado'` si `null`).
  3. `telefonos_resumen` (**Teléfonos**, resumen limpio de teléfonos activos o conteo `N teléfono(s)` con el número principal visible, Zero-UUID).
  4. `emails_resumen` (**Correos Electrónicos**, correo principal visible + indicador `+N` si hay adicionales).
- **Click de fila (`getRowAttrs`):**
  - `data-action="select-contacto-detail" data-contacto-id="${escapeHtml(c.id)}" data-cert-id="${escapeHtml(certId)}"`
- **Acción de alta contextual (si `isStaff`):**
  - Botón `+ Agregar Contacto` sobre la tabla para crear un registro en `public.contacto_certificado`.

### 3.4 Hidratación y Navegación en `src/main.ts`
1. **Consultas Supabase en la carga de datos de Certificados:**
   - Incluir `id_subsector_iaf` y la relación embebida `subsector_iaf:id_subsector_iaf ( id, codigo, descripcion, categoria_riesgo )` en el `.select(...)` de `public.certificado` para poblar `id_subsector_iaf`, `subsector_iaf_codigo`, `subsector_iaf_descripcion` y `subsector_categoria_riesgo` en cada `CertificadoDetailEntity` (con respaldo coherente desde `state.domainData.iafSubsectors` / `INITIAL_SUBSECTORES_IAF`).
   - En el listener `[data-parent-nav="true"]` cuando `parentType === 'sector_iaf'` provenga del chip **Sub-Sector IAF** (p. ej. `data-target-tab="subsectores"`), fijar `state.extraDomain.activeSectorTab = 'subsectores'` antes de renderizar la vista del Sector IAF.
   - Si existe creación de certificados (`#createCertForm`), incluir selector de `id_subsector_iaf` filtrado por el `id_sector_iaf` elegido para cumplir la restricción `NOT NULL` en `INSERT INTO certificado`.
   - Consultar `fecha_certificado` (`.select('id, id_certificado, fecha, tipo_fecha').is('deleted_at', null)`).
   - Consultar `contacto_certificado` (`.select('id, id_certificado, nombre, cargo').is('deleted_at', null)`).
   - Consultar `telefono_contacto_certificado` (`.select('id, id_contacto, telefono, tipo_telefono').is('deleted_at', null)`).
   - Consultar `email_contacto_certificado` (`.select('id, id_contacto, email, tipo_email').is('deleted_at', null)`).
   - Ensamblar `contactos[].telefonos`, `contactos[].emails`, `cert.contactos` y `cert.fechas` dentro de cada `CertificadoDetailEntity` en el estado de la aplicación.
   - Derivar `fecha_emision` (`Otorgamiento`) y `fecha_vencimiento` (`Vencimiento`) para la columna `Vigencia` de la vista Multi View si existen registros en `fechas`.
2. **Delegación de Eventos de Pestañas y Filas:**
   - En el listener de `[data-cert-tab]`, aceptar `'fechas'` y `'contactos'`.
   - En `restoreStateFromBreadcrumbSegment` / navegación por URL/breadcrumb, soportar `tab === 'fechas' || tab === 'contactos'`.
   - Conectar `data-action="select-fecha-detail"` y `data-action="select-contacto-detail"` hacia las nuevas vistas de detalle definidas en `Step 3.1`.

---

## 4. Criterios de Aceptación del Step 2.2

- [ ] La Zona de Padres de `Certificado` renderiza exactamente las **5 tarjetas FK** de `public.certificado` (`id_organizacion`, `id_norma`, `id_estatus`, `id_sector_iaf`, `id_subsector_iaf`) en fila única `xl:grid-cols-5` en pantallas `>= 1280px` y sin mostrar UUIDs.
- [ ] La Zona de Datos Directos continúa mostrando exclusivamente `numero_certificado`, `multisitio` y `alcance`.
- [ ] La vista de detalle de `Certificado` renderiza las **7 pestañas** (`Sitio`, `Proceso`, `Turno`, `No Aplicables`, `Auditoría`, `Fecha`, `Contacto`) con contadores dinámicos exactos.
- [ ] Las pestañas **"Fecha"** y **"Contacto"** utilizan `renderListViewTable` con ordenamiento por columna, ancho ajustable y click en fila completa.
- [ ] `src/main.ts` hidrata `id_subsector_iaf`, `fechas`, `contactos`, `telefonos` y `emails` desde Supabase filtrando `deleted_at IS NULL` y sin usar datos falsos de respaldo cuando existen datos reales.
- [ ] Cero UUIDs visibles en la tarjeta de **Sub-Sector IAF** ni en ninguna celda de **"Fecha"** o **"Contacto"**.
