# Step 2.4 — Capa de Hidratación y Persistencia Transaccional Supabase para Registros Compartidos

## 1. Objetivo y Alcance Estricto
Conectar los dominios puros de los Steps 2.1–2.3 con Supabase en `src/lib/certificadoSharePersistence.ts` y actualizar la hidratación en `src/main.ts` para leer y persistir de forma atómica/progresiva, segura, idempotente y Zero-UUID:
- `contacto_certificado_compartido`
- `turno_certificado_compartido`
- `proceso_certificado_compartido` + `requisitos_por_proceso` con `id_certificado`
- `sitio_certificado_compartido` + `procesos_por_sitio` con `id_certificado`

**Límites estrictos:**
- **NO** implementar aún los botones ni modales de UI (`step_3.1.md` y `step_3.2.md`).

---

## 2. Archivos Afectados
- `src/lib/certificadoSharePersistence.ts` *(nuevo módulo de persistencia y traducción de errores)*
- `src/lib/certificadoSharePersistence.test.ts` *(nueva suite `node:test` para validación UUID, payloads idempotentes y traductor de errores SQL)*
- `src/main.ts` *(únicamente sección de hidratación de certificados ~líneas 29000–29620 y mutaciones existentes de `requisitos_por_proceso` / `procesos_por_sitio` para incluir `id_certificado`)*

---

## 3. Decisiones Técnicas Detalladas

### 3.1 Hidratación Completa y Segura en `src/main.ts`
En el bloque de hidratación de certificados (`loadCertificatesFromDb` / equivalente en `src/main.ts`):
1. Consultar en paralelo las nuevas tablas activas (`.is('deleted_at', null)`):
   - `contacto_certificado_compartido` (`id, id_contacto, id_certificado`)
   - `turno_certificado_compartido` (`id, id_turno, id_certificado, id_certificado_origen`)
   - `proceso_certificado_compartido` (`id, id_proceso, id_certificado`)
   - `sitio_certificado_compartido` (`id, id_sitio, id_certificado, numero_sitio`)
2. Actualizar consultas existentes:
   - `requisitos_por_proceso`: incluir **`id_certificado`** en `.select('id_proceso, id_certificado, id_requisito, requisito:id_requisito ( id, codigo, ruta_materializada )')`. Agrupar requisitos por clave compuesta **`${procId}::${certId}`** (y poblar `requisitos_by_certificado` + las `clausulas_cubiertas` / `requisitos_detalle` exactas del certificado que está siendo ensamblado).
   - `procesos_por_sitio`: incluir **`id_certificado`** en `.select('id, id_sitio, id_proceso, id_certificado')` y asignar cada enlace únicamente a la vista del certificado `certId` que coincida con `row.id_certificado` (o si viene nulo en mocks legacy, inferir del sitio propietario).
3. Ensamblaje en cada `CertificadoDetailEntity`:
   - `contactos`: incluir contactos propios (`c.id_certificado === certId`) **y** contactos presentes en `contacto_certificado_compartido` donde `link.id_certificado === certId`, preservando `ownerCertId`, `sharedFromCertId` (ocultando código/nombre de org origen si no existe en `data` por RLS `CLIENT`!), y `sharedTargets` (solo de certificados visibles).
   - `turnos`: unir turnos provenientes de `turnos_por_sitio` en sitios del certificado (propios o compartidos) **y** turnos presentes en `turno_certificado_compartido` para `certId`.
   - `procesos`: incluir procesos propios (`p.id_certificado === certId`) **y** procesos presentes en `proceso_certificado_compartido` donde `link.id_certificado === certId`, cada uno con sus `clausulas_cubiertas` y `requisitos_detalle` extraídos estrictamente de `reqsByProcesoAndCert.get(`${procId}::${certId}`)`.
   - `sitios`: incluir sitios propios (`s.id_certificado === certId`) **y** sitios presentes en `sitio_certificado_compartido` para `certId` utilizando `link.numero_sitio` como el `numero_sitio` del sitio dentro de ese certificado y ordenando `Sitio 0` primero.
