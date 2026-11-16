# Step 3.1: Bloque HTML Colapsable, Cabecera de 2 Columnas y Conteo Normativo

## Objetivo
Convertir la zona HTML de `Requisito` en un panel colapsable con cabecera minimalista de 2 columnas, botones de idioma compactos (`es`, `en`, `ambos`) y conteo dinámico de términos normativos (`debe`/`debería`, `shall`/`should`).

## Archivos Afectados
- `src/lib/clauseRenderer.ts` (helper puro de conteo normativo)
- `src/views/requisitoView.ts`
- `src/main.ts` (estado y evento de colapso/expansión)
- `src/lib/clauseRenderer.test.ts` (pruebas unitarias del contador)

## Cambios Específicos

### 1. Estado Colapsable en `RequisitoViewState`
- Añadir `isContentCollapsed?: boolean` a `RequisitoViewState` (valor por defecto `false`, es decir, desplegado por defecto).
- Agregar botón toggle en la cabecera del bloque HTML (`data-action="toggle-requisito-content"`, con `aria-expanded="${!isCollapsed}"`) y cablearlo en `src/main.ts` para alternar el estado y re-renderizar.
- Cuando esté colapsado, ocultar el cuerpo HTML manteniendo visible únicamente la cabecera de 2 columnas.

### 2. Cabecera del Bloque HTML en 2 Columnas
Reemplazar la cabecera actual (`Contenido Normativo Bilingüe` + subtítulo explicativo + selector largo) por una barra limpia en 2 columnas (`flex items-center justify-between gap-2`):
- **Columna Izquierda:** Título **`CONTENIDO`** acompañado del icono/botón de colapsar/expandir (chevron rotatorio).
- **Columna Derecha:** Contenedor flex alineado a la derecha con:
  1. **Badges dinámicos de conteo normativo** (ubicados inmediatamente a la izquierda del selector de idioma, renderizados **únicamente si el conteo `> 0`**):
     - En idioma **ES**: badge `debe: N` y badge `debería: N`.
     - En idioma **EN**: badge `shall: N` y badge `should: N`.
     - En modo **`ambos`**: sumar o mostrar los badges activos que correspondan a los bloques renderizados con conteo `> 0`.
  2. **Selector de idioma compacto:** Tres botones breves **`es`**, **`en`**, **`ambos`** (`data-action="set-requisito-lang-mode"`, `data-lang-mode="es" | "en" | "both"`).

### 3. Limpieza de Badges Redundantes
- Eliminar la insignia `${resolved.resolvedChildCodes.length} sub-cláusulas embebidas` dentro de `renderSingleLanguageClauseCard`.
- Eliminar cabeceras repetitivas o banners innecesarios que dupliquen código/título sobre el contenido en vista simple (`es` / `en`).

### 4. Helper Puro de Conteo Normativo (`src/lib/clauseRenderer.ts`)
- Crear `countNormativeObligationTerms(html: string): { debe: number; deberia: number; shall: number; should: number }` evaluando texto plano extraído de HTML (sin contar atributos ni etiquetas) con límites de palabra (`\bdebe\b`, `\bdebería\b` / `\bdeberia\b`, `\bshall\b`, `\bshould\b`, insensible a mayúsculas).

## Criterios de Aceptación
- El bloque `CONTENIDO` colapsa y expande correctamente manteniendo la preferencia durante la sesión.
- Los badges (`debe`, `debería`, `shall`, `should`) solo se renderizan cuando su conteo es mayor que `0` y coinciden con el HTML expandido visible.
- El selector muestra exactamente `es`, `en`, `ambos` y no existe el texto `sub-cláusulas embebidas`.
