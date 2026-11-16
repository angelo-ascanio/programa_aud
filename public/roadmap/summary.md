# Roadmap: Rediseño Integral de Vistas `Requisito` y `Norma`

## 1. Visión General y Objetivos

Esta iteración simplifica la jerarquía visual de `Requisito` (`src/views/requisitoView.ts`), reemplaza los bloques recargados por lectura documental continua fiel a las normas ISO (`src/lib/clauseRenderer.ts`) y unifica la consulta de norma completa eliminando el modal emergente de `Norma` (`src/views/normaView.ts`, `src/main.ts`).

### Objetivos Clave
1. **Limpieza y Densidad Vertical en `Requisito`:** Eliminar metadatos internos (`NIVEL X · RAÍZ / SUB-CLÁUSULA`, `Nivel y Cobertura Bilingüe`, subtítulo de cabecera) y ocultar `explicit_code` en modo lectura (`read`).
2. **Navegación Compacta Arriba + Contenido Abajo:** Reubicar la barra de navegación encima del bloque HTML en una fila compacta de 3 columnas (`←` | vecinos arriba e hijos abajo | `→`), removiendo contadores redundantes y moviendo `+ Sub-cláusula` fuera de la barra.
3. **Bloque HTML Colapsable con Conteo Normativo:** Cabecera en 2 columnas (`CONTENIDO` colapsable | badges dinámicos `debe`/`debería` y `shall`/`should` con conteo `> 0` + selector `es`, `en`, `ambos`).
4. **Renderizado Documental Continuo (Reglas 1, 2 y 3):** Eliminar bordes/cajas en sub-cláusulas embebidas, aplicar tipografía natural según `title` y `explicit_code`, e integrar acceso rápido discreto directamente sobre los códigos en negrita.
5. **Visor Unificado de Norma:** Sustituir el modal `"Norma Completa"` en `normaView.ts` por el botón **`Ver Norma`** que redirige a `requisitoView.ts`, integrando dentro de la misma vista la lectura y navegación completa del estándar.

---

## 2. Mapa de Pasos Modulares

| Paso | Archivo | Alcance |
| :--- | :--- | :--- |
| **Step 1** | `public/roadmap/step_1.md` | Limpieza de cabecera y zona de datos en `requisitoView.ts` (`read` vs `add`/`edit`). |
| **Step 2** | `public/roadmap/step_2.md` | Swap navegación/HTML, barra compacta de 3 columnas y reubicación de `+ Sub-cláusula`. |
| **Step 3.1** | `public/roadmap/step_3.1.md` | Bloque HTML colapsable, cabecera de 2 columnas, badges `debe`/`debería`/`shall`/`should` y selector `es`/`en`/`ambos`. |
| **Step 3.2** | `public/roadmap/step_3.2.md` | Motor documental (`clauseRenderer.ts`): Reglas 1, 2 y 3, flujo continuo sin bordes y salto rápido en negrita. |
| **Step 4.1** | `public/roadmap/step_4.1.md` | Eliminación del modal popup, botón `Ver Norma` en `normaView.ts` y modo de norma completa integrado en `requisitoView.ts`. |
| **Step Final** | `public/roadmap/step_final.md` | Auditoría de reglas (`0 any`, Zero-UUID, Clean List), pruebas `node:test`, build y validación E2E en navegador. |

---

## 3. Reglas Transversales

- **TypeScript estricto (`0 any`)** en `src/lib/`, `src/views/` y `src/main.ts`.
- **Zero-UUID:** Ningún UUID visible al usuario en etiquetas, botones, tooltips o placeholders.
- **Clean List & 3-Zone Detail:** `table-fixed`, `<colgroup>` = `100%`, cero `<button>` en `<tbody>`, acciones de formulario arriba (`Guardar` en esmeralda antes de `Cancelar` en rosa).
- **Aislamiento de `Auditoría`:** Sin modificaciones en `programacionView.ts`, `resultadoView.ts`, `auditoriasView.ts` ni `calendarioView.ts`.
