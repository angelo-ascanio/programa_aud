import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVisibleTextFromHtml,
  findExposedUuidsInHtml,
  assertZeroUuidExposure,
} from './zeroUuid';
import type { UserProfile } from './healthCheck';
import { INITIAL_CERTIFICADOS_DETAILED } from './multisiteSampling';
import { INITIAL_ORGANIZACIONES } from './activeCertificates';
import {
  resolveContactoDetailById,
  resolveEmailDetailById,
  resolveFechaDetailById,
  resolveTelefonoDetailById,
} from './certificadoSubEntities';
import { renderCertificadoView } from '../views/certificadoView';
import { renderFechaView } from '../views/fechaView';
import { renderContactoView } from '../views/contactoView';
import { renderTelefonoView } from '../views/telefonoView';
import { renderEmailView } from '../views/emailView';

test('extractVisibleTextFromHtml strips HTML tags and retains user visible text', () => {
  const html = `
    <div class="card" data-id="30000000-0000-0000-0000-000000000001">
      <h3 class="title">CyberCloud Solutions S.L.</h3>
      <p>Certificado: FN-QMS-2024-001</p>
    </div>
  `;
  const visible = extractVisibleTextFromHtml(html);
  assert.equal(visible.includes('CyberCloud Solutions S.L.'), true);
  assert.equal(visible.includes('data-id'), false);
  // data-id was in an attribute, not visible text
  assert.equal(visible.includes('30000000'), false);
});

test('findExposedUuidsInHtml flags raw UUIDs rendered in visible text', () => {
  const nonCompliantHtml = `
    <div>
      <span>Organización: 30000000-0000-0000-0000-000000000001</span>
    </div>
  `;
  const exposed = findExposedUuidsInHtml(nonCompliantHtml);
  assert.equal(exposed.length, 1);
  assert.equal(exposed[0], '30000000-0000-0000-0000-000000000001');

  const check = assertZeroUuidExposure(nonCompliantHtml);
  assert.equal(check.compliant, false);
  assert.equal(check.exposedUuids.length, 1);
});

test('assertZeroUuidExposure confirms compliance when only friendly names are rendered', () => {
  const compliantHtml = `
    <div data-record-id="40000000-0000-0000-0000-000000000001">
      <h1>CyberCloud Solutions S.L.</h1>
      <span>Certificado FN-EMS-2024-002</span>
      <span>Sede Central (Sitio 0)</span>
      <button data-id="40000000-0000-0000-0000-000000000001">Ver Detalle</button>
    </div>
  `;
  const check = assertZeroUuidExposure(compliantHtml);
  assert.equal(check.compliant, true);
  assert.equal(check.exposedUuids.length, 0);
});

test('findExposedUuidsInHtml catches raw UUIDs in tooltips, aria-labels, placeholders, and visible inputs', () => {
  const leakedTooltipHtml = `
    <button title="Organización 30000000-0000-0000-0000-000000000001">Iberometal</button>
  `;
  assert.equal(assertZeroUuidExposure(leakedTooltipHtml).compliant, false);
  assert.deepEqual(findExposedUuidsInHtml(leakedTooltipHtml), [
    '30000000-0000-0000-0000-000000000001',
  ]);

  const leakedAriaHtml = `
    <button aria-label="Editar 40000000-0000-0000-0000-000000000002">Editar</button>
  `;
  assert.equal(assertZeroUuidExposure(leakedAriaHtml).compliant, false);

  const leakedInputHtml = `
    <form>
      <input type="text" name="org" value="50000000-0000-0000-0000-000000000003" />
    </form>
  `;
  assert.equal(assertZeroUuidExposure(leakedInputHtml).compliant, false);
});

test('findExposedUuidsInHtml ignores hidden inputs, checkboxes/radios, select option values, and data-* attributes', () => {
  const safeFormHtml = `
    <form data-record-id="30000000-0000-0000-0000-000000000001">
      <input type="hidden" name="id_norma" value="10000000-0000-0000-0000-000000000001" />
      <input type="checkbox" name="sector_ids" value="d0000000-0000-0000-0000-000000000017" checked />
      <input type="radio" name="opt" value="d0000000-0000-0000-0000-000000000028" />
      <input type="text" disabled value="ISO 9001:2015 — Gestión de Calidad" />
      <select name="id_organizacion">
        <option value="30000000-0000-0000-0000-000000000001">Iberometal Componentes S.A.</option>
      </select>
    </form>
  `;
  const check = assertZeroUuidExposure(safeFormHtml);
  assert.equal(check.compliant, true);
  assert.equal(check.exposedUuids.length, 0);
});

test('Step Final Zero-UUID: Certificado Sub-Sector IAF chip and Fecha/Contacto/Telefono/Email views never leak UUIDs', () => {
  const adminProfile: UserProfile = {
    id: '00000000-0000-0000-0000-000000000001',
    nombre: 'Admin FONDONORMA',
    role: 'ADMIN',
    status: 'APPROVED',
  };
  const cert = INITIAL_CERTIFICADOS_DETAILED[0];

  const certHtml = renderCertificadoView({
    profile: adminProfile,
    state: {
      selectedCertId: cert.id,
      activeChildTab: 'contactos',
      query: '',
      selectedStandard: 'ALL',
      selectedStatus: 'ALL',
      selectedSectorIaf: 'ALL',
      viewMode: 'grid',
      sortColumn: null,
      sortDirection: 'none',
      isEditingAttributes: false,
    },
    certificates: INITIAL_CERTIFICADOS_DETAILED,
    organizaciones: INITIAL_ORGANIZACIONES,
  });
  assert.ok(certHtml.includes('Sub-Sector IAF'));
  assert.equal(assertZeroUuidExposure(certHtml).compliant, true);

  const fecha = resolveFechaDetailById({
    fechaId: cert.fechas[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  const fechaHtml = renderFechaView({
    profile: adminProfile,
    state: { selectedFechaId: fecha.id, isEditingAttributes: false },
    fecha,
  });
  assert.equal(assertZeroUuidExposure(fechaHtml).compliant, true);

  const contacto = resolveContactoDetailById({
    contactoId: cert.contactos[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  const contactoHtml = renderContactoView({
    profile: adminProfile,
    state: {
      selectedContactoId: contacto.id,
      activeChildTab: 'telefonos',
      isEditingAttributes: false,
    },
    contacto,
  });
  assert.equal(assertZeroUuidExposure(contactoHtml).compliant, true);

  const telefono = resolveTelefonoDetailById({
    telefonoId: contacto.telefonos[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  const telefonoHtml = renderTelefonoView({
    profile: adminProfile,
    state: { selectedTelefonoId: telefono.id, isEditingAttributes: false },
    telefono,
  });
  assert.equal(assertZeroUuidExposure(telefonoHtml).compliant, true);

  const email = resolveEmailDetailById({
    emailId: contacto.emails[0].id,
    certificates: INITIAL_CERTIFICADOS_DETAILED,
  })!;
  const emailHtml = renderEmailView({
    profile: adminProfile,
    state: { selectedEmailId: email.id, isEditingAttributes: false },
    email,
  });
  assert.equal(assertZeroUuidExposure(emailHtml).compliant, true);
});
