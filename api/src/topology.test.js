import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { trace } from './topology.js';
import pool from './db.js';

// Vérifie la FORME du contrat (docs/DIGITAL-TWIN.md) pour un poste et un transfo,
// en appelant directement la fonction de trace contre le pool (comme les autres
// tests api). Le seed est déterministe : TR-TRAP = transfo critique de test.

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

test('trace transfo TR-TRAP renvoie la forme du contrat', async () => {
  // TR-TRAP est transfo_id 1 dans le seed déterministe.
  const out = await trace('transfo', 1, 'down');
  assertShape(out);
  assert.equal(out.root.type, 'transfo');
  assert.equal(out.root.code, 'TR-TRAP');
  // Le transfo se contient lui-même ; ses clients = ses points de service.
  assert.deepEqual(out.affected.transfos, [1]);
  assert.equal(out.summary.transfos, 1);
  assert.ok(out.summary.clients >= 1, 'TR-TRAP a des clients');
  assert.equal(out.summary.clients, out.affected.points.length);
  assert.ok(out.summary.charge_kva > 0, 'charge agrégée > 0');
});

test('trace poste agrège tous ses transfos aval', async () => {
  // Poste_id 2 héberge TR-TRAP + d'autres transfos dans le seed.
  const out = await trace('poste', 2, 'down');
  assertShape(out);
  assert.equal(out.root.type, 'poste');
  assert.deepEqual(out.affected.postes, [2]);
  assert.ok(out.affected.transfos.includes(1), 'inclut TR-TRAP (transfo 1)');
  assert.ok(out.summary.transfos >= 2, 'plusieurs transfos sous le poste');
  assert.equal(out.summary.transfos, out.affected.transfos.length);
  // L'impact poste ⊇ l'impact d'un seul de ses transfos (plus de clients).
  const single = await trace('transfo', 1, 'down');
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
