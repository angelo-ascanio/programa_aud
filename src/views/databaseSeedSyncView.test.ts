import assert from 'node:assert/strict';
import test from 'node:test';

import { canAccessSubview, parseHashRouteString } from '../lib/accessControl';
import { canAccessRoute, type UserProfile } from '../lib/healthCheck';
import { resolveSyncSelectionPlan, SQL_SEED_SYNC_BLOCKS } from '../lib/sqlSeedSyncCatalog';
import {
  createInitialDatabaseSeedSyncState,
  type SeedSyncPreviewResponse,
} from '../lib/sqlSeedSyncClient';
import { assertZeroUuidExposure } from '../lib/zeroUuid';
import { renderDatabaseSeedSyncView } from './databaseSeedSyncView';
import { renderHeader } from './header';

const ADMIN_PROFILE: UserProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'Administrador Principal',
  role: 'ADMIN',
  status: 'APPROVED',
};

const WORKER_PROFILE: UserProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  nombre: 'Gestor Operativo',
  role: 'WORKER',
  status: 'APPROVED',
};

const AUDITOR_PROFILE: UserProfile = {
  id: '33333333-3333-3333-3333-333333333333',
  nombre: 'Auditor Técnico',
  role: 'AUDITOR',
  status: 'APPROVED',
};

const CLIENT_PROFILE: UserProfile = {
  id: '44444444-4444-4444-4444-444444444444',
  nombre: 'Cliente Iberometal',
  role: 'CLIENT',
  status: 'APPROVED',
};

const PENDING_ADMIN_PROFILE: UserProfile = {
  id: '55555555-5555-5555-5555-555555555555',
  nombre: 'Admin Pendiente',
  role: 'ADMIN',
  status: 'PENDING',
};

const REJECTED_ADMIN_PROFILE: UserProfile = {
  id: '66666666-6666-6666-6666-666666666666',
  nombre: 'Admin Rechazado',
  role: 'ADMIN',
  status: 'REJECTED',
};

test('database-sync route parsing and RBAC enforce ADMIN-only access and header visibility', () => {
  assert.deepEqual(parseHashRouteString('#database-sync'), {
    route: 'database-sync',
    subview: null,
  });
  assert.deepEqual(parseHashRouteString('#/database-sync'), {
    route: 'database-sync',
    subview: null,
  });

  assert.equal(canAccessRoute(ADMIN_PROFILE, 'database-sync'), true);
  assert.equal(canAccessSubview(ADMIN_PROFILE, 'database-sync'), true);

  for (const blocked of [
    null,
    WORKER_PROFILE,
    AUDITOR_PROFILE,
    CLIENT_PROFILE,
    PENDING_ADMIN_PROFILE,
    REJECTED_ADMIN_PROFILE,
  ]) {
    assert.equal(canAccessRoute(blocked, 'database-sync'), false);
    assert.equal(canAccessSubview(blocked, 'database-sync'), false);
  }

  const adminHeader = renderHeader({
    profile: ADMIN_PROFILE,
    email: 'admin@fondonorma.test',
    isAdmin: true,
    canViewApprovals: true,
    activeRoute: 'database-sync',
    activeSubSection: null,
    pendingCount: 0,
    openMenu: 'account',
  });
  assert.ok(adminHeader.includes('data-nav="database-sync"'));
  assert.ok(adminHeader.includes('data-nav-reset="true"'));
  assert.ok(adminHeader.includes('Sincronización SQL'));
  assert.ok(adminHeader.includes('🔄'));
  assert.ok(adminHeader.includes('06_datos_prueba.sql y 07_normas_requisitos_csv.sql'));
  assert.equal(assertZeroUuidExposure(adminHeader).compliant, true);

  for (const [profile, email] of [
    [WORKER_PROFILE, 'worker@fondonorma.test'],
    [AUDITOR_PROFILE, 'auditor@fondonorma.test'],
    [CLIENT_PROFILE, 'client@fondonorma.test'],
    [PENDING_ADMIN_PROFILE, 'pending@fondonorma.test'],
  ] as const) {
    const header = renderHeader({
      profile,
      email,
      isAdmin: false,
      canViewApprovals: profile.role === 'WORKER' && profile.status === 'APPROVED',
      activeRoute: 'dashboard',
      activeSubSection: null,
      pendingCount: 0,
      openMenu: 'account',
    });
    assert.equal(header.includes('data-nav="database-sync"'), false);
    assert.equal(header.includes('Sincronización SQL'), false);
  }
});

