import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCertificateCanGenerateAudits,
  hasCertificateActiveAlcance,
  validateAlcanceDraft,
  validateVinculoCertificatesHaveAlcance,
  type AlcanceCertificadoEntity,
} from './alcanceDomain';
import { assertZeroUuidExposure, containsRawUuid } from './zeroUuid';

const CERT_A_ID = '40000000-0000-0000-0000-000000000101';
const CERT_B_ID = '40000000-0000-0000-0000-000000000102';
const ALCANCE_1_ID = '90000000-0000-0000-0000-000000000101';

test('Step 2.3: validateAlcanceDraft accepts 1-line short and >5000-char multiline texts while trimming only outer edges', () => {
  // 1-line short scope
  const shortRes = validateAlcanceDraft({
    alcance_es: '  Servicios TI.  ',
    alcance_en: '  IT Services.  ',
  });
  assert.equal(shortRes.valid, true);
  assert.equal(shortRes.error, null);
  assert.equal(shortRes.normalized.alcance_es, 'Servicios TI.');
  assert.equal(shortRes.normalized.alcance_en, 'IT Services.');

  // Minimum 1 char (no artificial 10-char minimum)
  const oneCharRes = validateAlcanceDraft({
    alcance_es: 'A',
    alcance_en: '  \n\t  ',
  });
  assert.equal(oneCharRes.valid, true);
  assert.equal(oneCharRes.normalized.alcance_es, 'A');
  assert.equal(oneCharRes.normalized.alcance_en, null);

  // Huge >5000-char multiline text preserving internal paragraphs & newlines
  const paragraph =
    'Diseño, fabricación, ensamblaje, comercialización y soporte técnico de sistemas industriales automatizados en todas las sedes operativas.\n\n';
  const longEsBody = paragraph.repeat(40).trim();
  const longEnBody =
    'Design, manufacturing, assembly, commercialization and technical support of automated industrial systems across operational sites.\n\n'
      .repeat(40)
      .trim();
  assert.ok(longEsBody.length > 5000);
  assert.ok(longEnBody.length > 5000);

  const longRes = validateAlcanceDraft({
    alcance_es: `\n  ${longEsBody}  \n`,
    alcance_en: `  ${longEnBody}\n`,
  });
  assert.equal(longRes.valid, true);
  assert.equal(longRes.error, null);
  assert.equal(longRes.normalized.alcance_es, longEsBody);
  assert.equal(longRes.normalized.alcance_en, longEnBody);
  assert.ok(longRes.normalized.alcance_es.includes('\n\n'));
});

test('Step 2.3: validateAlcanceDraft rejects blank/whitespace alcance_es with Zero-UUID Spanish error', () => {
  for (const raw of ['', '   ', '\n\t  \n']) {
    const res = validateAlcanceDraft({
      alcance_es: raw,
      alcance_en: 'Optional English Scope',
    });
    assert.equal(res.valid, false);
    assert.ok(res.error);
    assert.equal(containsRawUuid(res.error), false);
    assert.match(res.error, /Alcance en español/i);
  }
});

test('Step 2.3: hasCertificateActiveAlcance and assertCertificateCanGenerateAudits enforce active alcanceDetalle', () => {
  const activeScope: AlcanceCertificadoEntity = {
    id: ALCANCE_1_ID,
    id_certificado: CERT_A_ID,
    alcance_es: 'Manufactura de componentes automotrices.',
    alcance_en: null,
    esCompartido: false,
    deleted_at: null,
  };

  assert.equal(
    hasCertificateActiveAlcance({
      numero_certificado: 'FN-QMS-2026-001',
      alcanceDetalle: activeScope,
    }),
    true
  );
  assert.deepEqual(
    assertCertificateCanGenerateAudits({
      numero_certificado: 'FN-QMS-2026-001',
      alcanceDetalle: activeScope,
    }),
    { allowed: true, reason: null }
  );

  // Missing, null, soft-deleted, whitespace-only, or legacy-string-only must fail
  assert.equal(
    hasCertificateActiveAlcance({
      numero_certificado: 'FN-QMS-2026-002',
      alcanceDetalle: null,
    }),
    false
  );
  assert.equal(
    hasCertificateActiveAlcance({
      numero_certificado: 'FN-QMS-2026-002',
      alcanceDetalle: { ...activeScope, deleted_at: '2026-06-01T00:00:00Z' },
    }),
    false
  );
  assert.equal(
    hasCertificateActiveAlcance({
      numero_certificado: 'FN-QMS-2026-002',
      alcanceDetalle: { ...activeScope, alcance_es: '   \n  ' },
    }),
    false
  );

  // Even if legacy `alcance` string property existed at runtime, missing `alcanceDetalle` must block
  const legacyOnly = {
    numero_certificado: 'FN-QMS-LEGACY',
    alcance: 'Texto legado sin tabla alcance',
  };
  assert.equal(hasCertificateActiveAlcance(legacyOnly), false);

  const gateBlocked = assertCertificateCanGenerateAudits({
    numero_certificado: 'FN-QMS-2026-009',
    alcanceDetalle: null,
  });
  assert.equal(gateBlocked.allowed, false);
  assert.equal(
    gateBlocked.reason,
    'El certificado FN-QMS-2026-009 no posee un Alcance activo registrado. Registre o comparta un Alcance en español en Certificación → Certificado antes de generar auditorías.'
  );
  assert.equal(assertZeroUuidExposure(gateBlocked.reason || '').compliant, true);
});

test('Step 2.3: validateVinculoCertificatesHaveAlcance lists missing certificate codes without exposing UUIDs', () => {
  const activeScope: AlcanceCertificadoEntity = {
    id: ALCANCE_1_ID,
    id_certificado: CERT_A_ID,
    alcance_es: 'Logística nacional e internacional.',
    alcance_en: null,
    esCompartido: false,
    deleted_at: null,
  };

  const blocked = validateVinculoCertificatesHaveAlcance(
    [
      { id_certificado: CERT_A_ID, numero_certificado: 'FN-QMS-101' },
      { id_certificado: CERT_B_ID, numero_certificado: 'FN-EMS-102' },
    ],
    [
      {
        id: CERT_A_ID,
        numero_certificado: 'FN-QMS-101',
        alcanceDetalle: activeScope,
      },
      {
        id: CERT_B_ID,
        numero_certificado: 'FN-EMS-102',
        alcanceDetalle: null,
      },
    ]
  );

  assert.equal(blocked.allowed, false);
  assert.ok(blocked.reason?.includes('FN-EMS-102'));
  assert.equal(blocked.reason?.includes('FN-QMS-101'), false);
  assert.equal(assertZeroUuidExposure(blocked.reason || '').compliant, true);

  // When both have active scopes, passes cleanly
  const allowed = validateVinculoCertificatesHaveAlcance(
    [
      { id_certificado: CERT_A_ID, numero_certificado: 'FN-QMS-101' },
      { id_certificado: CERT_B_ID, numero_certificado: 'FN-EMS-102' },
    ],
    [
      {
        id: CERT_A_ID,
        numero_certificado: 'FN-QMS-101',
        alcanceDetalle: activeScope,
      },
      {
        id: CERT_B_ID,
        numero_certificado: 'FN-EMS-102',
        alcanceDetalle: { ...activeScope, id_certificado: CERT_B_ID, esCompartido: true },
      },
    ]
  );
  assert.deepEqual(allowed, { allowed: true, reason: null });
});
