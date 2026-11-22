# Paso 4.1: Detalle Operativo de Auditorías (`Sitios` Proporcionales `0.25d`, `Procesos`, `Turnos`, `Equipos` sin Futuras, `Hallazgos` y `Cierre QA`)

**Dependencias:** Pasos 2.1, 3.1 y 3.2 completados.
**Objetivo:** Completar el detalle operativo de todas las auditorías creadas o enriquecidas en el Paso 3.2, garantizando proporcionalidad estricta `personal_count ↔ tiempo_auditoria` (`0.25d`), asignación coherente de procesos y turnos por sitio, equipos de auditores 100% calificados y libres de choques (cero equipos en futuras `+1/+2`), hallazgos realistas con plazos `+15d/+45d`, comentarios de campo y cierres QA consistentes.

---

## 1. Reconciliación de `Sitio 0` y Asignación Proporcional en `sitios_por_auditoria` (Sección `-- 20.`)

1. **Bloque `DO $$` de Reconciliación ID (`trg_auto_asignar_sitio_principal_auditoria`):**
   - Ampliar la tabla `VALUES` del bloque `DO $$ ... END $$;` previo a la sección `-- 20.` para incluir **cada nueva auditoría** (`8000...0015` .. `8000...0033`) emparejada con el UUID del `Sitio 0` de su certificado (`50...0000`, `50...0002`, `50...0020`, `50...0004`, `50...0005`, `50...0006`, `50...0007`) y un ID determinista `9000...0011..0059`.
   - Esto evita filas duplicadas de `Sitio 0` tras la auto-inserción del trigger.
2. **Regla estricta de proporcionalidad `personal_count ↔ tiempo_auditoria` (múltiplos de `0.25d`):**
   - En **toda auditoría** (histórica, en curso y futura `+1/+2`) con múltiples sitios en alcance:
     - **HQ / Planta Principal (`Sitio 0`, `135–195` personas):** mayor carga de días (`2.25d – 3.50d` en Etapa 2/Renovación; `1.50d – 2.25d` en Seguimientos).
     - **Planta Secundaria (`Sitio 1`, `52–88` personas):** carga intermedia (`1.50d – 2.00d` en Etapa 2/Renovación; `1.00d – 1.50d` en Seguimientos).
     - **Centro Logístico (`Sitio 2`, `24–38` personas):** carga acotada (`0.75d – 1.25d`).
     - **Oficina Comercial/Administrativa (`Sitio 2/3`, `12–18` personas):** mínima carga (`0.50d – 0.75d`).
   - El trigger `trg_recalcular_tiempo_auditoria_desde_sitios` actualizará automáticamente `auditoria.tiempo_auditoria = SUM(sitios_por_auditoria.tiempo_auditoria)`.
3. **Ajustar también las auditorías futuras existentes (`8000...0009..0012`):**
   - Incluir sus sitios secundarios de `FN-QMS-2025-004` (`50...0014` `64p` → `1.00d`, `50...0015` `18p` → `0.50d`) y `FN-EMS-2025-005` (`50...0016` `58p` → `1.00d`, `50...0017` `12p` → `0.50d`) junto a `Sitio 0` (`1.75d` / `2.25d` en Renovación) para que `FN-QMS-2025-004` y `FN-EMS-2025-005` también luzcan muestreo multisitio proporcional preconfigurado en `+1` y `+2` años.
4. **Sitios Temporales (`auditoria_sitio_temporal` + `auditoria_sitio_temporal_certificado`, Sección `-- 20a.`):**
   - Mantener `9a00...0001` en `AUD-2026-001` (`PROYECTO Obra Planta Sur`, `1.00d`, vinculado a `8000...0004` y `8000...0005`).
   - Agregar opcionalmente un segundo sitio temporal cerrado en histórico (`AUD-2025-001` `8000...0002`, `9a00...0002`, `"Montaje Puente Grúa Sector Norte"`, `0.50d`) o en campaña Multientidad (`AUD-2026-003` `8000...0006`, `9a00...0003`, `"Frente de Obra Bahía Despacho"`, `0.75d`) para ejercitar Paso 5 en múltiples programas.

