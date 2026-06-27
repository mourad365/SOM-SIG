// Tests du cœur pur de simulation (node --test).
// Vérifie que computeCharge / classeFor rejouent la formule SQL de
// db/migrations/003_views.sql : un cas par seuil + le cas TR-TRAP (surcharge réelle du seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCharge, classeFor, PARAMS } from './load.js';

// Rappel formule : charge_kva = Σkw × 0.60 / 0.90 ; taux = charge_kva / kva.
// Pour viser un taux cible : kw = taux × kva × 1.5  (car 0.90/0.60 = 1.5).
const kwForTaux = (taux, kva) => (taux * kva) / (PARAMS.foisonnement / PARAMS.cosPhi);

test('classeFor — un cas par seuil', () => {
  assert.equal(classeFor(0.5), 'normal');
  assert.equal(classeFor(0.8), 'surcharge'); // bord inclusif seuilAlerte
  assert.equal(classeFor(0.95), 'surcharge');
  assert.equal(classeFor(1.0), 'critique'); // bord inclusif seuilCritique
  assert.equal(classeFor(1.46), 'critique');
  assert.equal(classeFor(null), 'inconnu');
  assert.equal(classeFor(undefined), 'inconnu');
});

test('computeCharge — classe normal (taux < 0.80)', () => {
  const transfos = [{ id: 1, puissance_kva: 250 }];
  const points = [{ transfo_id: 1, puiss_souscrite_kw: kwForTaux(0.5, 250) }];
  const r = computeCharge(transfos, points).get(1);
  assert.ok(Math.abs(r.taux - 0.5) < 1e-9);
  assert.equal(r.classe, 'normal');
});

test('computeCharge — classe surcharge (0.80 ≤ taux < 1.00)', () => {
  const transfos = [{ id: 2, puissance_kva: 400 }];
  const points = [{ transfo_id: 2, puiss_souscrite_kw: kwForTaux(0.85, 400) }];
  const r = computeCharge(transfos, points).get(2);
  assert.ok(Math.abs(r.taux - 0.85) < 1e-9);
  assert.equal(r.classe, 'surcharge');
});

test('computeCharge — classe critique (taux ≥ 1.00)', () => {
  const transfos = [{ id: 3, puissance_kva: 160 }];
  const points = [{ transfo_id: 3, puiss_souscrite_kw: kwForTaux(1.2, 160) }];
  const r = computeCharge(transfos, points).get(3);
  assert.ok(Math.abs(r.taux - 1.2) < 1e-9);
  assert.equal(r.classe, 'critique');
});

test('computeCharge — classe inconnu (puissance_kva null ou 0)', () => {
  const transfos = [{ id: 4, puissance_kva: null }, { id: 5, puissance_kva: 0 }];
  const points = [{ transfo_id: 4, puiss_souscrite_kw: 100 }, { transfo_id: 5, puiss_souscrite_kw: 100 }];
  const m = computeCharge(transfos, points);
  assert.equal(m.get(4).taux, null);
  assert.equal(m.get(4).classe, 'inconnu');
  assert.equal(m.get(5).taux, null);
  assert.equal(m.get(5).classe, 'inconnu');
});

// Cas TR-TRAP : transfo sous-dimensionné du seed (160 kVA) avec 12 points × 29.2 kW.
// charge_kva = 350.4 × 0.60/0.90 = 233.6 ; taux = 233.6/160 ≈ 1.46 → critique.
test('computeCharge — TR-TRAP en surcharge critique (cas du seed)', () => {
  const transfos = [{ id: 'TR-TRAP', puissance_kva: 160 }];
  const points = Array.from({ length: 12 }, () => ({ transfo_id: 'TR-TRAP', puiss_souscrite_kw: 29.2 }));
  const r = computeCharge(transfos, points).get('TR-TRAP');
  assert.ok(Math.abs(r.charge_kva - 233.6) < 1e-9, `charge_kva=${r.charge_kva}`);
  assert.ok(Math.abs(r.taux - 1.46) < 1e-9, `taux=${r.taux}`);
  assert.equal(r.classe, 'critique');
});

// Démo « what-if » : réaffecter la moitié des clients de TR-TRAP vers un transfo voisin
// neuf de 400 kVA fait repasser TR-TRAP sous le seuil (rouge → vert).
test('computeCharge — réaffectation soulage TR-TRAP (rouge → normal)', () => {
  const transfos = [{ id: 'TR-TRAP', puissance_kva: 160 }, { id: 'TR-NEUF', puissance_kva: 400 }];
  const points = Array.from({ length: 12 }, (_, i) => ({
    transfo_id: i < 4 ? 'TR-TRAP' : 'TR-NEUF', // 4 restent, 8 déplacés
    puiss_souscrite_kw: 29.2,
  }));
  const m = computeCharge(transfos, points);
  assert.equal(m.get('TR-TRAP').classe, 'normal');
});

test('computeCharge — transfo sans point rattaché → charge 0, normal', () => {
  const m = computeCharge([{ id: 9, puissance_kva: 250 }], []);
  assert.equal(m.get(9).charge_kva, 0);
  assert.equal(m.get(9).classe, 'normal');
});
