// Registre des coupures & fiabilité (ADR 0009) — Chantier 5 du jumeau numérique.
//
// Une coupure est un objet métier PERSISTANT (table `coupure`, migration 005) :
//   - programmée (maintenance/délestage) ou subie (incident/panne),
//   - dont l'IMPACT est figé à la déclaration (snapshot via topology.trace()),
//   - qui alimente les indices de fiabilité SAIDI/SAIFI/CAIDI/ENS.
//
// Aucune logique d'impact n'est dupliquée : clients & charge_kva viennent de trace().
// cos_phi vient de la table `parametre` (source de vérité partagée, cf. sim/load.js & SQL).
// Convention métier : les indices se calculent sur les INCIDENTS ; les coupures
// programmées sont agrégées séparément.

import { Router } from 'express';
import { query } from './db.js';
import { trace, TRACE_TYPES } from './topology.js';

export const coupuresRouter = Router();

const TYPES = ['programmee', 'incident'];
const CAUSES = ['maintenance', 'delestage', 'defaut', 'intemperie', 'inconnu'];

// cos_phi partagé (défaut 0.90 si la table parametre est muette) — jamais codé en dur ailleurs.
async function cosPhi() {
  const { rows } = await query(`SELECT valeur FROM parametre WHERE cle = 'cos_phi'`);
  const v = Number(rows[0]?.valeur);
  return Number.isFinite(v) && v > 0 ? v : 0.9;
}

// Durée en heures entre debut et fin (fin absente ⇒ « maintenant » : l'ENS s'accumule).
function dureeHeures(debut, fin) {
  const end = fin ? new Date(fin) : new Date();
  return Math.max(0, (end.getTime() - new Date(debut).getTime()) / 3_600_000);
}

// Statut dérivé (non source de vérité) : résolue si fin, planifiée si future, sinon active.
function statutPour(debut, fin) {
  if (fin) return 'resolue';
  return new Date(debut).getTime() > Date.now() ? 'planifiee' : 'active';
}

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// POST /api/coupures — déclarer une coupure. Calcule l'impact via trace() et le fige.
coupuresRouter.post('/coupures', async (req, res) => {
  const b = req.body || {};
  const type = TYPES.includes(b.type) ? b.type : null;
  const actifType = TRACE_TYPES.includes(b.actif_type) ? b.actif_type : null;
  const actifId = Number(b.actif_id);
  const cause = b.cause == null ? 'inconnu' : (CAUSES.includes(b.cause) ? b.cause : null);

  if (!type || !actifType || !Number.isInteger(actifId) || cause === null) {
    return res.status(400).json({ error: 'champs invalides (type, actif_type, actif_id, cause)' });
  }
  const debut = b.debut ? new Date(b.debut) : new Date();
  if (Number.isNaN(debut.getTime())) return res.status(400).json({ error: 'debut invalide' });
  let fin = null;
  if (b.fin) {
    fin = new Date(b.fin);
    if (Number.isNaN(fin.getTime())) return res.status(400).json({ error: 'fin invalide' });
    if (fin.getTime() < debut.getTime()) return res.status(400).json({ error: 'fin antérieure au début' });
  }

  try {
    const impact = await trace(actifType, actifId, 'down'); // lève 404 si l'actif est inconnu
    const cphi = await cosPhi();
    const clients = impact.summary.clients;
    const charge = impact.summary.charge_kva;
    const ens = fin ? charge * cphi * dureeHeures(debut, fin) : 0;

    const { rows } = await query(
      `INSERT INTO coupure
         (type, statut, actif_type, actif_id, code_actif, cause, debut, fin,
          clients_affectes, charge_kva, ens_kwh, source, commentaire)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'reel',$12)
       RETURNING *`,
      [type, statutPour(debut, fin), actifType, actifId, impact.root.code, cause,
       debut.toISOString(), fin ? fin.toISOString() : null,
       clients, round1(charge), round1(ens), b.commentaire || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'actif introuvable' });
    console.error(err); res.status(500).json({ error: 'coupure create failed' });
  }
});