---

## 2. Turnos, Procesos y Turnos por Proceso en Auditoría (Secciones `-- 20b.`, `-- 20c.`, `-- 20d.`)

1. **Cobertura completa en pasadas, en curso Y futuras (`AUD-2027-*` y `AUD-2028-*`):**
   - Según especificación, las auditorías futuras preprogramadas (`+1`/`+2` años) **SÍ** deben traer preconfigurados sus **Sitios** (`20.`), **Turnos por Sitio** (`20b.`), **Procesos por Sitio** (`20c.`) y **Turnos por Proceso** (`20d.`), porque corresponden a la planificación del programa trienal.
   - Asegurar que cada `turnos_sitio_auditoria` coincida con el `id_sitio` de `sitios_por_auditoria`, que cada `procesos_sitio_auditoria.id_procesos_por_sitio` pertenezca al mismo `id_sitio` (`fn_validar_proceso_sitio_auditoria_certificado`) y que los turnos asignados a una oficina comercial sean únicamente `T4 Administrativo` (nunca turnos nocturnos de fundición).
   - Mantener `9600...0007` en `AUD-2026-005` (`8000...0008`, `Escenario D Parcial`) intencionalmente con su asignación parcial para preservar los escenarios de alertas de programación en `auditDomain.ts` y `searchControls.ts`.

---

## 3. Equipos de Auditores (`equipo_auditor_sitio` y `equipo_auditor_proceso_sitio`, Sección `-- 21.`)

Aplicar **tres invariantes no negociables**:
1. **CERO auditores en auditorías futuras (`AUD-2027-*` y `AUD-2028-*`):**
   - Ninguna auditoría en `8000...0009..0012` ni `8000...0024..0033` puede tener filas en `equipo_auditor`, `equipo_auditor_sitio`, `equipo_auditor_sitio_temporal` ni `equipo_auditor_proceso_sitio`.
2. **100% Calificados (`auditor_esta_calificado = TRUE`):**
   - Repartir la carga de auditorías pasadas y activas entre los **6 auditores** del Paso 3.1 (`3333...3333`, `1000...0001..0005`), verificando que en cada asignación cumplan norma, sector IAF y subsector IAF del certificado.
   - Conservar al usuario `3333...3333` (`Auditor Técnico Evaluador`) asignado como líder o integrante en al menos 3–4 auditorías representativas de `CONG-IND-01` (incluyendo `AUD-2024-001`, `AUD-2026-001`, `AUD-2026-004`, `AUD-2026-009`) y `AUD-2022-001` para que la vista con rol `AUDITOR` muestre cartera completa.
3. **Cero traslapes de fechas (`alertar_conflicto_auditor`):**
   - Escalonar las fechas `PROGRAMADA_EXACTA` / `REAL` de campañas activas distintas cuando compartan un mismo auditor, o distribuir auditores distintos (`1000...0002`, `1000...0003`, `1000...0004`, `1000...0005`) entre campañas cercanas para evitar falsos choques de disponibilidad, manteniendo `AUD-2026-001`/`AUD-2026-002` como campaña Integrada válida compartiendo fecha y equipo.
   - En `AUD-2026-006` y `AUD-2026-007` (`Borrador`), omitir equipos o dejar solo pre-plan sin asignación definitiva para reflejar el flujo real previo a Paso 7/8.

---

## 4. Hallazgos (`hallazgo`), Comentarios (`comentarios_por_auditoria`) y Cierres QA (Secciones `-- 22.` y `-- 22b.`)

