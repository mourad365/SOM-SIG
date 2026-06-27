// Cœur pur de simulation « what-if » — ZÉRO I/O, entièrement testable.
//
// Rejoue EXACTEMENT la formule SQL de `v_charge_transformateur`
// (db/migrations/003_views.sql) en JavaScript :
//
//   charge_kva(transfo) = Σ(point_service.puiss_souscrite_kw) × foisonnement / cosPhi
//   taux_charge         = charge_kva / transfo.puissance_kva   (null si kVA null/0)
//   classe = taux ≥ seuilCritique ? 'critique'
//          : taux ≥ seuilAlerte   ? 'surcharge'
//          : 'normal'                         (taux null → 'inconnu')
//
// Constantes issues de la table `parametre` (cf. docs/DIGITAL-TWIN.md). Ne pas diverger.

export const PARAMS = {
  cosPhi: 0.90,
  foisonnement: 0.60,
  seuilAlerte: 0.80,
  seuilCritique: 1.00,
};

// Classe de charge à partir d'un taux. taux null/indéfini → 'inconnu'
// (transfo sans puissance_kva exploitable), exactement comme le CASE SQL.
export function classeFor(taux, params = PARAMS) {
  if (taux == null || !Number.isFinite(taux)) return 'inconnu';
  if (taux >= params.seuilCritique) return 'critique';
  if (taux >= params.seuilAlerte) return 'surcharge';
  return 'normal';
}

// computeCharge(transfos, points, params) → Map<transfoId, {charge_kva, taux, classe}>
//
// - `transfos` : [{ id, puissance_kva }]  (puissance_kva null/0 ⇒ taux null ⇒ 'inconnu')
// - `points`   : [{ transfo_id, puiss_souscrite_kw }]  (points sans transfo rattaché ignorés)
//
// Chaque transfo reçoit une entrée même sans point rattaché (Σ = 0), comme le
// LEFT JOIN + COALESCE(...,0) du SQL.
export function computeCharge(transfos, points, params = PARAMS) {
  const result = new Map();

  // Σ kW souscrits par transfo.
  const kwById = new Map();
  for (const p of points || []) {
    if (p == null) continue;
    const tid = p.transfo_id;
    if (tid == null) continue; // point non rattaché → hors réseau, ignoré
    const kw = Number(p.puiss_souscrite_kw) || 0;
    kwById.set(tid, (kwById.get(tid) || 0) + kw);
  }

  for (const t of transfos || []) {
    if (t == null || t.id == null) continue;
    const kw = kwById.get(t.id) || 0;
    const charge_kva = (kw * params.foisonnement) / params.cosPhi;
    const kva = Number(t.puissance_kva);
    const taux = t.puissance_kva == null || !Number.isFinite(kva) || kva === 0
      ? null
      : charge_kva / kva;
    result.set(t.id, { charge_kva, taux, classe: classeFor(taux, params) });
  }

  return result;
}
