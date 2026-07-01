// Cœur pur de fiabilité — ZÉRO I/O, entièrement testable (façon sim/load.js).
// Rejoue la même formule que l'agrégat SQL de /api/fiabilite (api/src/coupures.js) :
//
//   SAIFI = Σ clients_affectes / N                       (interruptions par client)
//   SAIDI = Σ (clients_affectes × durée_h) / N           (heures par client)
//   CAIDI = SAIDI / SAIFI                                 (durée moyenne de rétablissement)
//   ENS   = Σ (charge_kva × cos_phi × durée_h)            (énergie non distribuée, kWh)
//
// N = clients servis (count compteur). cos_phi vient de la table `parametre` ; on garde ici
// le défaut partagé du contrat (0,90). Convention métier : SAIDI/SAIFI/CAIDI se calculent
// sur les INCIDENTS ; les coupures programmées sont rapportées à part (cf. indicesParType).

export const COS_PHI = 0.9;

// Durée en heures : coupure résolue ⇒ fin − debut ; active (fin absente) ⇒ now − debut.
export function dureeHeures(debut, fin, now = Date.now()) {
  const d = new Date(debut).getTime();
  const f = fin ? new Date(fin).getTime() : now;
  if (!Number.isFinite(d) || !Number.isFinite(f)) return 0;
  return Math.max(0, (f - d) / 3_600_000);
}

// Énergie non distribuée d'une coupure (kWh).
export function ensKwh(chargeKva, dureeH, cosPhi = COS_PHI) {
  return (Number(chargeKva) || 0) * cosPhi * (Number(dureeH) || 0);
}

// Indices agrégés sur une liste HOMOGÈNE de coupures, pour un parc de N clients.
// Le caller filtre par type au besoin (cf. indicesParType). Chaque élément :
//   { clients_affectes, charge_kva, debut, fin }
// N ≤ 0 ⇒ SAIDI/SAIFI = null (affichés « — »).
export function indices(coupures, nClients, { cosPhi = COS_PHI, now = Date.now() } = {}) {
  let sumClients = 0;
  let sumClientH = 0;
  let sumEns = 0;
  let n = 0;
  for (const c of coupures || []) {
    if (c == null) continue;
    const dureeH = dureeHeures(c.debut, c.fin, now);
    const clients = Number(c.clients_affectes) || 0;
    n += 1;
    sumClients += clients;
    sumClientH += clients * dureeH;
    sumEns += ensKwh(c.charge_kva, dureeH, cosPhi);
  }
  const saifi = nClients > 0 ? sumClients / nClients : null;
  const saidi = nClients > 0 ? sumClientH / nClients : null;
  const caidi = saifi && saifi > 0 ? saidi / saifi : 0;
  return { saifi, saidi_h: saidi, caidi_h: caidi, ens_kwh: sumEns, n };
}

// Sépare incidents / programmées puis calcule chaque bloc (même découpage que l'API).
export function indicesParType(coupures, nClients, opts) {
  const incidents = [];
  const programmees = [];
  for (const c of coupures || []) {
    if (c == null) continue;
    (c.type === 'incident' ? incidents : programmees).push(c);
  }
  return {
    incidents: indices(incidents, nClients, opts),
    programmees: indices(programmees, nClients, opts),
  };
}
