# Step 1: Limpieza de Cabecera y Zona de Datos en `Requisito`

## Objetivo
Reducir ruido visual y optimizar el espacio vertical del modo lectura (`read`) en `src/views/requisitoView.ts`, conservando intactos los campos de edición en `add` y `edit`.

## Archivos Afectados
- `src/views/requisitoView.ts`

## Cambios Específicos

### 1. Zona de Título (`renderDetailPageTemplate`)
- **Eliminar `statusBadge`:** Quitar el badge `NIVEL X · RAÍZ` / `NIVEL X · SUB-CLÁUSULA` en `renderRequisitoView`.
- **Eliminar `subtitle`:** Omitir `subtitle` en `renderDetailPageTemplate` (o dejarlo `undefined` en modo lectura y alta) para mantener el encabezado en una sola línea limpia: icono `🌳` + `Cláusula {codigo}` (o `Nuevo Requisito Normativo` en `add`).

### 2. Zona de Datos en Modo Lectura (`renderRequisitoReadOnlyBody`)
- **Eliminar campo `Nivel y Cobertura Bilingüe`:** Quitar la tarjeta que muestra `Nivel X (Principal/Sub-cláusula)` y el badge de `getRequisitoContentStatus`.
- **Ocultar `explicit_code` en modo lectura (`read`):** No renderizar el bloque `Código explícito en texto` cuando `mode === 'read'`.
  - Mantener el checkbox `#reqExplicitCodeInput` (`renderDetailBooleanField`) **exclusivamente** dentro de `renderRequisitoFormBody` para los modos `'add'` y `'edit'`.
- **Mostrar únicamente `codigo` en lectura:** Reemplazar la rejilla de 3 columnas (`grid-cols-1 sm:grid-cols-3`) por una presentación compacta de una sola métrica (`codigo`) sin ocupar una fila completa desperdiciada (por ejemplo, una franja compacta inline o integrada en el borde superior del cuerpo de lectura).

## Criterios de Aceptación
- En modo `read`, no aparece ningún badge `NIVEL ...`, ningún subtítulo debajo del `<h1>`, ni la tarjeta `Nivel y Cobertura Bilingüe`, ni el campo `explicit_code`.
- En modos `add` y `edit`, `explicit_code` sigue editable y persiste normalmente.
- `npm run lint` y `npx --yes tsx --test src/lib/extraDomain.test.ts` pasan sin regresiones.
