// Tests du cœur pur de fiabilité (node --test). Vérifie SAIDI/SAIFI/CAIDI/ENS sur un
// jeu fixe à résultat connu + les bornes (N=0, coupure active, exclusion des programmées).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dureeHeures, ensKwh, indices, indicesParType, COS_PHI } from './fiabilite.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('dureeHeures — résolue (fin) vs active (now)', () => {
  assert.ok(near(dureeHeures('2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z'), 2));
  // active : fin absente ⇒ now − debut.
  const now = new Date('2026-01-01T01:30:00Z').getTime();
  assert.ok(near(dureeHeures('2026-01-01T00:00:00Z', null, now), 1.5));
  // dates invalides ⇒ 0 (fail-safe).
  assert.equal(dureeHeures('pas-une-date', null, now) >= 0, true);
});

test('ensKwh — charge × cos_phi × durée', () => {
  assert.ok(near(ensKwh(50, 2), 50 * COS_PHI * 2)); // 90
  assert.equal(ensKwh(null, 5), 0);
});

// Fixture : N = 1000 clients. Durées explicites (aucune dépendance à « now »).
const incidents = [
  { type: 'incident', clients_affectes: 100, charge_kva: 50, debut: '2026-01-01T00:00:00Z', fin: '2026-01-01T02:00:00Z' }, // 2 h
  { type: 'incident', clients_affectes: 200, charge_kva: 80, debut: '2026-01-01T00:00:00Z', fin: '2026-01-01T01:00:00Z' }, // 1 h
];
const programmee = { type: 'programmee', clients_affectes: 50, charge_kva: 40, debut: '2026-01-01T00:00:00Z', fin: '2026-01-01T03:00:00Z' }; // 3 h

test('indices — SAIDI/SAIFI/CAIDI/ENS sur fixture connue', () => {
  const r = indices(incidents, 1000);
  assert.equal(r.n, 2);
  assert.ok(near(r.saifi, 0.3), `saifi=${r.saifi}`);          // (100+200)/1000
  assert.ok(near(r.saidi_h, 0.4), `saidi=${r.saidi_h}`);      // (100×2 + 200×1)/1000
  assert.ok(near(r.caidi_h, 0.4 / 0.3), `caidi=${r.caidi_h}`);
  assert.ok(near(r.ens_kwh, 50 * 0.9 * 2 + 80 * 0.9 * 1), `ens=${r.ens_kwh}`); // 162
});

test('indices — N=0 ⇒ SAIDI/SAIFI nuls, ENS toujours calculée', () => {
  const r = indices(incidents, 0);
  assert.equal(r.saifi, null);
  assert.equal(r.saidi_h, null);
  assert.ok(near(r.ens_kwh, 162));
});

test('indices — coupure active accumule via now', () => {
  const active = [{ type: 'incident', clients_affectes: 100, charge_kva: 50, debut: '2026-01-01T00:00:00Z', fin: null }];
  const now = new Date('2026-01-01T03:00:00Z').getTime(); // 3 h écoulées
  const r = indices(active, 1000, { now });
  assert.ok(near(r.saidi_h, 0.3));            // 100×3/1000
  assert.ok(near(r.ens_kwh, 50 * 0.9 * 3));   // 135
});

test('indicesParType — programmées exclues du bloc incidents', () => {
  const { incidents: inc, programmees: prog } = indicesParType([...incidents, programmee], 1000);
  assert.equal(inc.n, 2);
  assert.equal(prog.n, 1);
  assert.ok(near(inc.ens_kwh, 162));
  assert.ok(near(prog.saifi, 0.05));          // 50/1000
  assert.ok(near(prog.ens_kwh, 40 * 0.9 * 3)); // 108
});
