# Step 4.1: Unificación del Visor de Norma (`normaView.ts` → `requisitoView.ts`)

## Objetivo
Eliminar el popup/modal emergente legacy de `"Norma Completa"` y unificar la lectura de toda la norma directamente dentro de `requisitoView.ts`, accesible desde un botón **`Ver Norma`** en `normaView.ts`.

## Archivos Afectados
- `src/views/normaView.ts`
- `src/views/requisitoView.ts`
- `src/lib/normaFullReader.ts` (refactorizar para reutilizar helpers puros de ordenamiento/búsqueda/resaltado sin modal, o eliminar código muerto del modal)
- `src/main.ts`
- `src/lib/normaFullReader.test.ts`

## Cambios Específicos

### 1. Reemplazo en `normaView.ts`
- Quitar el botón `#openNormaFullReaderBtn` (`data-action="open-norma-full-reader"`, etiqueta `"Norma Completa"`).
- Añadir el botón **`Ver Norma`** (`id="viewNormaReaderBtn"`, `data-action="open-norma-in-requisito"`, `data-norma-id="${escapeHtml(norma.id)}"`), visible para todos los roles en modo lectura (`read`).
- Al pulsarlo en `src/main.ts`, redirigir directamente a `requisitoView.ts` cargando la norma seleccionada en modo **Norma Completa** (o enfocando el primer capítulo raíz con el visor completo disponible).

### 2. Eliminación del Popup/Modal Legacy
- Remover `renderNormaFullReaderModal`, `#normaFullReaderBackdrop`, y el estado/listeners asociados en `src/main.ts` (`normaFullModalOpen`, `normaFullModalQuery`, `normaFullModalLang`, `close-norma-full-modal`).
- Conservar en `src/lib/normaFullReader.ts` (o trasladar a `extraDomain.ts` / `clauseRenderer.ts`) las funciones puras reutilizables: `orderNormaRequisitosHierarchically`, `highlightSanitizedClauseHtml`, filtrado por búsqueda y renderizado de norma completa.

### 3. Modo "Norma Completa" Integrado en `requisitoView.ts`
- Ampliar `RequisitoViewState` con estado integrado de lectura completa:
  - `readerScope?: 'clause' | 'full_norma'` (por defecto `'clause'` al abrir un requisito específico; `'full_norma'` al entrar desde `Ver Norma`).
  - `fullNormaQuery?: string` para búsqueda instantánea dentro de toda la norma.
- Permitir al usuario alternar sin fricción dentro de `requisitoView.ts`:
  - Estando en una cláusula específica (ej. `4.1`), ofrecer un control discreto en cabecera o barra de navegación para cambiar a **`Norma Completa`** (y volver a la cláusula activa con un clic o seleccionando cualquier capítulo/cláusula del texto).
  - En modo `full_norma`, renderizar todos los capítulos y cláusulas ordenados jerárquicamente usando las mismas **Reglas 1, 2 y 3** y el mismo selector **`es` / `en` / `ambos`** + conteos normativos (`debe`, `debería`, `shall`, `should`), con salto rápido integrado a cualquier cláusula individual al pulsar su código en negrita.
- Mantener la integridad del breadcrumb (`Normas` → `{Norma.codigo}` → `Norma Completa` / `Cláusula {codigo}`).

## Criterios de Aceptación
- No existe ningún popup/modal emergente para leer la norma completa en el DOM ni en `src/main.ts`.
- En `normaView.ts`, el botón `Ver Norma` redirige directamente a `requisitoView.ts` mostrando la norma navegable sin errores.
- Desde cualquier cláusula en `requisitoView.ts` se puede consultar la norma completa y regresar a una cláusula puntual de forma fluida.
