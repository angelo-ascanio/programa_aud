# Step Final: Auditoría Transversal, Pruebas Automatizadas y Verificación E2E

## Objetivo
Validar la integridad arquitectónica, tipado estricto, reglas visuales/documentales y flujos de extremo a extremo tras completar los pasos `1` a `4.1`.

## 1. Compuertas de Calidad CLI
Ejecutar en orden y garantizar cero errores:
1. `npx tsc --noEmit` (cumplimiento estricto `0 any`, tipos sincronizados en `RequisitoViewState` y `clauseRenderer.ts`).
2. `npm run lint` (sin símbolos huérfanos, imports no usados o referencias al modal eliminado).
3. `npm run build` (empaquetado Vite + Express 5 limpio).
4. `npx --yes tsx --test src/lib/*.test.ts` (todas las suites pasando al 100%).

## 2. Cobertura Mínima de Pruebas Unitarias (`node:test`)
- **`src/lib/clauseRenderer.test.ts`:**
  - Regla 1 (`title` presente → `{codigo} {title}` en negrita + cuerpo en siguiente fila).
  - Regla 2 (sin `title` + `explicit_code: true` → `{codigo}` en negrita inline en la misma fila).
  - Regla 3 (sin `title` + `explicit_code: false` → sin código, espaciado compacto continuo).
  - Ausencia de chips/bordes laterales (`border-l-2`, `bg-indigo-50`) y presencia de trigger discreto sobre códigos en negrita cuando `interactiveLinks: true`.
  - Conteo exacto de `debe`, `debería`, `shall` y `should` (insensible a mayúsculas, sin contar etiquetas HTML ni falsos positivos).
- **`src/lib/normaFullReader.test.ts` & `src/lib/extraDomain.test.ts`:**
  - Ordenamiento jerárquico completo sin ciclos, búsqueda ES/EN con resaltado seguro, y generación de botón `Ver Norma` sin modal popup en `normaView.ts`.
  - Modo `read` de `requisitoView.ts` sin badge `NIVEL`, sin `subtitle`, sin `Nivel y Cobertura Bilingüe`, sin `explicit_code` visible y sin `sub-cláusulas embebidas`.

## 3. Auditoría Transversal de Estándares
- **Zero-UUID:** Verificar ausencia de UUIDs crudos en botones, breadcrumbs, atributos visibles y mensajes.
- **Clean List:** Tablas de `Norma` con `table-fixed`, `<colgroup>` sumando `100%` y cero `<button>` dentro de `<tbody>`.
- **Aislamiento de `Auditoría`:** Confirmar cero cambios no deseados en `programacionView.ts`, `resultadoView.ts`, `auditoriasView.ts` y `calendarioView.ts`.

## 4. Verificación E2E en Navegador (`playwright-cli`, Desktop >= 1280px)
1. Abrir `Norma` (`ISO 9001:2015`) y verificar que existe **`Ver Norma`** (sin modal popup).
2. Pulsar **`Ver Norma`** → confirmar redirección directa a `requisitoView.ts` con la norma completa legible bajo las Reglas 1–3.
3. Abrir cláusula `4.1` o `8.5` → verificar:
   - Sin badge de nivel, sin subtítulo y sin campo `explicit_code` en modo lectura.
   - Barra de navegación de 1 fila × 3 columnas **encima** del bloque HTML, sin contador `Sub-cláusulas directas`.
   - Bloque `CONTENIDO` colapsable, badges de conteo `> 0` y botones `es` / `en` / `ambos`.
   - Clic en código en negrita embebido navega a la sub-cláusula correcta sin desbordamiento horizontal ni errores de consola.
4. Verificar edición (`edit`) comprobando que `explicit_code` sí aparece editable y guarda sin regresiones.
