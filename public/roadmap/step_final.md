# Paso Final: Reset Limpio de Base de Datos, Auditoría SQL Integral, Verificación E2E (4 Roles) y Sincronización `public/doc/`

**Dependencias:** Todos los pasos anteriores (`1.1` → `4.1`) implementados.
**Objetivo:** Ejecutar un reinicio limpio completo de la base de datos (`00` → `07.sql`), validar matemáticamente las invariantes de cobertura, proporcionalidad, competencias y RLS, correr toda la batería automática (`npm test`, `npm run lint`, `npm run build`), inspeccionar visualmente la aplicación en navegador real (4 roles) y actualizar `public/doc/*`.

---

## 1. Reset Limpio de Base de Datos (`POST /api/reset-db`)

1. Arrancar o reiniciar el servidor (`npm run dev` / endpoint de reset) y ejecutar el reinicio completo de scripts (`00_delete_tables.sql` → `07_normas_requisitos_csv.sql`):
   ```bash
   curl -sS -X POST http://localhost:3000/api/reset-db
   ```
   Confirmar respuesta HTTP `200` con `0` errores SQL en consola del servidor.
2. Verificar idempotencia ejecutando `06_datos_prueba.sql` seguido de `07_normas_requisitos_csv.sql` una segunda vez para confirmar que todos los `ON CONFLICT` son seguros y no duplican filas.

---

## 2. Batería de Consultas de Auditoría SQL (PostgreSQL / Supabase)

Ejecutar y verificar que todas las aserciones pasen:

1. **Cobertura Normativa 100.00% en los 8 certificados de `CONG-IND-01`:**
   ```sql
   SELECT c.codigo_certificado, r.total_obligatorios, r.cubiertos_por_proceso,
          r.excluidos_no_aplicables, r.pendientes, r.porcentaje_cobertura, r.cobertura_completa
   FROM public.certificado c
   CROSS JOIN LATERAL public.resumen_cobertura_certificado(c.id) r
   WHERE c.deleted_at IS NULL
     AND c.id_organizacion IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003')
   ORDER BY c.codigo_certificado;
   ```
   *(Esperado: 8 filas, todas con `pendientes = 0`, `porcentaje_cobertura = 100.00` y `cobertura_completa = TRUE`.)*

2. **Regla `multisitio` vs cantidad de sitios y turnos por certificado (`1..6`):**
   ```sql
   SELECT c.codigo_certificado, c.multisitio,
          COUNT(DISTINCT s.id) FILTER (WHERE s.deleted_at IS NULL) AS sitios,
          COUNT(DISTINCT tps.id_turno) FILTER (WHERE tps.deleted_at IS NULL) AS turnos_distintos,
          MIN(s.personal_count) AS min_personal, MAX(s.personal_count) AS max_personal
   FROM public.certificado c
   LEFT JOIN public.sitio s ON s.id_certificado = c.id
   LEFT JOIN public.turnos_por_sitio tps ON tps.id_sitio = s.id
   WHERE c.deleted_at IS NULL
     AND c.id_organizacion IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003')
   GROUP BY c.codigo_certificado, c.multisitio
   ORDER BY c.codigo_certificado;
   ```
   *(Esperado: `multisitio = FALSE` → `sitios = 1`; `multisitio = TRUE` → `sitios >= 3`; `turnos_distintos` entre `1` y `6`.)*

3. **Proporcionalidad `0.25d`, Calificación 100% y Cero Auditores/Resultados en Futuras (`+1`/`+2` años):**
   ```sql
   -- Cuartos de día válidos
   SELECT COUNT(*) AS tiempos_invalidos
   FROM public.sitios_por_auditoria
   WHERE deleted_at IS NULL AND MOD((tiempo_auditoria * 4)::NUMERIC, 1) <> 0;

   -- Competencia técnica de cada asignación
   SELECT COUNT(*) AS asignaciones_no_calificadas
   FROM public.equipo_auditor ea
   JOIN public.auditoria a ON a.id = ea.id_auditoria AND a.deleted_at IS NULL
   JOIN public.certificado c ON c.id = a.id_certificado AND c.deleted_at IS NULL
   WHERE NOT public.auditor_esta_calificado(ea.id_auditor, c.id_norma, c.id_sector_iaf, c.id_subsector_iaf);

   -- Futuras sin auditores, sin hallazgos y sin cierre/revisión
   SELECT COUNT(*) AS futuras_contaminadas
   FROM public.auditoria a
   WHERE a.deleted_at IS NULL
     AND a.codigo_auditoria ~ '^AUD-202[78]-'
     AND (
         EXISTS (SELECT 1 FROM public.equipo_auditor ea WHERE ea.id_auditoria = a.id)
         OR EXISTS (
             SELECT 1
             FROM public.equipo_auditor_sitio eas
             JOIN public.sitios_por_auditoria spa ON spa.id = eas.id_sitios_por_auditoria
             WHERE spa.id_auditoria = a.id
               AND eas.deleted_at IS NULL
               AND spa.deleted_at IS NULL
         )
         OR EXISTS (SELECT 1 FROM public.hallazgo h WHERE h.id_auditoria = a.id AND h.deleted_at IS NULL)
         OR a.revisado = TRUE
         OR a.estado_ciclo = 'Cerrada'
     );
   ```
   *(Esperado: `0` tiempos inválidos, `0` asignaciones no calificadas y `0` futuras contaminadas.)*

