import { Router } from 'express';
import { query } from './db.js';
import { trace, TRACE_TYPES } from './topology.js';

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

// Aggregate stats: counts by asset type, transfo/ligne class breakdown,
// network health %, and total subscribed charge in kVA.
apiRouter.get('/stats', async (_req, res) => {
  try {
    const [counts, transfoClasse, ligneClasse, health] = await Promise.all([
      query(`
        SELECT 'poste' AS k, COUNT(*)::int AS n FROM poste
        UNION ALL SELECT 'transformateur', COUNT(*)::int FROM transformateur
        UNION ALL SELECT 'ligne', COUNT(*)::int FROM ligne
        UNION ALL SELECT 'point_service', COUNT(*)::int FROM point_service
        UNION ALL SELECT 'support', COUNT(*)::int FROM support`),
      query(`SELECT classe, COUNT(*)::int AS n FROM v_charge_transformateur GROUP BY classe`),
      query(`SELECT classe, COUNT(*)::int AS n FROM v_charge_ligne GROUP BY classe`),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE classe NOT IN ('surcharge','critique'))::int AS sain,
          COALESCE(SUM(charge_kva),0)::numeric AS charge_totale_kva
        FROM v_charge_transformateur`),
    ]);
    const h = health.rows[0];
    res.json({
      counts_by_type: Object.fromEntries(counts.rows.map(r => [r.k, r.n])),
      transfo_by_classe: Object.fromEntries(transfoClasse.rows.map(r => [r.classe, r.n])),
      ligne_by_classe: Object.fromEntries(ligneClasse.rows.map(r => [r.classe, r.n])),
      network_health_pct: h.total > 0 ? Math.round((h.sain / h.total) * 1000) / 10 : null,
      charge_totale_kva: Number(h.charge_totale_kva),
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'stats failed' });
  }
});

// Full-fleet transfo load histogram (NOT top-10): 4 fixed bins, always returned.
apiRouter.get('/histogramme', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        CASE
          WHEN taux_charge < 0.50 THEN '<50%'
          WHEN taux_charge < 0.80 THEN '50-80%'
          WHEN taux_charge < 1.00 THEN '80-100%'
          ELSE '>100%'
        END AS bin,
        COUNT(*)::int AS n
      FROM v_charge_transformateur
      WHERE taux_charge IS NOT NULL
      GROUP BY 1`);
    const found = Object.fromEntries(rows.map(r => [r.bin, r.n]));
    const bins = ['<50%', '50-80%', '80-100%', '>100%'].map(bin => ({ bin, n: found[bin] || 0 }));
    res.json(bins);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'histogramme failed' });
  }
});