test('renderDatabaseSeedSyncView renders all 3 blocks, all sections, Certificado cascade, and Extra Norma badge', () => {
  const initialState = createInitialDatabaseSeedSyncState();
  const html = renderDatabaseSeedSyncView({
    ...initialState,
    selectedSectionIds: ['certificacion.certificado', 'extra.norma'],
  });

  assert.ok(html.includes('max-w-[1720px]'));
  assert.ok(html.includes('data-action="toggle-sync-all"'));
  assert.ok(html.includes('data-action="clear-sync-selection"'));
  assert.ok(html.includes('data-action="toggle-sync-fk-support"'));
  assert.ok(html.includes('data-action="preview-sql-seed-sync"'));
  assert.ok(html.includes('data-action="apply-sql-seed-sync"'));

  for (const block of SQL_SEED_SYNC_BLOCKS) {
    assert.ok(html.includes(`data-action="toggle-sync-block"`));
    assert.ok(html.includes(`data-block-id="${block.id}"`));
    for (const sec of block.sections) {
      assert.ok(
        html.includes(`data-section-id="${sec.id}"`),
        `Missing section checkbox for ${sec.id}`
      );
      assert.ok(html.includes(sec.labelEs), `Missing section label ${sec.labelEs}`);
    }
  }

  // Indeterminate state on partially selected certificacion & extra blocks, false on auditorias
  assert.match(
    html,
    /data-block-id="certificacion"\s+data-indeterminate="true"\s+aria-checked="mixed"/
  );
  assert.match(
    html,
    /data-block-id="extra"\s+data-indeterminate="true"\s+aria-checked="mixed"/
  );
  assert.match(
    html,
    /data-block-id="auditorias"\s+data-indeterminate="false"\s+aria-checked="false"/
  );

  // Certificado cascade and Extra -> Norma special destination
  assert.ok(html.includes('Cascada Padre → Hijos automática'));
  assert.ok(
    html.includes('Versiones, Alcance, Sitios, Fechas, Contactos, Procesos, Cláusulas')
  );
  assert.ok(html.includes('Destino especial: 07_normas_requisitos_csv.sql'));

  // Apply stays disabled until previewResult.canApply is true
  assert.match(html, /<button[^>]*data-action="apply-sql-seed-sync"[^>]*\sdisabled(?=[\s>])/);

  assert.equal(assertZeroUuidExposure(html).compliant, true);
});