4. **Integridad de Contactos, Fechas y Preservación de `CONG-CYB-01` / `CONG-ALM-01`:**
   - Todos los 8 certificados de `CONG-IND-01` tienen `>= 1` contacto con teléfono y correo.
   - `40...0008` (`FN-QMS-2026-008`) sigue `LIBRE` (`0` filas en `vinculo_certificado`, `0` filas en `auditoria`).
   - `CONG-ALM-01` (`AUD-ALM-2026-010..011`) y `CONG-CYB-01` (`AUD-2022-001`) intactos.

---

## 3. Verificación Técnica de Código (`npm test`, `lint`, `build`)

Ejecutar en `/app/applet`:
- `npm test` — todas las suites unitarias en verde (incluyendo `phase11SqlMigration.test.ts`, `phase12RlsHardening.test.ts`, `step101SqlSchema.test.ts`, `revisionDomain.test.ts`, `multisiteSampling.test.ts`, `sitioDomain.test.ts`, `requisitoCsvImporter.test.ts`).
- `npm run lint` — `0` errores TypeScript/ESLint y `0 any`.
- `npm run build` — compilación limpia de producción Vite.

---

## 4. Verificación Visual E2E en Navegador Real (Matriz 4 Roles)

Usando `playwright-cli` (`http://localhost:3000`) en escritorio (`1440×900`) y móvil (`390×844`):
1. **`ADMIN` (`admin@fondonorma.test`):**
   - `Conglomerado` → `Grupo Industrial Iberometal` muestra `Iberometal Componentes S.A.` y `Example, C.A.`, resumen consolidado sin UUIDs visibles.
   - `Certificado` → inspeccionar `FN-QMS-2024-001` y `FN-QMS-2025-004`: confirmar pestañas `Sitios` (con `Personal` `195, 88, 36, 16`), `Procesos` (`100%` cobertura normativa), `Exclusiones` (`8.3` correctamente marcada), `Fechas` (`Otorgamiento`, `Renovación`, `Ultima Auditoría`, `Vencimiento`) y `Contactos`.
   - `Auditoría` → validar pasos `Vínculo` (`FN-QMS-2026-008` libre; `Integrada`, `Combinada`, `Multientidad`, `Individual` vinculadas), `Programa` / `Sitio` / `Tiempo` (`0.25d` proporcional a dotación), `Equipo` (0 asignados en futuras `2027/2028`), `Hallazgos` (`+15d/+45d`) y `Revisión` (`Pendientes de Revisión` vs `Historial Revisadas`).
2. **`AUDITOR` (`auditor@fondonorma.test`):** confirmar visibilidad de sus auditorías asignadas y solo lectura en catálogo/admin.
3. **`CLIENT` (`client@fondonorma.test`):** confirmar aislamiento estricto Nivel 2: ve `Iberometal Componentes S.A.` (`FN-QMS-2024-001`, `FN-EMS-2025-002`, `FN-SST-2025-010`, `FN-QMS-2026-008`) y **nunca** ve `Example, C.A.` ni `CyberCloud`.
4. **`WORKER` (`worker@fondonorma.test`):** verificar lectura/operación acorde a permisos RBAC sin errores de consola ni respuestas HTTP `500`.

---

## 5. Sincronización de Documentación (`public/doc/*`)

Actualizar los archivos en `public/doc/` **únicamente en este paso final** una vez verificado todo el escenario en BD y navegador:
- `public/doc/project_resume.md`: reflejar el escenario demostrativo enriquecido de `Grupo Industrial Iberometal` (8 certificados, 100% cobertura, 6 auditores, historial multi-anual y futuras `+1/+2`).
- `public/doc/database_architecture.md`: documentar la nueva columna `public.sitio.personal_count`, la corrección de exclusión `8.3` y los rangos de semillas actualizados.
- `public/doc/frontend_architecture.md`: documentar la exposición y edición de `personal_count` en `sitioView.ts` / `certificadoView.ts` / `sitioDomain.ts`.
- `public/doc/testing_and_operations.md`: actualizar los conteos reales de cobertura 100%, auditores, vínculos y criterios de reset limpio `00`→`07.sql`.