4. **Actualización de mutaciones existentes de `requisitos_por_proceso` y `procesos_por_sitio` en `src/main.ts`:**
   - Asegurar que al guardar/eliminar cláusulas en `procesoView` (`upsert` / `delete` en `requisitos_por_proceso`), siempre se filtre y envíe **`id_certificado: activeCertId`**, evitando borrar o colisionar cláusulas de otros certificados compartidos.
   - Asegurar que al vincular `procesos_por_sitio` desde `sitioView`, se envíe **`id_certificado: activeCertId`**.

### 3.2 Operaciones Transaccionales en `src/lib/certificadoSharePersistence.ts`
Implementar funciones con inyección de cliente `SupabaseClient` tipado (`0 any`), validación `assertValidUuid()` en cada ID, y manejo de re-activación de vínculos previamente archivados (`deleted_at IS NOT NULL` → `UPDATE SET deleted_at = NULL` en lugar de fallar duplicado, o `INSERT` nuevo):
1. **`persistShareContactos(supabase, params)`**: inserta/reactiva filas en `contacto_certificado_compartido`.
2. **`persistShareTurnos(supabase, params)`**: inserta/reactiva filas en `turno_certificado_compartido` y opcionalmente en `turnos_por_sitio` para sedes destino seleccionadas.
3. **`persistShareProcesos(supabase, params)`**:
   - Paso A: Inserta/reactiva en `proceso_certificado_compartido`.
   - Paso B: Inserta/upsert los `id_requisito` resueltos por certificado destino en `requisitos_por_proceso` con `{ id_proceso, id_certificado: targetCertId, id_requisito }`.
   - Rollback compensatorio seguro: si falla la inserción de requisitos en Paso B tras crear un nuevo enlace de `proceso_certificado_compartido`, archiva vía `archive_record` el enlace recién creado para no dejar estado inconsistente.
4. **`persistShareSitios(supabase, params)`**:
   - Paso A: Si hay procesos nuevos a compartir con los certificados destino, ejecuta `persistShareProcesos` primero (validado con su resolución de cláusulas).
   - Paso B: Inserta/reactiva en `sitio_certificado_compartido` (con `numero_sitio` asignado).
   - Paso C: Inserta/reactiva `turno_certificado_compartido` para turnos del sitio en destino y los enlaces `procesos_por_sitio` (`id_certificado: targetCertId`, `id_sitio`, `id_proceso`) seleccionados.
5. **`persistUnlinkSharedChild(supabase, tableName, linkId, reason)`**:
   - Valida `linkId` (`assertValidUuid`), verifica dependencias previas si es `sitio` (ej. `sitios_por_auditoria` en ese certificado) y llama a `supabase.rpc('archive_record', { p_table_name, p_record_id: linkId, p_reason: reason })`.
6. **`translateShareDbError(err)`**:
   - Traduce errores PostgreSQL (`P0001`, `23505`, RLS `42501`, `REQ_EXCLUDED_BY_ISO43`, `Conglomerado`, etc.) a mensajes limpios en español **sin ningún UUID crudo**.

---

## 4. Criterios de Aceptación y Verificación
1. **Suite `src/lib/certificadoSharePersistence.test.ts`:**
   - Rechazo inmediato mediante `assertValidUuid` ante cualquier ID inválido o mock no-UUID (`containsRawUuid` limpio en errores).
   - Verificación de rollback compensatorio simulado cuando falla la fase de `requisitos_por_proceso`.
   - Traducción Zero-UUID de errores `P0001` y `23505` de las 4 tablas compartidas.
   - Verificación de hidratación dual (`X` e `Y` compartiendo proceso con distintas normas) garantizando que `X.procesos[0].clausulas_cubiertas` y `Y.procesos[0].clausulas_cubiertas` permanecen aisladas.
2. Ejecutar `npm run lint && npm test && npm run build` verificando compilación limpia sin regresiones.
