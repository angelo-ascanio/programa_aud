# Step 3.2: Motor de Renderizado Documental (Reglas 1, 2 y 3) y Acceso Rápido Integrado

## Objetivo
Unificar el renderizado HTML de cláusulas raíz y sub-cláusulas embebidas `{clause_...}` en `src/lib/clauseRenderer.ts` y `src/views/requisitoView.ts` para ofrecer lectura continua de documento oficial sin bordes ni botones invasivos, manteniendo acceso rápido sobre los códigos en negrita.

## Archivos Afectados
- `src/lib/clauseRenderer.ts`
- `src/views/requisitoView.ts`
- `src/main.ts`
- `src/lib/clauseRenderer.test.ts`

## Cambios Específicos

### 1. Reglas Estrictas de Presentación (Raíz y Embebidas)
Aplicar la misma lógica determinista tanto a la cláusula principal como a cada `{clause_X.Y.Z}` expandido recursivamente:

- **Regla 1 — Con `title` no vacío:**
  - Mostrar `{codigo} {title}` en **negrita** (ej. **`9.2 Auditoría Interna`**) como encabezado de bloque con un ligero margen superior (`mt-3`).
  - Renderizar `content_html` inmediatamente en la fila/línea siguiente.
- **Regla 2 — Sin `title` y `explicit_code === true`:**
  - Anteponer **`{codigo}`** en negrita seguido del texto de `content_html` en la **misma fila / flujo inline** (ej. **`9.3.3`** Las salidas de la revisión por la dirección deben incluir...).
  - Usar un margen superior ligeramente menor que la Regla 1 (`mt-1.5`).
  - *Nota técnica:* Si `content_html` inicia con `<p>` o `<div>`, inyectar el prefijo en negrita dentro del primer bloque de flujo para evitar salto de línea indeseado.
- **Regla 3 — Sin `title` y `explicit_code === false`:**
  - No mostrar ningún código antes ni sobre el texto.
  - Renderizar exclusivamente `content_html` como texto continuo, reduciendo márgenes y paddings (`mt-0.5`, sin relleno lateral) para simular lectura fila tras fila de un solo documento.

### 2. Estilo Visual Natural (Sin Cajas ni Chips)
- Eliminar de `resolveClauseHtml` las clases decorativas de contenedor (`border-l-2 border-indigo-200/80 pl-3`, chips `bg-indigo-50`, botones recuadro `px-1.5 py-0.5 rounded`).
- Todo código y título debe lucir como **texto documental continuo en negrita** (`font-bold text-slate-900`), sin apariencia de botón ni tarjeta anidada.

### 3. Acceso Rápido Integrado en el Texto
- En las Reglas 1 y 2 (cuando el código es visible en negrita y `interactiveLinks: true`), envolver el `{codigo}` en un `<button type="button" data-action="select-requisito" data-requisito-id="...">` estilizado de forma discreta e indistinguible del texto continuo (`font-bold text-slate-900 hover:text-indigo-700 hover:underline focus:underline cursor-pointer bg-transparent p-0 border-0 inline`), con `title="Ir a cláusula {codigo}"`.
- Al hacer clic sobre cualquier código en negrita dentro de un capítulo extenso (ej. `8.5.5`), se abre/enfoca directamente esa cláusula en `requisitoView.ts` (y se reestablece el scroll al inicio de la tarjeta o del bloque enfocado).

## Criterios de Aceptación
- Las Reglas 1, 2 y 3 tienen pruebas unitarias dedicadas en `src/lib/clauseRenderer.test.ts` verificando espaciados, ausencia de chips/bordes y flujo inline en Regla 2.
- No hay bordes laterales (`border-l-2`) ni recuadros alrededor de sub-cláusulas embebidas.
- Hacer clic en un código en negrita dentro del cuerpo HTML navega sin errores hacia la sub-cláusula correspondiente.