// Unified surcharge+critique alerts across transfos and lignes, ordered by taux desc.
apiRouter.get('/alertes', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT 'transfo' AS type, transfo_id AS id, code_actif AS code, classe, taux_charge,
             ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(ST_Transform(geom,4326)) AS lat
      FROM v_charge_transformateur
      WHERE classe IN ('surcharge','critique')
      UNION ALL
      SELECT 'ligne' AS type, ligne_id AS id, code_actif AS code, classe, taux_charge,
             ST_X(ST_Transform(ST_Centroid(geom),4326)) AS lng,
             ST_Y(ST_Transform(ST_Centroid(geom),4326)) AS lat
      FROM v_charge_ligne
      WHERE classe IN ('surcharge','critique')
      ORDER BY taux_charge DESC NULLS LAST`);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'alertes failed' });
  }
});

// Filterable, sortable, paginated asset list (transfo | ligne). Fully parameterized;
// sort column and order come from server-side whitelists only.
const ASSET_SORT = { transfo: { taux_charge: 'taux_charge', code: 'code_actif' },
                     ligne:   { taux_charge: 'taux_charge', code: 'code_actif' } };
apiRouter.get('/assets', async (req, res) => {
  const type = req.query.type === 'ligne' ? 'ligne' : 'transfo';
  const view = type === 'ligne' ? 'v_charge_ligne' : 'v_charge_transformateur';

  const sortKey = String(req.query.sort || 'taux_charge');
  const sortCol = ASSET_SORT[type][sortKey] || 'taux_charge';
  const order = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;
  let offset = parseInt(req.query.offset, 10);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;

  const where = [];
  const params = [];
  if (req.query.classe) { params.push(String(req.query.classe)); where.push(`classe = $${params.length}`); }
  if (req.query.niveau_tension && type === 'ligne') {
    params.push(String(req.query.niveau_tension)); where.push(`niveau_tension = $${params.length}`);
  }
  if (req.query.statut) {
    // transfo/ligne classes come from views that don't expose statut directly;
    // join base table for statut filtering.
    params.push(String(req.query.statut));
    const idCol = type === 'ligne' ? 'ligne_id' : 'transfo_id';
    const base = type === 'ligne' ? 'ligne' : 'transformateur';
    where.push(`${idCol} IN (SELECT ${idCol} FROM ${base} WHERE statut = $${params.length})`);
  }
  if (req.query.q) { params.push(`%${String(req.query.q)}%`); where.push(`code_actif ILIKE $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const cols = type === 'ligne'
    ? 'ligne_id AS id, code_actif AS code, niveau_tension, section_mm2, type_pose, taux_charge, classe'
    : 'transfo_id AS id, code_actif AS code, puissance_kva, charge_kva, taux_charge, classe';

  try {
    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM ${view} ${whereSql}`, params);
    const listParams = params.slice();
    listParams.push(limit); const limPos = listParams.length;
    listParams.push(offset); const offPos = listParams.length;
    const { rows } = await query(
      `SELECT ${cols} FROM ${view} ${whereSql}
       ORDER BY ${sortCol} ${order} NULLS LAST
       LIMIT $${limPos} OFFSET $${offPos}`, listParams);
    res.json({ rows, total: totalRes.rows[0].total });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'assets failed' });
  }
});

// Up to 10 matches across transfo, poste, ligne codes/names.
apiRouter.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const like = `%${q}%`;
  try {
    const { rows } = await query(`
      (SELECT 'transfo' AS type, transfo_id AS id, code_actif AS code, code_actif AS label,
              ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(ST_Transform(geom,4326)) AS lat
       FROM transformateur WHERE code_actif ILIKE $1)
      UNION ALL
      (SELECT 'poste' AS type, poste_id AS id, code_poste AS code, nom AS label,
              ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(ST_Transform(geom,4326)) AS lat
       FROM poste WHERE code_poste ILIKE $1 OR nom ILIKE $1)
      UNION ALL
      (SELECT 'ligne' AS type, ligne_id AS id, code_actif AS code, code_actif AS label,
              ST_X(ST_Transform(ST_Centroid(geom),4326)) AS lng,
              ST_Y(ST_Transform(ST_Centroid(geom),4326)) AS lat
       FROM ligne WHERE code_actif ILIKE $1)
      LIMIT 10`, [like]);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'search failed' });
  }
});

// Asset detail for transfo or ligne, with geom lng/lat and relations.
apiRouter.get('/asset/:type/:id', async (req, res) => {
  const { type } = req.params;
  if (type !== 'transfo' && type !== 'ligne') return res.status(400).json({ error: 'unknown type' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  try {
    if (type === 'ligne') {
      const { rows } = await query(
        `SELECT ligne_id, code_actif, niveau_tension, section_mm2, type_pose,
                taux_charge, classe, capacite_a,
                (SELECT longueur_m FROM ligne WHERE ligne_id = v.ligne_id) AS longueur_m,
                ST_X(ST_Transform(ST_Centroid(geom),4326)) AS lng,
                ST_Y(ST_Transform(ST_Centroid(geom),4326)) AS lat
         FROM v_charge_ligne v WHERE ligne_id = $1`, [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });
      return res.json(rows[0]);
    }
    const { rows } = await query(
      `SELECT v.transfo_id, v.code_actif, v.puissance_kva, v.charge_kva, v.taux_charge, v.classe,
              p.nom AS poste_nom, p.code_poste,
              (SELECT COUNT(*)::int FROM point_service ps WHERE ps.transfo_id = v.transfo_id) AS n_points_service,
              ST_X(ST_Transform(v.geom,4326)) AS lng, ST_Y(ST_Transform(v.geom,4326)) AS lat
       FROM v_charge_transformateur v
       LEFT JOIN poste p ON p.poste_id = v.poste_id
       WHERE v.transfo_id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'asset failed' });
  }
});

// --- trace routes (Chantier 1 — traçabilité) ---
// GET /api/trace/:type/:id?direction=down|up  (type ∈ poste|transfo|ligne)
// Impact amont/aval d'un actif (clients, kVA, actifs touchés). Voir topology.js.
apiRouter.get('/trace/:type/:id', async (req, res) => {
  const { type } = req.params;
  if (!TRACE_TYPES.includes(type)) return res.status(404).json({ error: 'unknown type' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'bad id' });
  const direction = req.query.direction === 'up' ? 'up' : 'down';
  try {
    res.json(await trace(type, id, direction));
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'not found' });
    console.error(err); res.status(500).json({ error: 'trace failed' });
  }
});
// --- end trace routes ---
