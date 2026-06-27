import { Router } from 'express';
import { query } from './db.js';

export const apiRouter = Router();

apiRouter.get('/kpi', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT classe, COUNT(*)::int AS n FROM v_charge_transformateur GROUP BY classe`);
    const byClasse = Object.fromEntries(rows.map(r => [r.classe, r.n]));
    const total = rows.reduce((s, r) => s + r.n, 0);
    res.json({ total, byClasse });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'kpi failed' });
  }
});

apiRouter.get('/top-surcharges', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT transfo_id, code_actif, taux_charge, classe, puissance_kva
      FROM v_charge_transformateur
      WHERE taux_charge IS NOT NULL
      ORDER BY taux_charge DESC NULLS LAST
      LIMIT 10`);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'top-surcharges failed' });
  }
});

apiRouter.get('/asset/:type/:id', async (req, res) => {
  if (req.params.type !== 'transfo') return res.status(400).json({ error: 'unknown type' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const { rows } = await query(
      `SELECT transfo_id, code_actif, puissance_kva, charge_kva, taux_charge, classe,
              ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(ST_Transform(geom,4326)) AS lat
       FROM v_charge_transformateur WHERE transfo_id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'asset failed' });
  }
});
