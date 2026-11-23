# Step Final — Verificación Integral, Pruebas E2E Playwright (4 Roles) y Sincronización Documental

**Dependencias:** `step_1.1.md` .. `step_1.3.md` y `step_2.1.md` .. `step_2.3.md`  
**Objetivo:** Validar de extremo a extremo la estabilidad funcional, seguridad RLS/Zero-UUID, rendimiento y responsividad en navegador real Chromium (1440×900 y 390×844), y actualizar los documentos de arquitectura en `public/doc/` y `public/certificado/` para reflejar el nuevo estado del sistema.

---

## 1. Compilación, Lint y Suite Completa de Unit Tests

1. Ejecutar la suite completa de `node:test` del repositorio:
   ```bash
   npx tsx --test src/**/*.test.ts src/*.test.ts
   ```
   *(Ajustar glob según estructura exacta de tests en `src/lib/*.test.ts` y `src/views/*.test.ts` para asegurar 100% pass, 0 skips inesperados).*
2. Ejecutar verificación de tipos, lint y build de producción:
   ```bash
   npm run lint
   npm run build
   ```
3. Auditoría estática obligatoria:
   - Confirmar **0** ocurrencias nuevas de `any` / `as any` en `src/`.
   - Confirmar **0** exposición de UUIDs en UI, toasts o traductores de error SQL (`zeroUuid.test.ts`).
   - Confirmar integridad de `table-fixed` + `<colgroup>` (100%) + `0` `<button>` dentro de `<tbody>` en vistas modificadas.

---

## 2. Verificación E2E en Navegador Real (Playwright Chromium) — 4 Roles

Levantar la aplicación en `http://localhost:3000` (con backend/Supabase o entorno de pruebas configurado) e inspeccionar visualmente y por consola (`0 console.error`, `0 pageerror`):

### Escenario 1 — `ADMIN` / `WORKER` (Pilar 1: Compartición Binaria de Procesos y Requisitos)
- Abrir ficha de certificado en `Certificación > Certificados` (`CONG-IND-01`):
  1. **Misma norma:** Abrir modal `Compartir` en tab `Procesos`, elegir proceso con cláusulas y certificado destino de la **misma norma**. Verificar que NO aparece la matriz compleja de colisión semántica; en su lugar aparece el mensaje claro de misma norma + checkbox para compartir proceso y requisitos juntos o separados. Confirmar y comprobar que el proceso y sus cláusulas (respetando exclusiones ISO 4.3 del destino) aparecen en ambos certificados.
  2. **Sincronización de cláusulas:** En `procesoView.ts`, agregar/quitar una cláusula o usar la acción de sincronización; verificar reflejo en el certificado hermano de misma norma.
  3. **Norma distinta:** Compartir proceso hacia certificado de **norma distinta** (ej. ISO 9001 → ISO 14001). Verificar mensaje explícito indicando que solo se comparte el proceso vacío (`0` requisitos). Confirmar y comprobar que el proceso llega con `0` cláusulas en destino y que editar cláusulas en origen NO altera el destino.
  4. **Compartir Sitio con cascada:** Compartir sitio hacia otra norma y hacia misma norma; verificar que los procesos en cascada respetan exactamente la misma regla binaria.

### Escenario 2 — `ADMIN` / `WORKER` (Pilar 2: `Auditoría > Designación > Sitio`)
- Navegar a `#/auditorias/designacion/sitio`:
  1. Verificar Multi View y entrar a un certificado con múltiples sitios (propios + compartidos) y auditoría vinculada (`linkedSiblings > 1`).
  2. **Detail View "Less Is More":**
     - Confirmar que se mantienen las franjas superiores (navegación temporal `◀ / <select> / ▶` y selector de hermanos vinculados).
     - Confirmar que debajo aparece **únicamente 1 tarjeta** (el certificado activo), **colapsada por defecto**.
  3. **Expandir y probar filtros/ordenamiento:**
     - Expandir la tarjeta: verificar presencia de sitios propios y compartidos (con marca sutil `Compartido` cuando aplique), y candado `🔒 HQ` en `Sitio 0`.
     - Probar `<select>` de filtro: `ALL`, `SELECTED`, `UNSELECTED`, `LINK_SELECTED`, `NOT_AUDITED_LAST_N`.
     - Al elegir `NOT_AUDITED_LAST_N`, confirmar aparición del input numérico entero (`min=0`): probar `N=0` (muestra todos), `N=1` (oculta los de la última auditoría previa), `N=2` (oculta los de las últimas 2 auditorías previas).
     - Probar `<select>` de ordenamiento (`SITE_NUMBER`, `SELECTED_FIRST`, `LEAST_RECENTLY_AUDITED`, `PERSONAL_DESC`, `NAME_ASC`).
     - Marcar/desmarcar un sitio compartido y comprobar persistencia tras recargar y propagación hacia `Tiempo`, `Proceso` y `Turno`.
  4. **Responsividad:** Verificar tanto en Desktop (`1440×900`) como en Mobile (`390×844`) sin overflow horizontal ni solapamientos.

### Escenario 3 — `AUDITOR` (Restricción Bloque 2 y Lectura Segura)
- Verificar que en `#/auditorias/designacion/sitio` el rol `AUDITOR` puede visualizar la cobertura en solo lectura (`canToggle = false`) sin controles de edición/compartición de Bloque 2.

### Escenario 4 — `CLIENT` (Aislamiento Nivel 2 Inter-Org RLS)
- Verificar que un usuario `CLIENT` de una organización del conglomerado visualiza únicamente sus certificados y los sitios/procesos legítimamente compartidos hacia su organización, sin fuga hacia otras organizaciones ni botones de mutación/compartición.

---

## 3. Sincronización Documental Obligatoria (Solo en Este Paso Final)

Actualizar la documentación de referencia para que refleje los cambios implementados:
- `public/doc/project_resume.md`
- `public/doc/architecture/database_architecture.md` (documentar `proceso_certificado_compartido.sincronizar_requisitos`, `fn_sync_shared_process_requisitos` y `trg_sync_req_proceso_same_norm`)
- `public/doc/architecture/backend_api_security.md` (documentar RPC de sincronización, regla binaria misma norma vs norma distinta y `numero_sitio` override en `sitios_por_auditoria`)
- `public/doc/architecture/frontend_architecture.md` (documentar `shareModalView` simplificado y nuevo Detail View colapsable/filtrable de `designacionSitioView`)
- `public/doc/architecture/testing_and_operations.md` (actualizar cobertura de tests y matriz de verificación)
- `public/certificado/README.md` y `public/certificado/component_specifications.md` (si aplica al patrón compacto de Detail View / filtros)

---

## 4. Criterio de Cierre Definitivo

- [ ] Todos los tests unitarios (`npx tsx --test`) en verde.
- [ ] `npm run lint` y `npm run build` sin errores ni warnings bloqueantes.
- [ ] Scripts SQL idempotentes verificados.
- [ ] Verificación visual Playwright en `1440×900` y `390×844` completada con `0` errores de consola y captura/revisión de todos los flujos de Pilar 1 y Pilar 2.
- [ ] Documentación en `public/doc/` sincronizada.
