import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import pool from '../src/db.js';

async function up() { const s = createApp().listen(0); return { s, base: `http://localhost:${s.address().port}` }; }

test('kpi has a total and classe counts', async () => {
  const { s, base } = await up();
  const body = await (await fetch(`${base}/api/kpi`)).json();
  assert.ok(body.total >= 3);
  assert.ok('byClasse' in body);
  s.close();
});

test('top-surcharges lists TR-TRAP first', async () => {
  const { s, base } = await up();
  const rows = await (await fetch(`${base}/api/top-surcharges`)).json();
  assert.equal(rows[0].code_actif, 'TR-TRAP');
  s.close();
});

test('unknown asset id is 404', async () => {
  const { s, base } = await up();
  const res = await fetch(`${base}/api/asset/transfo/999999`);
  assert.equal(res.status, 404);
  s.close();
});

test('stats returns counts by type', async () => {
  const { s, base } = await up();
  const body = await (await fetch(`${base}/api/stats`)).json();
  assert.ok(body.counts_by_type.transformateur >= 1);
  assert.ok('transfo_by_classe' in body);
  assert.ok(typeof body.network_health_pct === 'number');
  s.close();
});

test('histogramme returns 4 bins', async () => {
  const { s, base } = await up();
  const bins = await (await fetch(`${base}/api/histogramme`)).json();
  assert.equal(bins.length, 4);
  assert.deepEqual(bins.map(b => b.bin), ['<50%', '50-80%', '80-100%', '>100%']);
  s.close();
});

test('alertes includes TR-TRAP', async () => {
  const { s, base } = await up();
  const rows = await (await fetch(`${base}/api/alertes`)).json();
  assert.ok(rows.some(r => r.type === 'transfo' && r.code === 'TR-TRAP'));
  s.close();
});

test('assets filter type=transfo classe=critique includes TR-TRAP', async () => {
  const { s, base } = await up();
  const body = await (await fetch(`${base}/api/assets?type=transfo&classe=critique`)).json();
  assert.ok(body.total >= 1);
  assert.ok(body.rows.some(r => r.code === 'TR-TRAP'));
  s.close();
});

test('search finds TR-TRAP', async () => {
  const { s, base } = await up();
  const rows = await (await fetch(`${base}/api/search?q=TR-TRAP`)).json();
  assert.ok(rows.some(r => r.type === 'transfo' && r.code === 'TR-TRAP'));
  s.close();
});

after(() => pool.end());
