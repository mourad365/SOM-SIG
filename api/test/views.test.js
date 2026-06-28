import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pool, { query } from '../src/db.js';

test('overloaded transformers exist with taux > 1', async () => {
  const { rows } = await query(
    "SELECT classe, taux_charge FROM v_charge_transformateur WHERE classe='critique' LIMIT 1");
  assert.ok(rows.length >= 1, 'expected at least one critique transformer in the seed');
  assert.ok(Number(rows[0].taux_charge) > 1);
});

test('normal transformers exist', async () => {
  const { rows } = await query(
    "SELECT classe FROM v_charge_transformateur WHERE classe='normal' LIMIT 1");
  assert.ok(rows.length >= 1, 'expected at least one normal transformer in the seed');
});

test('BT lines inherit a numeric load class from their transformer', async () => {
  const { rows } = await query(
    "SELECT classe, taux_charge FROM v_charge_ligne WHERE transfo_id IS NOT NULL LIMIT 1");
  assert.ok(rows.length >= 1);
  assert.notEqual(rows[0].taux_charge, null);
  assert.ok(['normal', 'surcharge', 'critique'].includes(rows[0].classe));
});

test('zero-kVA transformer is inconnu (no divide-by-zero)', async () => {
  await query("INSERT INTO transformateur (code_transformateur, puissance_kva) VALUES ('TR-ZERO', 0)");
  const { rows } = await query(
    "SELECT classe, taux_charge FROM v_charge_transformateur WHERE code_actif='TR-ZERO'");
  assert.equal(rows[0].classe, 'inconnu');
  assert.equal(rows[0].taux_charge, null);
  await query("DELETE FROM transformateur WHERE code_transformateur='TR-ZERO'");
});

after(() => pool.end());