// GET /api/coupures?statut=&type=&source=&from=&to= — journal filtré, plus récent d'abord.
coupuresRouter.get('/coupures', async (req, res) => {
  const where = [];
  const params = [];
  for (const [key, col] of [['statut', 'statut'], ['type', 'type'], ['source', 'source']]) {
    if (req.query[key]) { params.push(String(req.query[key])); where.push(`${col} = $${params.length}`); }
  }
  if (req.query.from) { params.push(String(req.query.from)); where.push(`debut >= $${params.length}`); }
  if (req.query.to) { params.push(String(req.query.to)); where.push(`debut <= $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  try {
    const { rows } = await query(
      `SELECT *, EXTRACT(EPOCH FROM (COALESCE(fin, now()) - debut)) / 3600.0 AS duree_h
       FROM coupure ${whereSql}
       ORDER BY debut DESC`, params);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'coupures list failed' });
  }
});

// PATCH /api/coupures/:id/cloturer — clore un incident actif : fixe fin, recalcule ENS, statut=resolue.
coupuresRouter.patch('/coupures/:id/cloturer', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const fin = req.body?.fin ? new Date(req.body.fin) : new Date();
  if (Number.isNaN(fin.getTime())) return res.status(400).json({ error: 'fin invalide' });
  try {
    const { rows: cur } = await query(`SELECT * FROM coupure WHERE id_coupure = $1`, [id]);
    if (!cur[0]) return res.status(404).json({ error: 'introuvable' });
    const c = cur[0];
    if (fin.getTime() < new Date(c.debut).getTime()) {
      return res.status(400).json({ error: 'fin antérieure au début' });
    }
    const cphi = await cosPhi();
    const ens = Number(c.charge_kva) * cphi * dureeHeures(c.debut, fin);
    const { rows } = await query(
      `UPDATE coupure SET fin = $1, ens_kwh = $2, statut = 'resolue'
       WHERE id_coupure = $3 RETURNING *`,
      [fin.toISOString(), round1(ens), id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'cloture failed' });
  }
});

// GET /api/coupures/:id/clients — liste des clients affectés (pour l'avis & l'export CSV).
// Re-trace l'actif figé de la coupure puis joint le détail compteur → local → quartier.
coupuresRouter.get('/coupures/:id/clients', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    const { rows: cur } = await query(
      `SELECT actif_type, actif_id FROM coupure WHERE id_coupure = $1`, [id]);
    if (!cur[0]) return res.status(404).json({ error: 'introuvable' });

    const impact = await trace(cur[0].actif_type, cur[0].actif_id, 'down');
    const points = impact.affected.points;
    if (!points.length) return res.json([]);

    const { rows } = await query(
      `SELECT c.numero_compteur, c.statut, l.adresse, l.type_batiment,
              COALESCE(q.nom_quartier, '—') AS quartier
       FROM compteur c
       JOIN "local" l        ON l.id_local = c.id_local
       LEFT JOIN quartier q  ON q.id_quartier = l.id_quartier
       WHERE c.id_compteur = ANY($1::int[])
       ORDER BY quartier, l.adresse NULLS LAST, c.numero_compteur`, [points]);
    res.json(rows);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'actif introuvable' });
    console.error(err); res.status(500).json({ error: 'clients failed' });
  }
});

// GET /api/fiabilite?from=&to=&source= — indices SAIDI/SAIFI/CAIDI/ENS + tendance + classement.
// N = clients servis = count(compteur). ENS = Σ charge_kva × cos_phi × durée_h.
coupuresRouter.get('/fiabilite', async (req, res) => {
  const source = ['reel', 'simule'].includes(req.query.source) ? req.query.source : 'all';
  const filt = [];
  const params = [];
  if (source !== 'all') { params.push(source); filt.push(`source = $${params.length}`); }
  if (req.query.from) { params.push(String(req.query.from)); filt.push(`debut >= $${params.length}`); }
  if (req.query.to) { params.push(String(req.query.to)); filt.push(`debut <= $${params.length}`); }
  const whereSql = filt.length ? `WHERE ${filt.join(' AND ')}` : '';
  const dur = `EXTRACT(EPOCH FROM (COALESCE(fin, now()) - debut)) / 3600.0`;

  try {
    const cphi = await cosPhi();
    const cphiPos = params.length + 1; // position de cos_phi dans les requêtes qui l'utilisent
    const withCphi = [...params, cphi];

    const [{ rows: nrow }, { rows: agg }, { rows: tl }, { rows: cl }, { rows: srow }] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM compteur`),
      query(
        `SELECT type,
                COUNT(*)::int AS n,
                COALESCE(SUM(clients_affectes), 0)::numeric AS sum_clients,
                COALESCE(SUM(clients_affectes * ${dur}), 0)::numeric AS sum_client_h,
                COALESCE(SUM(charge_kva * $${cphiPos} * ${dur}), 0)::numeric AS sum_ens
         FROM coupure ${whereSql}
         GROUP BY type`, withCphi),
      query(
        `SELECT to_char(date_trunc('month', debut), 'YYYY-MM') AS mois,
                COUNT(*) FILTER (WHERE type = 'incident')::int AS n,
                COALESCE(SUM(clients_affectes) FILTER (WHERE type = 'incident'), 0)::numeric AS sum_clients,
                COALESCE(SUM(clients_affectes * ${dur}) FILTER (WHERE type = 'incident'), 0)::numeric AS sum_client_h,
                COALESCE(SUM(charge_kva * $${cphiPos} * ${dur}), 0)::numeric AS sum_ens
         FROM coupure ${whereSql}
         GROUP BY 1 ORDER BY 1`, withCphi),
      query(
        `WITH base AS (
           SELECT c.type, c.clients_affectes, c.charge_kva, ${dur} AS duree_h,
                  CASE c.actif_type
                    WHEN 'poste'   THEN c.actif_id
                    WHEN 'transfo' THEN (SELECT poste_id FROM v_charge_transformateur WHERE transfo_id = c.actif_id)
                    WHEN 'ligne'   THEN (SELECT vt.poste_id FROM v_charge_ligne vl
                                          JOIN v_charge_transformateur vt ON vt.transfo_id = vl.transfo_id
                                          WHERE vl.ligne_id = c.actif_id LIMIT 1)
                  END AS poste_id
           FROM coupure c ${whereSql}
         )
         SELECT b.poste_id,
                COALESCE(ps.nom_poste, 'PS-' || b.poste_id) AS code,
                COUNT(*) FILTER (WHERE b.type = 'incident')::int AS n_incidents,
                COALESCE(SUM(b.charge_kva * $${cphiPos} * b.duree_h) FILTER (WHERE b.type = 'incident'), 0)::numeric AS ens_kwh,
                COALESCE(SUM(b.clients_affectes * b.duree_h) FILTER (WHERE b.type = 'incident'), 0)::numeric AS client_heures
         FROM base b
         LEFT JOIN poste_source ps ON ps.id_poste_source = b.poste_id
         WHERE b.poste_id IS NOT NULL
         GROUP BY b.poste_id, ps.nom_poste
         HAVING COUNT(*) FILTER (WHERE b.type = 'incident') > 0
         ORDER BY ens_kwh DESC
         LIMIT 10`, withCphi),
      query(`SELECT COUNT(*) FILTER (WHERE source = 'simule')::int AS n_simule FROM coupure ${whereSql}`, params),
    ]);

    const nClients = nrow[0].n;
    const byType = Object.fromEntries(agg.map((r) => [r.type, r]));

    // SAIFI = Σ clients / N ; SAIDI = Σ (clients × durée_h) / N ; CAIDI = SAIDI / SAIFI ; ENS en kWh.
    const indices = (r) => {
      if (!r) return { saidi_h: 0, saifi: 0, caidi_h: 0, ens_kwh: 0, n: 0 };
      const saifi = nClients > 0 ? Number(r.sum_clients) / nClients : null;
      const saidi = nClients > 0 ? Number(r.sum_client_h) / nClients : null;
      const caidi = saifi && saifi > 0 ? saidi / saifi : 0;
      return {
        saidi_h: saidi == null ? null : round2(saidi),
        saifi: saifi == null ? null : round2(saifi),
        caidi_h: round2(caidi),
        ens_kwh: Math.round(Number(r.sum_ens)),
        n: r.n,
      };
    };

    res.json({
      periode: { from: req.query.from || null, to: req.query.to || null },
      n_clients: nClients,
      incidents: indices(byType.incident),
      programmees: indices(byType.programmee),
      timeline: tl.map((r) => ({
        mois: r.mois,
        n: r.n,
        saifi: nClients > 0 ? round2(Number(r.sum_clients) / nClients) : null,
        saidi_h: nClients > 0 ? round2(Number(r.sum_client_h) / nClients) : null,
        ens_kwh: Math.round(Number(r.sum_ens)),
      })),
      classement: cl.map((r) => ({
        poste_id: r.poste_id,
        code: r.code,
        n_incidents: r.n_incidents,
        ens_kwh: Math.round(Number(r.ens_kwh)),
        client_heures: round1(r.client_heures),
      })),
      source_filtre: source,
      n_simule: srow[0].n_simule,
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'fiabilite failed' });
  }
});
