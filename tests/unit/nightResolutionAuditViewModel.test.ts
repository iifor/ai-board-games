import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNightResolutionAuditRows,
  summarizeNightResolutionAudits,
} from '../../packages/admin/src/pages/WorkflowDebugConsole/nightResolutionAudit';

test('NightResolution audit view model summarizes matched events', () => {
  const rows = getNightResolutionAuditRows([
    {
      id: 'event-1',
      seq: 10,
      type: 'werewolf_night_resolution_shadow_audited',
      payload: {
        day: 1,
        status: 'matched',
        legacy: { deaths: [] },
        engine: { deaths: [] },
      },
    },
    { id: 'event-ignored', seq: 11, type: 'werewolf_effect_resolved', payload: {} },
  ]);
  const summary = summarizeNightResolutionAudits(rows);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'event-1');
  assert.equal(rows[0].day, 1);
  assert.equal(rows[0].status, 'matched');
  assert.deepEqual(rows[0].legacyDeaths, []);
  assert.deepEqual(summary, {
    total: 1,
    matched: 1,
    mismatched: 0,
    auditFailed: 0,
    unknown: 0,
    latestStatus: 'matched',
  });
});

test('NightResolution audit view model extracts mismatch fields', () => {
  const rows = getNightResolutionAuditRows([
    {
      seq: 12,
      type: 'werewolf_night_resolution_shadow_audited',
      payload: {
        day: '2',
        status: 'mismatched',
        legacy: { deaths: [{ id: 2, reason: 'legacy' }] },
        engine: { deaths: [] },
        mismatches: [{ field: 'deaths' }, { field: 'effects' }],
      },
    },
  ]);
  const summary = summarizeNightResolutionAudits(rows);

  assert.equal(rows[0].day, 2);
  assert.deepEqual(rows[0].mismatchFields, ['deaths', 'effects']);
  assert.deepEqual(rows[0].legacyDeaths, [{ id: 2, reason: 'legacy' }]);
  assert.deepEqual(rows[0].engineDeaths, []);
  assert.equal(summary.mismatched, 1);
  assert.equal(summary.latestStatus, 'mismatched');
});

test('NightResolution audit view model counts audit_failed and unknown malformed events', () => {
  const rows = getNightResolutionAuditRows([
    {
      seq: 13,
      type: 'werewolf_night_resolution_shadow_audited',
      payload: {
        status: 'audit_failed',
        legacy: { deaths: [{ id: 3, reason: 'legacy death' }] },
        error: { message: 'engine unavailable' },
      },
    },
    {
      seq: 14,
      type: 'werewolf_night_resolution_shadow_audited',
      payload: {
        status: 'unexpected-status',
      },
    },
    {
      seq: 15,
      type: 'werewolf_night_resolution_shadow_audited',
      payload: null,
    },
  ]);
  const summary = summarizeNightResolutionAudits(rows);

  assert.equal(rows[0].status, 'audit_failed');
  assert.equal(rows[1].status, 'unknown');
  assert.equal(rows[2].status, 'unknown');
  assert.equal(summary.total, 3);
  assert.equal(summary.auditFailed, 1);
  assert.equal(summary.unknown, 2);
  assert.equal(summary.latestStatus, 'unknown');
});
