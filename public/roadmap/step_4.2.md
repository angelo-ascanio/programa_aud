# Step 4.2: Selector / Autocompletado de Placeholders `{clause_...}` y Persistencia Bilingüe en `Requisito` (`requisitoView.ts` + `main.ts`)

## 1. Objetivo
Integrar el Rich Text HTML Editor dentro de `Requisito` Detail View (`'add' | 'edit'` modes), implementar el **Selector e Inserter contextual de Sub-cláusulas (`{clause_<code>}`)** —tanto por botón en barra como por disparador `{` al escribir— y cablear el guardado transaccional en `public.requisito` y `public.requisito_traduccion`.

---

## 2. Selector / Autocompletado de Sub-cláusulas (`Child Clause Placeholder Picker`)

### 2.1 Lógica Pura de Sugerencias (`src/lib/richTextEditor.ts`)
1. `buildChildPlaceholderSuggestions(targetReqId: string | undefined, allReqsOfNorma: ReadonlyArray<RequisitoLtree>, activeLang: 'es' | 'en', filterQuery = ''): ChildPlaceholderOption[]`:
   - Obtiene los hijos directos del requisito (`r.id_requisito_padre === targetReqId && !r.deleted_at`) ordenados numéricamente.
   - Para cada hijo devuelve:
     - `codigo`: ej. `5.1.2.a`
     - `token`: `{clause_5.1.2.a}`
     - `titlePreview`: título o primeros ~70 caracteres de texto plano en el idioma activo (o alterno).
     - `alreadyInserted`: booleano indicando si `{clause_<code>}` ya aparece en el contenido actual del editor (evita duplicados accidentales).
   - En modo `'add'` (antes de tener hijos propios), permite buscar cualquier cláusula hermana o existente de la misma norma (excluyendo ancestros para impedir ciclos).

### 2.2 Experiencia de Inserción en UI (`src/views/richTextEditor.ts` + `src/main.ts`)
1. **Botón en Toolbar (`+ Sub-cláusula { }`):**
   - Abre un popover anclado debajo de la barra con buscador rápido y la lista de hijos directos (`5.1.2.a`, `5.1.2.b`, ...) mostrando su estado (`✓ Insertado` o `Disponible`).
   - Hacer clic en una opción inserta `{clause_5.1.2.a}` (envuelto en un bloque `<div>{clause_5.1.2.a}</div>` si está en línea nueva o inline en el cursor) exactamente en la posición del `Selection`/`Range` guardado del `contenteditable` o en `selectionStart` del `<textarea>`.
2. **Disparador Inline por Teclado (`{`):**
   - Al teclear `{` dentro del editor `Visual` o `HTML`, abrir automáticamente el menú flotante de autocompletado filtrado con lo que el usuario escriba a continuación (ej. `{5.1` → filtra `5.1.2.a`, `5.1.2.b`), navegable con `ArrowUp`/`ArrowDown`/`Enter`/`Escape`.
   - Al confirmar, reemplaza el prefijo `{...` parcial por el token exacto `{clause_<code>}`.
3. **Indicador de Cobertura de Hijos:**
   - Si el requisito tiene hijos directos que aún no están referenciados por ningún `{clause_...}` en el contenido del idioma activo, mostrar una insignia discreta (`2 sub-cláusulas sin referenciar`) que al hacer clic permite insertarlas rápidamente.

---

## 3. Cableado en `requisitoView.ts` y Persistencia en `src/main.ts`

### 3.1 Zona 2 del Formulario `requisitoDetailForm` (`'add' | 'edit'`)
- Mantener los controles de cabecera (`renderDetailFormTopActions`: botón Guardar `bg-emerald-600` estrictamente antes que Cancelar `bg-rose-50`, cero botones al pie del formulario).
- Mantener los campos estructurales superiores (`codigo`, `explicit_code` mediante `renderDetailBooleanField`, y previsualización en vivo `reqRutaPreview` de `LTREE`).
- Debajo de los campos estructurales (dentro del mismo `<form id="requisitoDetailForm">`), incrustar `renderBilingualClauseEditor(...)` para `ES` y `EN`.

### 3.2 Flujo de Guardado (`requisitoDetailForm` Submit en `src/main.ts`)
1. **RBAC estricto:** verificar `isApprovedStaffProfile(state.profile)`. Usuarios `CLIENT`, `AUDITOR` o `PENDING_WORKER` permanecen bloqueados en modo `'read'`.
2. **Validación & Sanitización:**
   - Validar estructura `requisito` con `validateRequisitoDraft(...)` (unicidad de código en norma, sin ciclos en árbol `LTREE`).
   - Sanitizar `content_html_es` y `content_html_en` con `normalizeEditorHtmlOutput()`.
   - Verificar que no haya autorreferencia `{clause_<codigo_propio>}` ni ciclos de placeholders antes de guardar.
3. **Persistencia en Supabase (`requisito` + `requisito_traduccion`):**
   - Guardar/actualizar `public.requisito` (`id_norma`, `id_requisito_padre`, `codigo`, `explicit_code`, `ruta_materializada`).
   - Si cambió `codigo` o `id_requisito_padre` en modo `'edit'`, recalcular y persistir `ruta_materializada` de todos los descendientes LTREE afectados.
   - Para cada idioma (`'es'`, `'en'`) con `title` o `content_html` no vacío (o existente previamente):
     - Ejecutar `upsert` / `update` / `insert` sobre `public.requisito_traduccion` respetando `uq_requisito_traduccion_lang_active (id_requisito, lang) WHERE deleted_at IS NULL`.
   - Registrar la mutación en `recordPhase5SessionLog(...)` para `requisito` y `requisito_traduccion`.
   - Actualizar `state.domainData.requirementsCatalog`, `recalculateNormaClausulaCounts()`, salir a modo `'read'` y mostrar `showFloatingToast('Cláusula guardada correctamente.', 'success')`.

---

## 4. Criterios de Aceptación del Paso
- [ ] Al editar una cláusula de `ISO/IEC 27001:2022` o `NTF 4073:2022` que tiene hijos (`4.1`, `5.1`, etc.), el selector `{ }` lista exactamente sus hijos directos e inserta `{clause_...}` en la posición del cursor.
- [ ] Escribir `{` abre el autocompletado contextual y `Enter` completa `{clause_<code>}`.
- [ ] Al pulsar Guardar en cabecera (`bg-emerald-600`), la Vista Previa y el modo `'read'` reflejan inmediatamente el contenido bilingüe sanitizado y los placeholders expandidos, persistiendo en Supabase y en el estado local.
- [ ] Cero botones de guardar/cancelar al pie de Zona 2 y cero banners verdes inline (solo `showFloatingToast`).
