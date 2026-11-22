# Paso 3.1: Auditores Calificados Adicionales y Arquitectura de Vínculos (`Integrada`, `Combinada`, `Multientidad`, `Individual` + `LIBRE`)

**Dependencias:** Pasos 1.2 y 2.2 completados.
**Objetivo:** Ampliar la plantilla de auditores calificados (`auditor`, `norma_auditor`, `sector_iaf_auditor`, `subsector_iaf_auditor`) para soportar equipos multidisciplinarios sin choques de calendario, y consolidar los vínculos inteligentes de `CONG-IND-01` (`Integrada`, `Combinada`, `Multientidad` Nivel 2, `Individual` y 1 certificado `LIBRE`).

---

## 1. Ampliación de Auditores Calificados (`06_datos_prueba.sql`, Sección `-- 10.`)

Conservar intactos los 2 auditores existentes (`33333333-3333-3333-3333-333333333333` **`Auditor Técnico Evaluador`** para RLS de `auditor@fondonorma.test` y `10000000-0000-0000-0000-000000000001` **`Ing. Carlos Mendoza (Auditor Líder)`**) y agregar **4 nuevos auditores especialistas** (`10000000-0000-0000-0000-000000000002` .. `...0005`):

| UUID Auditor | Nombre | Normas (`norma_auditor`) | Sectores IAF (`sector_iaf_auditor`) | Subsectores IAF (`subsector_iaf_auditor`) |
| :--- | :--- | :--- | :--- | :--- |
| `3333...3333` *(existente)* | `Auditor Técnico Evaluador` | `9001, 14001, 45001` *(agregar `45001` para habilitarlo en SST)*, `27001`, `22000` | `03, 17, 33` | `03.1, 17.1, 17.2, 33.1` |
| `1000...0001` *(existente)* | `Ing. Carlos Mendoza (Auditor Líder)` | `9001, 14001, 45001, 22000` | `03, 17, 28` | `03.1, 17.1, 17.2, 28.1` *(agregar `28.1`)* |
| `1000...0002` *(nuevo)* | `Ing. Patricia Valera (Líder SGA/SST)` | `14001, 45001` | `17, 28` | `17.1, 17.2, 28.1` |
| `1000...0003` *(nuevo)* | `Ing. Roberto Salgado (Auditor SGC/Metalmecánica)` | `9001` | `17, 28` | `17.1, 17.2, 28.1` |
| `1000...0004` *(nuevo)* | `Dra. Elena Marcano (Auditora HSEQ Integral)` | `9001, 14001, 45001` | `03, 17` | `03.1, 17.1, 17.2` |
| `1000...0005` *(nuevo)* | `Ing. Andrés Briceño (Especialista SGSI/SGC)` | `9001, 27001, 22000` | `03, 17, 33` | `03.1, 17.2, 33.1` |

> **Regla de oro (`auditor_esta_calificado`):** Toda dupla `(id_auditor, id_certificado)` que se asigne en Paso 4.1 debe satisfacer `public.auditor_esta_calificado(id_auditor, c.id_norma, c.id_sector_iaf, c.id_subsector_iaf) = TRUE` — es decir, las **3 tablas** (`norma_auditor`, `sector_iaf_auditor` y `subsector_iaf_auditor`) deben estar completas antes de asignar equipos.

---

## 2. Diseño Inteligente de Vínculos (`vinculo` + `vinculo_certificado`, Sección `-- 18b.`)

Garantizar que `CONG-IND-01` demuestre **todas las modalidades de vinculación** soportadas por el negocio, manteniendo intactos `VINC-IND-01` (`CONG-CYB-01`) y `VINC-ALM-S1..S4` (`CONG-ALM-01`):

| Vínculo (UUID) | Código | Conglomerado | Nivel / Tipo | `tiene_sitio_temporal` | Certificados Vinculados (`vinculo_certificado`) |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `7c00...0001` | `VINC-IND-01` | `CONG-CYB-01` | `INDIVIDUAL` / `Individual` | `FALSE` | `40...0003` (`FN-ISMS-2025-003`) |
| `7c00...0002` | `VINC-IND-02` | `CONG-IND-01` | `INDIVIDUAL` / `Individual` | `FALSE` | `40...0006` (`FN-SST-2026-006`, Example SST) |
| `7c00...0003` | `VINC-N1-01` | `CONG-IND-01` | `NIVEL_1_INTRA_ORG` / `Integrada` | `TRUE` | `40...0004` (`FN-QMS-2025-004`) + `40...0005` (`FN-EMS-2025-005`) *(Example SGC+SGA)* |
| `7c00...0004` | `VINC-N2-01` | `CONG-IND-01` | `NIVEL_2_INTER_ORG` / `Multientidad` | `TRUE` | `40...0001` (`FN-QMS-2024-001` Iberometal) + `40...0009` (`FN-QMS-2026-009` Example Logística) |
| **`7c00...0005` *(nuevo)*** | **`VINC-N1-02`** | `CONG-IND-01` | **`NIVEL_1_INTRA_ORG` / `Combinada`** | `FALSE` | **`40...0002` (`FN-EMS-2025-002`) + `40...0010` (`FN-SST-2025-010`)** *(Iberometal SGA+SST)* |
| — | **LIBRE** | `CONG-IND-01` | *Sin vínculo* | — | **`40...0008` (`FN-QMS-2026-008`, Iberometal Estudio)** *(sin fila en `vinculo_certificado` ni en `auditoria`)* |

> **Nota sobre comentario en `-- 18b.` y `src/lib/multisiteSampling.ts`:**
> - Actualizar el comentario descriptivo de la sección `-- 18b.` indicando que `40...0008` (`FN-QMS-2026-008`) permanece `LIBRE`, mientras `40...0002` queda vinculado en `VINC-N1-02`.
> - Asegurar que ningún certificado en estado `LIBRE` (`40...0008`) tenga filas activas en `public.auditoria` (regla estricta de `fn_validar_auditoria_en_programa()`).
> - Verificar `CONG-ALM-01` (`7c00...0101..0104`, `7d00...0101..0111`) sin alteraciones.

---

## 3. Criterios de Verificación del Paso 3.1

- [ ] `SELECT COUNT(*) FROM public.auditor WHERE deleted_at IS NULL` devuelve `6` auditores con competencias completas en `norma_auditor`, `sector_iaf_auditor` y `subsector_iaf_auditor`.
- [ ] En `CONG-IND-01`, los 7 certificados `Activo` pertenecen a un único vínculo activo (cubriendo `Individual`, `Integrada`, `Combinada` y `Multientidad` Nivel 2) y exactamente 1 certificado (`FN-QMS-2026-008`) queda `LIBRE`.
- [ ] Cero colisiones con `CONG-CYB-01` ni `CONG-ALM-01`.
