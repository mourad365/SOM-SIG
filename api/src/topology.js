// Traçabilité réseau (Chantier 1 — fondation du jumeau numérique).
// Trace l'impact amont/aval d'un actif via la chaîne de FK DÉJÀ existante :
//   poste ─< transformateur.poste_id ─< point_service.transfo_id ; ligne.transfo_id → transfo.
// Aucune nouvelle topologie lourde : on agrège seulement ces jointures.
//
// charge_kva est lu depuis la vue v_charge_transformateur (même formule que le SQL,
// constantes partagées du contrat : foisonnement 0.60 / cos_phi 0.90).
import { query } from './db.js';

export const TRACE_TYPES = ['poste', 'transfo', 'ligne'];

// Résout l'ensemble des transfo_id concernés selon le type de racine et la direction.
// down (défaut) = aval ; up = amont.
//  - poste  : aval = ses transfos (poste_id). (amont = lui-même, pas d'au-dessus.)
//  - transfo: aval = lui-même ; amont = lui-même (+ son poste exposé via root).
//  - ligne  : sa ligne pointe vers un transfo (ligne.transfo_id) → aval = ce transfo.
async function resolveTransfoIds(type, id, direction) {
  if (type === 'poste') {
    const { rows } = await query(
      `SELECT transfo_id FROM transformateur WHERE poste_id = $1 ORDER BY transfo_id`, [id]);
    return rows.map((r) => r.transfo_id);
  }
  if (type === 'transfo') {
    // aval comme amont : la maille fine s'arrête au transfo (cf. ADR 0005).
    return [id];
  }
  // ligne
  const { rows } = await query(
    `SELECT transfo_id FROM ligne WHERE ligne_id = $1 AND transfo_id IS NOT NULL`, [id]);
  return rows.map((r) => r.transfo_id);
}

// Vérifie l'existence de la racine et renvoie {type,id,code} ou null (→ 404).
async function resolveRoot(type, id) {
  if (type === 'poste') {
    const { rows } = await query(`SELECT poste_id AS id, code_poste AS code FROM poste WHERE poste_id = $1`, [id]);
    return rows[0] ? { type, id: rows[0].id, code: rows[0].code } : null;
  }
  if (type === 'transfo') {
    const { rows } = await query(`SELECT transfo_id AS id, code_actif AS code FROM transformateur WHERE transfo_id = $1`, [id]);
    return rows[0] ? { type, id: rows[0].id, code: rows[0].code } : null;
  }
  const { rows } = await query(`SELECT ligne_id AS id, code_actif AS code FROM ligne WHERE ligne_id = $1`, [id]);
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

  // Postes amont touchés : le(s) poste(s) parent(s) des transfos concernés
  // (toujours utile, indépendamment de la direction, pour situer l'impact).
  let posteIds = [];
  if (type === 'poste') {
    posteIds = [id];
  } else if (transfoIds.length) {
    const { rows } = await query(
      `SELECT DISTINCT poste_id FROM transformateur
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

  // Points de service + lignes rattachés aux transfos concernés, et charge agrégée.
  const [points, lignes, agg] = await Promise.all([
    query(`SELECT point_id FROM point_service WHERE transfo_id = ANY($1::int[]) ORDER BY point_id`, [transfoIds]),
    query(`SELECT ligne_id FROM ligne WHERE transfo_id = ANY($1::int[]) ORDER BY ligne_id`, [transfoIds]),
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
