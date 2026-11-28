# Paso 1.1 — Catálogo Tipado de Bloques, Secciones, Cascada Padre→Hijos y Metadatos SQL

> **Objetivo:** Construir el módulo de dominio puro que modela los **3 bloques operativos** (`Auditoría`, `Certificación`, `Extra`), sus secciones seleccionables, la regla automática de **cascada Padre → Hijos**, el cierre topológico de dependencias FK y los metadatos de conflicto SQL por tabla (alineados a `01_creacion.sql` y `03_indices_optimizacion.sql`).

---

## 1. Archivos Exactos a Crear o Modificar

- **Crear:**
  - `src/lib/sqlSeedSyncCatalog.ts`
  - `src/lib/sqlSeedSyncCatalog.test.ts`
- **No modificar en este paso:** `server.ts`, `src/main.ts`, `src/views/*`, `public/supabase/queries/*`, `src/lib/dbBackupCsv.ts`.

---

## 2. Reglas Técnicas Clave

1. **Definición Exacta de los 3 Bloques (`SqlSeedBlockId = 'auditorias' | 'certificacion' | 'extra'`):**
   - **Bloque `auditorias` (`Auditoría`):**
     - `auditorias.calendario` (`Calendario`): `configuracion_alerta_auditoria`.
     - `auditorias.designacion.relacion` (`1.1 Relación`): `programa_auditoria`, `auditoria` (contexto base y naturaleza).
     - `auditorias.designacion.tipo` (`1.2 Tipo`): `auditoria` (tipo, metodología, objetivo, ciclo).
     - `auditorias.designacion.fecha` (`1.3 Fecha`): `auditoria_fecha` (preprogramada/programada).
     - `auditorias.designacion.sitio` (`1.4 Sitio`): `sitios_por_auditoria`.
     - `auditorias.designacion.temporal` (`1.5 Temporal`): `auditoria_sitio_temporal`, `auditoria_sitio_temporal_certificado`.
     - `auditorias.tiempo` (`2. Tiempo`): `auditoria`, `sitios_por_auditoria`, `auditoria_sitio_temporal`.
     - `auditorias.auditor` (`3. Auditor`): `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal`, `equipo_auditor_proceso_sitio`, `experto_tecnico_auditoria` *(nota: `equipo_auditor` se recalcula vía trigger al insertar los cubos, aunque puede declararse como derivada/verificada)*.
     - `auditorias.proceso` (`4. Proceso`): `procesos_sitio_auditoria`.
     - `auditorias.turno` (`5. Turno`): `turnos_sitio_auditoria`, `turnos_proceso_sitio_auditoria`.
     - `auditorias.resultado` (`6. Resultado`): `auditoria_fecha` (`REAL`), `auditoria`, `hallazgo`, `comentarios_por_auditoria`.
     - `auditorias.revision` (`7. Revisión`): `auditoria` (campos QA `revisado`, `fecha_revision`, `revisado_por`, `documentacion_completa`, `resumen_revision`).
     - `auditorias.resumen` (`Resumen`): unión completa de todas las secciones de Bloque 1.
   - **Bloque `certificacion` (`Certificación`):**
     - `certificacion.conglomerado` (`Conglomerado`): `grupo_empresarial`.
     - `certificacion.organizacion` (`Organización`): `organizacion`, `organizacion_version`, `client_organization_access`.
     - `certificacion.certificado` (`Certificado`): **cascada Padre → Hijos completa** incluyendo `certificado`, `certificado_version`, `alcance`, `alcance_certificado_compartido`, `sitio`, `sitio_certificado_compartido`, `fecha_certificado`, `contacto_certificado`, `telefono_contacto_certificado`, `email_contacto_certificado`, `contacto_certificado_compartido`, `proceso`, `proceso_certificado_compartido`, `procesos_por_sitio`, `requisitos_por_proceso` (**Cláusulas**), `requisitos_no_aplicables_certificado`, `turno`, `turnos_por_sitio`, `turno_certificado_compartido`.
     - `certificacion.vinculo` (`Vínculo`): `vinculo`, `vinculo_certificado`.
     - `certificacion.auditor` (`Auditor`): `auditor`, **`telefono_auditor`, `email_auditor`, `evaluacion_in_situ_auditor`**, `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`.
     - `certificacion.experto` (`Experto`): `experto_tecnico`, `telefono_experto_tecnico`, `email_experto_tecnico`, `sector_iaf_experto`, `subsector_iaf_experto`.
   - **Bloque `extra` (`Extra`):**
     - `extra.norma` (`Norma`): `norma`, `requisito`, `requisito_traduccion` — marcada explícitamente con `targetScript: '07_normas_requisitos_csv.sql'` (`specialCase: 'NORMAS_CSV_SEED'`).
     - `extra.sector_iaf` (`Sector IAF`): `sector_iaf`, `subsector_iaf`.
     - `extra.acreditacion` (`Acreditación`): `organismo_acreditacion`, `acreditacion_norma`, `acreditacion_norma_sector_iaf`.
     - `extra.estatus` (`Estatus`): `estatus`.
     - `extra.tipo` (`Tipo`): `tipo_auditoria`.
     - `extra.metodologia` (`Metodología`): `metodologia_auditoria`.

