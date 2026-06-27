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

after(() => pool.end());
