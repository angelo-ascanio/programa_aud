# Step 1.2.2 — Semillero Determinista Multi-Nivel, Multi-Fecha y Ciclo Evolucionado (`06_datos_prueba.sql`) + Reset Gate

## Objetivo
Actualizar `public/supabase/queries/06_datos_prueba.sql` con datos deterministas e idempotentes (`ON CONFLICT ... WHERE deleted_at IS NULL`) adaptados al nuevo esquema (`programa_auditoria`, `auditoria` sin fechas planas, `auditoria_fecha`, `configuracion_alerta_auditoria`, `procesos_por_sitio`, `turnos_proceso_sitio_auditoria`, `equipo_auditor_sitio`, `equipo_auditor_proceso_sitio`) y verificar el **reset completo de BD (`00` → `07`)**.

---

## Archivos a Modificar
- `public/supabase/queries/06_datos_prueba.sql`

---

## Especificación Técnica Detallada

### 1. Limpieza de Inserciones Heredadas en `06_datos_prueba.sql`
- Reemplazar toda inserción previa en `public.auditoria` que utilizara `fecha_programacion` / `fecha_reprogramacion` por `id_programa_auditoria` + filas en `public.auditoria_fecha`.
- Reemplazar toda inserción previa en `public.procesos_sitio_auditoria` que utilizara `id_turnos_sitio_auditoria` por `id_procesos_por_sitio` + filas puente en `public.turnos_proceso_sitio_auditoria`.

### 2. Datos Semilla Deterministas a Incluir (Preservando UUIDs Base Existentes)
1. **Configuración Inicial de Alertas (`configuracion_alerta_auditoria`):**
   - Fila `DEFAULT`: `dias_aviso_proxima = 15`, `dias_aviso_preprogramada_sin_confirmar = 30`, `ciclos_rotacion_auditor_lider = 3`, `alertas_activas = TRUE`.
2. **`procesos_por_sitio` y Turnos de Sede:**
   - Para `FN-QMS-2024-001` (`40000000-0000-0000-0000-000000000001`): vincular procesos a Sitio 0 (`Sede Principal HQ`) y Sitio 1 (`Planta Valencia`), asegurando turnos activos en ambas sedes.
   - Vincular también `procesos_por_sitio` en un segundo certificado de la misma organización y en un certificado de una segunda organización semilla.
   - Conservar **al menos 2 certificados activos/en estudio (`Activo`, `Estudio`) sin auditoría programada** para validar desde el arranque el filtro de *Certificados Pendientes de Programar*.
3. **Programas de Auditoría Semilla (4 Escenarios Reales):**
   - **Escenario A — `INDIVIDUAL` Histórico (`Auditada`):** `PROG-2024-001` (`Individual`) → `AUD-2024-001` (*Etapa 2*, `Presencial`, `4.00d` en Sitio 0 `1.50d` + Sitio 1 `2.50d`), con `auditoria_fecha` `seq=1` (`REAL`, `tag='Programación'`, año anterior).
   - **Escenario B — `NIVEL_1_INTRA_ORG` con Evolución de Ciclo (`Combinada` → `Integrada`) y Span vs Días-Auditor:**
     - Programa Año 1 (`Combinada`, `Auditada`) en *Example, C.A.* agrupando 2 certificados de la misma organización (`id_ciclo_origen = NULL`).
     - Programa Año 2 **`PROG-2026-001`** (`NIVEL_1_INTRA_ORG`, `tipo_vinculacion = 'Integrada'`, `etiqueta = 'Planta Santa Cruz'`, `id_ciclo_origen` apuntando al ciclo `Combinada` Año 1): agrupa 2 auditorías de la misma organización con:
       - **Multi-Fecha 1:N:** `seq=1` (`Programación`, `PREPROGRAMADA_MES`) + `seq=2` (`Reprogramación`, `REAL`, rango exacto de **3 días calendario** con `observacion = 'Reprogramado por parada de planta'`).
       - **Muestreo & Cuadre:** **`6.00 días-auditor` ejecutados por `2 auditores` (`3.00d` c/u) en `3 días calendario`**, múltiples turnos en `turnos_proceso_sitio_auditoria` y asignación mixta (`equipo_auditor_sitio` todo el sitio + `equipo_auditor_proceso_sitio` granular).
   - **Escenario C — `NIVEL_2_INTER_ORG` (`Multientidad`) + Pre-Programación Mes/Año:**
     - `PROG-2026-002` vinculando 2 organizaciones distintas (`Org A` y `Org B`), con `auditoria_fecha` `seq=1` en modo `PREPROGRAMADA_MES` próxima a vencer ventana (`<= 30` días del mes objetivo) para disparar la alerta *"Pre-programada por mes sin confirmar"*.
   - **Escenario D — `INDIVIDUAL` Parcial / Desfase (`En Programación`):**
     - `PROG-2026-003` → `AUD-2026-005` (`tiempo_auditoria = 2.50d`, Cubo 2 asignado `1.50d` — desfase `-1.00d` y 1 proceso sin auditor), fecha real vencida o próxima para evidenciar etiquetas dinámicas `Parcialmente Asignada` / `Atrasada / Vencida`.

---

## Criterios de Verificación de Step 1.2.2
1. Reset completo `00_delete_tables.sql` → `07_normas_requisitos_csv.sql` ejecuta con `0` errores.
2. Ejecución idempotente: correr `06_datos_prueba.sql` dos veces seguidas no produce duplicados ni fallos `ON CONFLICT`.
3. Consultas verifican: `PROG-2026-001` (`Integrada`, `id_ciclo_origen` válido, `seq 1` + `seq 2`, `6.00d` / `3d` calendario), `PROG-2026-002` (`NIVEL_2_INTER_ORG`), y `>= 2` certificados sin programar (`Activo` y `Estudio`).