2. **Resolución de Selección, Cascada Padre→Hijos y Cierre Topológico (`resolveSyncSelectionPlan`):**
   - Implementar función pura `resolveSyncSelectionPlan(selectedSectionIds: readonly string[], options?: { includeParentFkDependencies?: boolean })` que retorne:
     - `expandedSectionIds`: secciones efectivas seleccionadas.
     - `targetFiles`: `Array<'06_datos_prueba.sql' | '07_normas_requisitos_csv.sql'>`.
     - `tablesFor06`: lista deduplicada en **orden topológico estricto Padre → Hijo** (ampliando `DB_TABLES_TOPO_ORDER` para incluir `telefono_auditor`, `email_auditor`, `evaluacion_in_situ_auditor` justo después de `auditor`).
     - `tablesFor07`: `['norma', 'requisito', 'requisito_traduccion']` si `extra.norma` fue seleccionada.
     - `cascadeSummaries`: descripción legible en español para la UI (ej. `"Certificado incluye Versiones, Alcances, Sitios, Fechas, Contactos, Procesos, Cláusulas y Turnos"`).
   - **Regla de Cierre FK:** Si el usuario selecciona únicamente `certificacion.certificado` pero en BD existe una organización o norma nueva referenciada por un certificado nuevo, el plan distingue entre **tablas objetivo de sincronización completa** (`primaryTables`) y **tablas de soporte FK** (`fkSupportTables`: solo inserta registros referenciados que falten en el destino SQL para evitar violaciones `23503`).

3. **Metadatos SQL Exactos por Tabla (`SQL_SYNC_TABLE_METADATA`):**
   - Cada tabla registra:
     - `tableName`, `targetFile` (`06_datos_prueba.sql` | `07_normas_requisitos_csv.sql`).
     - `pkColumns` (`['id']` o clave compuesta M:N).
     - `kind`: `'soft_delete_core' | 'soft_delete_child' | 'pure_mn_link' | 'trigger_derived'`.
     - `conflictClauseActive`: cláusula exacta `ON CONFLICT (...) [WHERE deleted_at IS NULL]` alineada a `03_indices_optimizacion.sql` (ej. `certificado` → `(numero_certificado) WHERE deleted_at IS NULL`; `proceso` → `(id_certificado_version, LOWER(TRIM(nombre_proceso))) WHERE deleted_at IS NULL`; `requisitos_por_proceso` → `(id_proceso, id_certificado_version, id_requisito)`).
     - `selfReferentialColumn?` (ej. `requisito.id_requisito_padre`, `programa_auditoria.id_ciclo_origen`).
     - `ltreeColumns?`, `jsonColumns?`, `excludedInsertColumns?` (ej. omitir columnas generadas si hubiera).

---

## 3. Checklist de Verificación

- [ ] `src/lib/sqlSeedSyncCatalog.ts` tipado en TypeScript estricto (`0 any`), cubriendo los 3 bloques y todas sus secciones.
- [ ] `certificacion.certificado` incluye explícitamente las 19 tablas de la cascada (`certificado` hasta `requisitos_por_proceso` y `turno_certificado_compartido`).
- [ ] `certificacion.auditor` incluye `telefono_auditor`, `email_auditor` y `evaluacion_in_situ_auditor`.
- [ ] `extra.norma` apunta explícitamente a `07_normas_requisitos_csv.sql`.
- [ ] `resolveSyncSelectionPlan` retorna orden topológico padre-antes-que-hijo sin duplicados.
- [ ] Ejecución exitosa de `npx tsx --test src/lib/sqlSeedSyncCatalog.test.ts` y `npm run lint`.
