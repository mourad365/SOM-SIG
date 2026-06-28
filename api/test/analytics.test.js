import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import pool from '../src/db.js';
import { projeterTaux, classePourTaux } from '../src/analytics.js';

async function up() { const s = createApp().listen(0); return { s, base: `http://localhost:${s.address().port}` }; }

// ---- Projection math (pure, no I/O) -------------------------------------------
test('projeterTaux: composé annuel, mois 0 = taux₀', () => {
  assert.equal(projeterTaux(0.5, 0.07, 0), 0.5);
});

test('projeterTaux: 12 mois à g=0.07 ≈ taux₀ × 1.07', () => {
  const v = projeterTaux(1, 0.07, 12);
  assert.ok(Math.abs(v - 1.07) < 1e-9);
});

test('projeterTaux: 24 mois compose (1+g)^2', () => {
  const v = projeterTaux(0.5, 0.10, 24);
  assert.ok(Math.abs(v - 0.5 * 1.10 * 1.10) < 1e-9);
});

test('projeterTaux: taux₀ null → null', () => {
  assert.equal(projeterTaux(null, 0.07, 12), null);
});

test('classePourTaux: seuils surcharge/critique', () => {
  assert.equal(classePourTaux(0.5), 'normal');
  assert.equal(classePourTaux(0.8), 'surcharge');
  assert.equal(classePourTaux(0.99), 'surcharge');
  assert.equal(classePourTaux(1.0), 'critique');
  assert.equal(classePourTaux(null), 'inconnu');
});

// ---- /api/pertes (heuristique) ------------------------------------------------
test('pertes returns scored rows with the documented shape', async () => {
  const { s, base } = await up();
  const rows = await (await fetch(`${base}/api/pertes`)).json();
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length >= 1);
  const r = rows[0];
  for (const k of ['transfo_id', 'code', 'ecart_pct', 'suspicion', 'mad_an_estime', 'lng', 'lat']) {
    assert.ok(k in r, `champ manquant: ${k}`);
  }
  assert.ok(['low', 'med', 'high'].includes(r.suspicion));
  assert.ok(typeof r.mad_an_estime === 'number' && r.mad_an_estime >= 0);
  s.close();
});

test('pertes is ordered by ecart_pct descending (pires en tête)', async () => {
  const { s, base } = await up();
  const rows = await (await fetch(`${base}/api/pertes`)).json();
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].ecart_pct >= rows[i].ecart_pct);
  }
  s.close();
});

// ---- /api/prevision -----------------------------------------------------------
test('prevision returns transfos + a timeline of horizon+1 points', async () => {
  const { s, base } = await up();
  const body = await (await fetch(`${base}/api/prevision?horizon=24&g=0.07`)).json();
  assert.equal(body.horizon, 24);
  assert.equal(body.g, 0.07);
  assert.ok(Array.isArray(body.transfos) && body.transfos.length >= 1);
  assert.equal(body.timeline.length, 25); // mois 0..24 inclus
  const t = body.transfos[0];
  for (const k of ['transfo_id', 'code', 'taux0', 'taux_projete', 'classe_actuelle', 'classe_projetee']) {
    assert.ok(k in t, `champ manquant: ${k}`);
  }
  s.close();
});

test('prevision: horizon and g are clamped to safe bounds', async () => {
  const { s, base } = await up();
  const body = await (await fetch(`${base}/api/prevision?horizon=9999&g=99`)).json();
  assert.equal(body.horizon, 36);  // HORIZON_MAX_MOIS
  assert.equal(body.g, 0.5);       // G_MAX
  s.close();
});

test('prevision: growth can only raise the critique count over time (g>0)', async () => {
  const { s, base } = await up();
  const body = await (await fetch(`${base}/api/prevision?horizon=36&g=0.15`)).json();
  const first = body.timeline[0].n_critique;
  const last = body.timeline[body.timeline.length - 1].n_critique;
  assert.ok(last >= first);
  s.close();
});

after(() => pool.end());
