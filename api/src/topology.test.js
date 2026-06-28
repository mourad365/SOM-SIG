import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { trace } from './topology.js';
import pool from './db.js';

// Vérifie la FORME du contrat (docs/DIGITAL-TWIN.md) pour un poste et un transfo,
// en appelant directement la fonction de trace contre le pool. Schéma MCD (ADR 0007) :
// codes transfo = TR-#### ; postes source = PS-<id>. Assertions comportementales
// (pas de code de seed en dur, l'ordre id↔code n'est pas garanti).

function assertShape(out) {
  assert.ok(out.root && typeof out.root.type === 'string', 'root.type');
  assert.ok(Number.isInteger(out.root.id), 'root.id');
  assert.ok('code' in out.root, 'root.code');
  for (const k of ['postes', 'transfos', 'lignes', 'points']) {
    assert.ok(Array.isArray(out.affected[k]), `affected.${k} is array`);
  }
  for (const k of ['clients', 'charge_kva', 'transfos', 'lignes']) {
    assert.equal(typeof out.summary[k], 'number', `summary.${k} is number`);
  }
}

test('trace transfo renvoie la forme du contrat', async () => {
  const out = await trace('transfo', 1, 'down');
  assertShape(out);
  assert.equal(out.root.type, 'transfo');
  assert.equal(out.root.id, 1);
  assert.match(out.root.code, /^TR-\d{4}$/);
  // Le transfo se contient lui-même ; ses clients = ses compteurs aval.
  assert.deepEqual(out.affected.transfos, [1]);
  assert.equal(out.summary.transfos, 1);
  assert.equal(out.summary.clients, out.affected.points.length);
  assert.ok(out.summary.charge_kva >= 0, 'charge agrégée numérique');
});

test('trace poste agrège tous ses transfos aval', async () => {
  const out = await trace('poste', 1, 'down');
  assertShape(out);
  assert.equal(out.root.type, 'poste');
  assert.equal(out.root.code, 'PS-1');
  assert.deepEqual(out.affected.postes, [1]);
  assert.ok(out.summary.transfos >= 1, 'au moins un transfo sous le poste');
  assert.equal(out.summary.transfos, out.affected.transfos.length);
  assert.ok(out.summary.clients > 0, 'le poste agrège des clients');
  // L'impact poste ⊇ l'impact d'un seul de ses transfos (plus de clients).
  const t0 = out.affected.transfos[0];
  const single = await trace('transfo', t0, 'down');
  assert.ok(out.summary.clients >= single.summary.clients, 'poste ≥ transfo seul');
});

test('id inconnu lève 404', async () => {
  await assert.rejects(() => trace('transfo', 999999, 'down'), (e) => e.status === 404);
  await assert.rejects(() => trace('poste', 999999, 'down'), (e) => e.status === 404);
});

test('type inconnu lève 404', async () => {
  await assert.rejects(() => trace('bogus', 1, 'down'), (e) => e.status === 404);
});

after(() => pool.end());
