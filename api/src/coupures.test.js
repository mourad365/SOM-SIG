import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.js';
import { trace } from './topology.js';
import pool from './db.js';

// Teste le chemin HTTP réel (createApp + fetch sur un port éphémère) : validation,
// parsing JSON, snapshot via trace() et SQL. Requiert la migration 005 + les seeds
// appliqués (transfo id 1 présent, cf. topology.test.js). Nettoie ses propres insertions.

let server;
let base;
const created = [];

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (created.length) {
    await pool.query(`DELETE FROM coupure WHERE id_coupure = ANY($1::int[])`, [created]);
  }
  await new Promise((r) => server.close(r));
  await pool.end();
});

function postCoupure(body) {
  return fetch(`${base}/api/coupures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /coupures fige l’impact issu de trace()', async () => {
  const expected = await trace('transfo', 1, 'down');
  const res = await postCoupure({ type: 'incident', actif_type: 'transfo', actif_id: 1, cause: 'defaut' });
  assert.equal(res.status, 201);
  const c = await res.json();
  created.push(c.id_coupure);

  // Le snapshot reproduit EXACTEMENT la trace (aucune logique d'impact dupliquée).
  assert.equal(c.clients_affectes, expected.summary.clients);
  assert.equal(Number(c.charge_kva), Math.round(expected.summary.charge_kva * 10) / 10);
  assert.equal(c.statut, 'active');     // pas de fin ⇒ en cours
  assert.equal(c.source, 'reel');
  assert.equal(Number(c.ens_kwh), 0);   // en cours ⇒ ENS nulle (s'accumulera)
  assert.match(c.code_actif, /^TR-\d{4}$/);
});

test('PATCH /coupures/:id/cloturer fixe fin, ENS et statut', async () => {
  const debut = new Date(Date.now() - 2 * 3_600_000).toISOString(); // il y a 2 h
  const post = await (await postCoupure(
    { type: 'incident', actif_type: 'transfo', actif_id: 1, cause: 'defaut', debut })).json();
  created.push(post.id_coupure);

  const fin = new Date().toISOString();
  const res = await fetch(`${base}/api/coupures/${post.id_coupure}/cloturer`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fin }),
  });
  assert.equal(res.status, 200);
  const c = await res.json();
  assert.equal(c.statut, 'resolue');
  assert.ok(c.fin, 'fin renseignée');

  // ENS = charge_kva × cos_phi(0,90) × durée_h, tolérance sur l'arrondi.
  const dureeH = (new Date(fin).getTime() - new Date(debut).getTime()) / 3_600_000;
  const attendu = Number(c.charge_kva) * 0.9 * dureeH;
  assert.ok(Math.abs(Number(c.ens_kwh) - attendu) <= attendu * 0.02 + 0.2, 'ENS cohérente');
});

test('GET /coupures filtre par statut', async () => {
  const rows = await (await fetch(`${base}/api/coupures?statut=resolue`)).json();
  assert.ok(Array.isArray(rows));
  assert.ok(rows.every((r) => r.statut === 'resolue'), 'toutes résolues');
  assert.ok(rows.some((r) => created.includes(r.id_coupure)), 'contient une coupure du test');
});

test('GET /fiabilite renvoie des indices cohérents', async () => {
  const f = await (await fetch(`${base}/api/fiabilite`)).json();
  assert.ok(Number.isInteger(f.n_clients) && f.n_clients > 0, 'N clients > 0');
  assert.ok(f.incidents && typeof f.incidents.saidi_h !== 'undefined', 'bloc incidents');
  assert.ok(f.programmees && typeof f.programmees.n === 'number', 'bloc programmées');
  assert.ok(Array.isArray(f.timeline) && Array.isArray(f.classement), 'tendance + classement');
  assert.ok(f.incidents.n >= 1, 'au moins l’incident du test');
});

test('POST /coupures rejette un corps invalide (400)', async () => {
  const res = await postCoupure({ type: 'bogus', actif_type: 'transfo', actif_id: 1, cause: 'defaut' });
  assert.equal(res.status, 400);
});

test('POST /coupures sur actif inconnu → 404', async () => {
  const res = await postCoupure({ type: 'incident', actif_type: 'transfo', actif_id: 999999, cause: 'defaut' });
  assert.equal(res.status, 404);
});
