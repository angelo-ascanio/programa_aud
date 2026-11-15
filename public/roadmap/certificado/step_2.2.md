# Step 2.2: Detail View Children Zone Expansion ("Fecha" & "Contacto" Tabs)

## 1. Objetivo

Expandir la Zona de Hijos del detalle de `Certificado` (`src/views/certificadoView.ts`) para integrar las nuevas pestañas **"Fecha"** (`fecha_certificado`) y **"Contacto"** (`contacto_certificado`), actualizando los modelos de dominio TypeScript (`src/lib/multisiteSampling.ts`) y la hidratación de consultas reales en `src/main.ts`.

---

## 2. Alcance de Archivos a Modificar

1. `src/lib/multisiteSampling.ts`
2. `src/views/certificadoView.ts`
3. `src/main.ts`

---

## 3. Especificación de Contratos y UI

### 3.1 Expansión de Tipos en `src/lib/multisiteSampling.ts`
Definir interfaces estrictamente tipadas (`0 any`) para las nuevas sub-entidades y adjuntarlas a `CertificadoDetailEntity`:

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

- Actualizar `CertificadoDetailEntity` incorporando:
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

### 3.2 Integración de Pestañas en `src/views/certificadoView.ts`
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

### 3.3 Hidratación y Navegación en `src/main.ts`
1. **Consultas Supabase en la carga de datos de Certificados:**
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

- [ ] La vista de detalle de `Certificado` renderiza las **7 pestañas** (`Sitio`, `Proceso`, `Turno`, `No Aplicables`, `Auditoría`, `Fecha`, `Contacto`) con contadores dinámicos exactos.
- [ ] Las pestañas **"Fecha"** y **"Contacto"** utilizan `renderListViewTable` con ordenamiento por columna, ancho ajustable y click en fila completa.
- [ ] `src/main.ts` hidrata `fechas`, `contactos`, `telefonos` y `emails` desde Supabase filtrando `deleted_at IS NULL` y sin usar datos falsos de respaldo cuando existen datos reales.
- [ ] Cero UUIDs visibles en ninguna celda de **"Fecha"** o **"Contacto"**.