1. **Hallazgos de campo (`public.hallazgo`, Sección `-- 22.`):**
   - **CERO hallazgos en futuras (`AUD-2027-*`, `AUD-2028-*`) y en `Borrador`/`En Programación`/`Programada`.**
   - En **históricas cerradas (`AUD-2022-002`, `AUD-2023-002`, `AUD-2022-003`, `AUD-2023-001`, `AUD-2025-003`):** `NC_MAYOR`, `NC_MENOR`, `OBSERVACION` y `OPORTUNIDAD_MEJORA` realistas con `fecha_limite_plan` (`+15d`), `fecha_entrega_plan`, `fecha_limite_cierre` (`+45d`), `fecha_cierre_real` y **`cerrado = TRUE`** (requerido para cerrar `Cerrada` cuando existen NC).
   - En **recientes ejecutadas (`AUD-2025-004`, `AUD-2024-001`, `AUD-2025-001`, `AUD-2025-002`):** incluir mezcla de `NC_MENOR` abiertas (`cerrado = FALSE`, dentro de ventana `+15d/+45d`), `OBSERVACION` y `OPORTUNIDAD_MEJORA` para ejercitar las tablas y filtros de Paso 9/10.
   - En **`AUD-2026-009` (`En Ejecución`):** máximo 1 `OBSERVACION` preliminar o hallazgo en curso de levantamiento.
2. **Comentarios por auditoría (`public.comentarios_por_auditoria`, nueva Sección `-- 22a.`):**
   - Poblar notas técnicas breves y realistas en auditorías cerradas, en ejecución y reprogramadas (e.g., acta de reunión de apertura, ajuste logístico de turno nocturno, confirmación de cierre de eficacia de NC).
3. **Cierres y Revisiones QA (`UPDATE public.auditoria`, Sección `-- 22b.`):**
   - **Importante (triggers `trg_validar_cierre_auditoria` y `trg_validar_revision_auditoria`):** Ejecutar estos `UPDATE` al final (después de insertar fechas `REAL` y cerrar los hallazgos de esas auditorías):
     - **`AUD-2022-002`, `AUD-2023-002`, `AUD-2022-003` (+ `AUD-2022-001` CyberCloud):** `estado_ciclo = 'Cerrada'`, `fecha_cierre_auditoria >= fecha_fin REAL`, `revisado = TRUE`, `fecha_revision >= fecha_inicio REAL`, `revisado_por = '22222222-2222-2222-2222-222222222222'`, `usuario_revisor_id = '22222222-2222-2222-2222-222222222222'`, `documentacion_completa = TRUE`, `resumen_revision` específico y técnico.
     - **`AUD-2023-001` (`8000...0013` existente) y `AUD-2025-003` (`8000...0018` nueva):** `estado_ciclo = 'Cerrada'`, `fecha_cierre_auditoria` válida, **`revisado = FALSE`**, `documentacion_completa = FALSE` (bandeja `Pendientes de Revisión` en Paso 11).

---

## 5. Paridad con Fallbacks Locales (`src/lib/auditDomain.ts` y `src/lib/multisiteSampling.ts`)

Si alguna vista o test unitario utiliza semillas locales cuando el modo offline/fallback está activo, sincronizar únicamente las constantes descriptivas que correspondan sin alterar contratos de interfaces ni romper aserciones existentes en `auditDomain.test.ts` o `revisionDomain.test.ts`.

---

## 6. Criterios de Verificación del Paso 4.1

- [ ] Todas las auditorías (`sitios_por_auditoria`) tienen `MOD((tiempo_auditoria * 4)::NUMERIC, 1) = 0` y `Sitio 0` posee `tiempo_auditoria >= sitio secundario` cuando `personal_count` es mayor.
- [ ] `SELECT COUNT(*) FROM public.equipo_auditor ea JOIN public.auditoria a ON a.id = ea.id_auditoria WHERE a.codigo_auditoria ~ '^AUD-202[78]-' AND a.deleted_at IS NULL;` devuelve **`0`**.
- [ ] `SELECT COUNT(*) FROM public.hallazgo h JOIN public.auditoria a ON a.id = h.id_auditoria WHERE a.codigo_auditoria ~ '^AUD-202[78]-' AND h.deleted_at IS NULL;` devuelve **`0`**.
- [ ] Todos los auditores asignados cumplen `auditor_esta_calificado(...) = TRUE`.
- [ ] Existen hallazgos de los 4 tipos (`NC_MAYOR`, `NC_MENOR`, `OBSERVACION`, `OPORTUNIDAD_MEJORA`), comentarios en `comentarios_por_auditoria` y expedientes `Cerrada` tanto con `revisado = TRUE` como `revisado = FALSE`.
