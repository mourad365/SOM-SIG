import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pool, { query } from '../src/db.js';

test('TR-TRAP is critique', async () => {
  const { rows } = await query(
    "SELECT classe, taux_charge FROM v_charge_transformateur WHERE code_actif='TR-TRAP'");
  assert.equal(rows[0].classe, 'critique');
  assert.ok(Number(rows[0].taux_charge) > 1);
});

test('TR-TZN-N1 is normal', async () => {
  const { rows } = await query(
    "SELECT classe FROM v_charge_transformateur WHERE code_actif='TR-TZN-N1'");
  assert.equal(rows[0].classe, 'normal');
});

test('attributed line has a numeric taux, unattributed is inconnu', async () => {
  const { rows } = await query(
    "SELECT code_actif, classe, taux_charge FROM v_charge_ligne ORDER BY code_actif");
  const byCode = Object.fromEntries(rows.map(r => [r.code_actif, r]));
  assert.notEqual(byCode['L-HTA15-01'].taux_charge, null);
  assert.equal(byCode['L-BT-04'].classe, 'inconnu');
});

test('zero-kVA transformer is inconnu (no divide-by-zero)', async () => {
  await query("INSERT INTO transformateur (code_actif, puissance_kva, poste_id) VALUES ('TR-ZERO', 0, 1)");
  const { rows } = await query(
    "SELECT classe, taux_charge FROM v_charge_transformateur WHERE code_actif='TR-ZERO'");
  assert.equal(rows[0].classe, 'inconnu');
  assert.equal(rows[0].taux_charge, null);
  await query("DELETE FROM transformateur WHERE code_actif='TR-ZERO'");
});

after(() => pool.end());
