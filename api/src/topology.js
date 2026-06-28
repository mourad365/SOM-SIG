// Traçabilité réseau (Chantier 1 — fondation du jumeau numérique).
// Porté au schéma MCD (ADR 0007) : la trace amont/aval parcourt la chaîne de FK
//   poste_source → transformateur → ligne_bt → poteau → branchement → local → compteur.
// transfo_id / poste_id / code_actif sont lus depuis les vues de charge
// (v_charge_transformateur, v_charge_ligne), qui exposent le vocabulaire hérité.
//
// charge_kva est agrégé depuis v_charge_transformateur (même formule que le SQL,
// constantes partagées du contrat : foisonnement 0.60 / cos_phi 0.90).
import { query } from './db.js';

export const TRACE_TYPES = ['poste', 'transfo', 'ligne'];

// Résout l'ensemble des transfo_id concernés selon le type de racine et la direction.
// down (défaut) = aval ; up = amont.
//  - poste  : aval = ses transfos (via v_charge_transformateur.poste_id).
//  - transfo: aval = lui-même ; amont = lui-même (la maille s'arrête au transfo, ADR 0005).
//  - ligne  : la ligne BT pointe vers un transfo (v_charge_ligne.transfo_id) → aval = ce transfo.
async function resolveTransfoIds(type, id, direction) {
  if (type === 'poste') {
    const { rows } = await query(
      `SELECT transfo_id FROM v_charge_transformateur WHERE poste_id = $1 ORDER BY transfo_id`, [id]);
    return rows.map((r) => r.transfo_id);
  }
  if (type === 'transfo') {
    return [id];
  }
  // ligne (BT)
  const { rows } = await query(
    `SELECT transfo_id FROM v_charge_ligne WHERE ligne_id = $1 AND transfo_id IS NOT NULL`, [id]);
  return rows.map((r) => r.transfo_id);
}

// Vérifie l'existence de la racine et renvoie {type,id,code} ou null (→ 404).
async function resolveRoot(type, id) {
  if (type === 'poste') {
    const { rows } = await query(
      `SELECT id_poste_source AS id, ('PS-' || id_poste_source) AS code
       FROM poste_source WHERE id_poste_source = $1`, [id]);
    return rows[0] ? { type, id: rows[0].id, code: rows[0].code } : null;
  }
  if (type === 'transfo') {
    const { rows } = await query(
      `SELECT id_transformateur AS id, code_transformateur AS code
       FROM transformateur WHERE id_transformateur = $1`, [id]);
    return rows[0] ? { type, id: rows[0].id, code: rows[0].code } : null;
  }
  const { rows } = await query(
    `SELECT id_ligne_bt AS id, code_ligne_bt AS code FROM ligne_bt WHERE id_ligne_bt = $1`, [id]);
  return rows[0] ? { type, id: rows[0].id, code: rows[0].code } : null;
}

/**
 * Calcule l'impact d'un actif. Renvoie la forme exacte du contrat
 * (docs/DIGITAL-TWIN.md). Lève { status:404 } si la racine est inconnue.
 */
export async function trace(type, id, direction = 'down') {
  if (!TRACE_TYPES.includes(type)) { const e = new Error('type inconnu'); e.status = 404; throw e; }
  if (!Number.isInteger(id)) { const e = new Error('id invalide'); e.status = 404; throw e; }
  const dir = direction === 'up' ? 'up' : 'down';

  const root = await resolveRoot(type, id);
  if (!root) { const e = new Error('introuvable'); e.status = 404; throw e; }

  const transfoIds = await resolveTransfoIds(type, id, dir);

  // Postes amont touchés : le(s) poste(s) source parent(s) des transfos concernés
  // (toujours utile, indépendamment de la direction, pour situer l'impact).
  let posteIds = [];
  if (type === 'poste') {
    posteIds = [id];
  } else if (transfoIds.length) {
    const { rows } = await query(
      `SELECT DISTINCT poste_id FROM v_charge_transformateur
       WHERE transfo_id = ANY($1::int[]) AND poste_id IS NOT NULL
       ORDER BY poste_id`, [transfoIds]);
    posteIds = rows.map((r) => r.poste_id);
  }

  if (transfoIds.length === 0) {
    // Racine valide mais sans transfo aval (ex. ligne non rattachée) → impact vide.
    return {
      root,
      affected: { postes: posteIds, transfos: [], lignes: type === 'ligne' ? [id] : [], points: [] },
      summary: { clients: 0, charge_kva: 0, transfos: 0, lignes: type === 'ligne' ? 1 : 0 },
    };
  }

  // Compteurs (clients) en aval via la chaîne du MCD, lignes BT rattachées, et charge agrégée.
  const [points, lignes, agg] = await Promise.all([
    query(
      `SELECT c.id_compteur AS point_id
       FROM compteur c
       JOIN "local" l         ON l.id_local = c.id_local
       JOIN branchement br    ON br.id_branchement = l.id_branchement
       JOIN poteau_electrique pe ON pe.id_poteau = br.id_poteau
       JOIN ligne_bt b        ON b.id_ligne_bt = pe.id_ligne_bt
       WHERE b.id_transformateur = ANY($1::int[])
       ORDER BY c.id_compteur`, [transfoIds]),
    query(`SELECT id_ligne_bt AS ligne_id FROM ligne_bt WHERE id_transformateur = ANY($1::int[]) ORDER BY id_ligne_bt`, [transfoIds]),
    query(
      `SELECT COALESCE(SUM(charge_kva),0)::numeric AS charge_kva
       FROM v_charge_transformateur WHERE transfo_id = ANY($1::int[])`, [transfoIds]),
  ]);

  const pointIds = points.rows.map((r) => r.point_id);
  let ligneIds = lignes.rows.map((r) => r.ligne_id);
  // Pour une racine ligne, garantir que la ligne racine figure dans l'impact.
  if (type === 'ligne' && !ligneIds.includes(id)) ligneIds = [id, ...ligneIds];

  const charge = Math.round(Number(agg.rows[0].charge_kva) * 10) / 10;

  return {
    root,
    affected: { postes: posteIds, transfos: transfoIds, lignes: ligneIds, points: pointIds },
    summary: {
      clients: pointIds.length,
      charge_kva: charge,
      transfos: transfoIds.length,
      lignes: ligneIds.length,
    },
  };
}
