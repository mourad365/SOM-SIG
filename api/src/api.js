import { Router } from 'express';
import { query } from './db.js';
import { trace, TRACE_TYPES } from './topology.js';
import { analyticsRouter } from './analytics.js';
import { coupuresRouter } from './coupures.js'; // --- coupures ---

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
        SELECT 'poste' AS k, COUNT(*)::int AS n FROM poste_source
        UNION ALL SELECT 'transformateur', COUNT(*)::int FROM transformateur
        UNION ALL SELECT 'ligne', COUNT(*)::int FROM ligne_bt
        UNION ALL SELECT 'point_service', COUNT(*)::int FROM compteur
        UNION ALL SELECT 'support', COUNT(*)::int FROM poteau_electrique`),
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
    // statut/etat n'est pas exposé par les vues de charge ; on filtre via la table de base.
    params.push(String(req.query.statut));
    if (type === 'ligne') {
      where.push(`ligne_id IN (SELECT id_ligne_bt FROM ligne_bt WHERE etat = $${params.length})`);
    } else {
      where.push(`transfo_id IN (SELECT id_transformateur FROM transformateur WHERE statut = $${params.length})`);
    }
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
      (SELECT 'transfo' AS type, id_transformateur AS id, code_transformateur AS code, code_transformateur AS label,
              ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(ST_Transform(geom,4326)) AS lat
       FROM transformateur WHERE code_transformateur ILIKE $1)
      UNION ALL
      (SELECT 'poste' AS type, id_poste_source AS id, ('PS-' || id_poste_source) AS code, nom_poste AS label,
              ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(ST_Transform(geom,4326)) AS lat
       FROM poste_source WHERE nom_poste ILIKE $1 OR ('PS-' || id_poste_source) ILIKE $1)
      UNION ALL
      (SELECT 'ligne' AS type, id_ligne_bt AS id, code_ligne_bt AS code, code_ligne_bt AS label,
              ST_X(ST_Transform(ST_Centroid(geom),4326)) AS lng,
              ST_Y(ST_Transform(ST_Centroid(geom),4326)) AS lat
       FROM ligne_bt WHERE code_ligne_bt ILIKE $1)
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
                taux_charge, classe, capacite_a, longueur_m,
                ST_X(ST_Transform(ST_Centroid(geom),4326)) AS lng,
                ST_Y(ST_Transform(ST_Centroid(geom),4326)) AS lat
         FROM v_charge_ligne v WHERE ligne_id = $1`, [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });
      return res.json(rows[0]);
    }
    // n_points_service = nb de compteurs en aval via la chaîne transfo→ligne_bt→poteau→branchement→local→compteur.
    const { rows } = await query(
      `SELECT v.transfo_id, v.code_actif, v.puissance_kva, v.charge_kva, v.taux_charge, v.classe,
              ps.nom_poste AS poste_nom, ('PS-' || ps.id_poste_source) AS code_poste,
              (SELECT COUNT(*)::int
                 FROM ligne_bt b
                 JOIN poteau_electrique pe ON pe.id_ligne_bt = b.id_ligne_bt
                 JOIN branchement br ON br.id_poteau = pe.id_poteau
                 JOIN "local" l ON l.id_branchement = br.id_branchement
                 JOIN compteur c ON c.id_local = l.id_local
                WHERE b.id_transformateur = v.transfo_id) AS n_points_service,
              ST_X(ST_Transform(v.geom,4326)) AS lng, ST_Y(ST_Transform(v.geom,4326)) AS lat
       FROM v_charge_transformateur v
       LEFT JOIN poste_source ps ON ps.id_poste_source = v.poste_id
       WHERE v.transfo_id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'asset failed' });
  }
});

// Parcelle (lot) detail — full chain: clients, compteurs, branchement, poteau, transformateur, documents.
apiRouter.get('/parcelle/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  try {
    // 1. Local info + chain up to transformateur / poste source.
    const { rows: infoRows } = await query(
      `SELECT l.id_local, l.code_local, l.lot, l.ilot, l.adresse, l.type_batiment,
              l.puissance_demandee, l.id_quartier,
              q.nom_quartier,
              br.code_branchement, br.id_poteau,
              pe.code_poteau, pe.type_poteau, pe.fonction_poteau, pe.materiau,
              lb.code_ligne_bt, lb.id_ligne_bt,
              t.id_transformateur, t.code_transformateur AS transfo_code, t.puissance_kva,
              ps.id_poste_source, ps.nom_poste AS poste_nom,
              ST_X(ST_Transform(ST_Centroid(l.geom),4326)) AS lng,
              ST_Y(ST_Transform(ST_Centroid(l.geom),4326)) AS lat
       FROM "local" l
       LEFT JOIN quartier q ON q.id_quartier = l.id_quartier
       LEFT JOIN branchement br ON br.id_branchement = l.id_branchement
       LEFT JOIN poteau_electrique pe ON pe.id_poteau = br.id_poteau
       LEFT JOIN ligne_bt lb ON lb.id_ligne_bt = pe.id_ligne_bt
       LEFT JOIN transformateur t ON t.id_transformateur = lb.id_transformateur
       LEFT JOIN ligne_mt lm ON lm.id_ligne_mt = t.id_ligne_mt
       LEFT JOIN depart_mt dm ON dm.id_depart = lm.id_depart
       LEFT JOIN poste_source ps ON ps.id_poste_source = dm.id_poste_source
       WHERE l.id_local = $1`,
      [id]);
    if (infoRows.length === 0) return res.status(404).json({ error: 'not found' });
    const info = infoRows[0];

    // 2. Clients liés au local (N:N via client_local).
    const { rows: clients } = await query(
      `SELECT c.id_client, c.nom_client, c.telephone, c.adresse
       FROM client c
       JOIN client_local cl ON cl.id_client = c.id_client
       WHERE cl.id_local = $1
       ORDER BY c.nom_client`,
      [id]);

    // 3. Compteurs du local.
    const { rows: compteurs } = await query(
      `SELECT cp.id_compteur, cp.numero_compteur, cp.type_compteur, cp.statut, cp.date_installation
       FROM compteur cp
       WHERE cp.id_local = $1
       ORDER BY cp.numero_compteur`,
      [id]);

    // 4. Documents juridiques.
    const { rows: documents } = await query(
      `SELECT id_document, type_document, reference, date_document::text AS date_document, statut, notes
       FROM document_juridique
       WHERE id_local = $1
       ORDER BY date_document DESC`,
      [id]);

    res.json({ ...info, clients, compteurs, documents });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'parcelle failed' });
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

// --- analytics ---
// Chantier 3 (jumeau numérique) : pertes non techniques + prévision de demande.
// Routes définies dans analytics.js, montées ici sous /api (→ /api/pertes, /api/prevision).
apiRouter.use('/', analyticsRouter);
// --- /analytics ---

// --- coupures ---
// Chantier 5 (jumeau numérique) : registre des coupures & cockpit fiabilité (ADR 0009).
// Routes définies dans coupures.js, montées ici sous /api
// (→ /api/coupures, /api/coupures/:id/cloturer, /api/fiabilite).
apiRouter.use('/', coupuresRouter);
// --- /coupures ---