test('renderDatabaseSeedSyncView renders preview table-fixed layout (colgroup 100%, 0 tbody buttons), collapsible SQL, and Zero-UUID compliance', () => {
  const plan = resolveSyncSelectionPlan(['certificacion.certificado', 'extra.norma'], {
    includeParentFkDependencies: true,
  });

  const previewResult: SeedSyncPreviewResponse = {
    ok: true,
    plan,
    targetResults: [
      {
        targetFile: '06_datos_prueba.sql',
        changed: true,
        valid: true,
        validationErrors: [],
        warnings: [],
        summaryByTable: [],
        diffSnippets: [
          "INSERT INTO public.certificado (id, numero_certificado) VALUES ('40000000-0000-0000-0000-000000000099', 'FN-QMS-2026-099');",
        ],
        counts: {
          tablesWithChanges: 2,
          toInsert: 3,
          toUpdate: 1,
          toArchiveOrDelete: 1,
        },
      },
      {
        targetFile: '07_normas_requisitos_csv.sql',
        changed: true,
        valid: true,
        validationErrors: [],
        warnings: [],
        summaryByTable: [],
        diffSnippets: ['-- [+ Norma] ISO 27001:2022'],
        counts: {
          tablesWithChanges: 1,
          toInsert: 1,
          toUpdate: 0,
          toArchiveOrDelete: 0,
        },
        buildNormasSeedNoteEs:
          '07_normas_requisitos_csv.sql se sincronizó directamente desde PostgreSQL.',
      },
    ],
    summaryByTable: [
      {
        table: 'certificado',
        tableLabelEs: 'Certificados',
        targetFile: '06_datos_prueba.sql',
        isFkSupport: false,
        sinCambios: 5,
        nuevas: 1,
        modificadas: 1,
        archivadasOEliminadas: 0,
        toInsert: 1,
        toUpdate: 1,
        toArchiveOrDelete: 0,
        unchanged: 5,
        hasChanges: true,
        sampleLabels: [
          'FN-QMS-2026-099',
          'Leak test 11111111-1111-1111-1111-111111111111 should scrub',
        ],
      },
      {
        table: 'requisitos_por_proceso',
        tableLabelEs: 'Cláusulas por proceso',
        targetFile: '06_datos_prueba.sql',
        isFkSupport: false,
        sinCambios: 12,
        nuevas: 2,
        modificadas: 0,
        archivadasOEliminadas: 1,
        toInsert: 2,
        toUpdate: 0,
        toArchiveOrDelete: 1,
        unchanged: 12,
        hasChanges: true,
        sampleLabels: ['Dirección · 4.1'],
      },
    ],
    warnings: [
      'Se omitieron 1 asignación(es) de acceso cliente 99999999-9999-9999-9999-999999999999 fuera de 05_usuarios.sql.',
    ],
    previewSnippets: [
      "INSERT INTO public.certificado (id, numero_certificado) VALUES ('40000000-0000-0000-0000-000000000099', 'FN-QMS-2026-099');",
    ],
    hasChanges: true,
    canApply: true,
  };

  const state = {
    ...createInitialDatabaseSeedSyncState(),
    selectedSectionIds: ['certificacion.certificado', 'extra.norma'],
    previewResult,
    applyResult: {
      ok: true as const,
      plan,
      updatedFiles: [
        {
          fileName: '06_datos_prueba.sql' as const,
          relativePath: 'public/supabase/queries/06_datos_prueba.sql',
          written: true,
          changed: true,
          sizeBytes: 24576,
          tablesChanged: 2,
        },
      ],
      summaryByTable: previewResult.summaryByTable,
      warnings: [],
      appliedAt: '2026-11-28T09:00:00.000Z',
    },
  };

  const html = renderDatabaseSeedSyncView(state);

  // Table layout invariants
  assert.ok(html.includes('<table class="table-fixed w-full border-collapse">'));
  const colgroupMatch = html.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
  assert.ok(colgroupMatch, 'Missing <colgroup> in diff table');
  const colWidths = [...colgroupMatch[1].matchAll(/width:\s*(\d+)%/g)].map((m) => Number(m[1]));
  assert.equal(colWidths.length, 7);
  assert.equal(
    colWidths.reduce((sum, w) => sum + w, 0),
    100
  );

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  assert.ok(tbodyMatch, 'Missing <tbody> in diff table');
  assert.equal(tbodyMatch[1].includes('<button'), false);

  // Collapsible SQL viewer present
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('Inspeccionar SQL generado (1 fragmentos)'));

  // Apply button is enabled when canApply === true
  const applyBtnMatch = html.match(/<button[^>]*data-action="apply-sql-seed-sync"[^>]*>/);
  assert.ok(applyBtnMatch);
  assert.equal(/\sdisabled(?=[\s>])/.test(applyBtnMatch[0]), false);

  // Post-apply banner & shortcut to database-backup
  assert.ok(html.includes('Sincronización SQL aplicada correctamente'));
  assert.ok(html.includes('data-nav="database-backup"'));

  // Zero-UUID compliance everywhere outside the collapsible raw SQL <details> preview
  const htmlWithoutSqlDetails = html.replace(/<details[\s\S]*?<\/details>/g, '');
  assert.equal(assertZeroUuidExposure(htmlWithoutSqlDetails).compliant, true);
});
