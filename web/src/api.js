const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
export const TILE_BASE = BASE;
export async function getKpi() { return (await fetch(`${BASE}/api/kpi`)).json(); }
export async function getTopSurcharges() { return (await fetch(`${BASE}/api/top-surcharges`)).json(); }
export async function getAsset(type, id) { return (await fetch(`${BASE}/api/asset/${type}/${id}`)).json(); }
export async function getParcelle(id) { return (await fetch(`${BASE}/api/parcelle/${id}`)).json(); }

// Traçabilité (Chantier 1) — impact amont/aval d'un actif (poste|transfo|ligne).
// → { root, affected:{postes,transfos,lignes,points}, summary:{clients,charge_kva,transfos,lignes} }
export async function getTrace(type, id, direction = 'down') {
  const qs = direction === 'up' ? '?direction=up' : '';
  return (await fetch(`${BASE}/api/trace/${type}/${id}${qs}`)).json();
}

// Dashboard endpoints ---------------------------------------------------------
export async function getStats() { return (await fetch(`${BASE}/api/stats`)).json(); }
export async function getHistogramme() { return (await fetch(`${BASE}/api/histogramme`)).json(); }
export async function getAlertes() { return (await fetch(`${BASE}/api/alertes`)).json(); }

// Global search across transfo / poste / ligne → [{type,id,code,label,lng,lat}]
export async function getSearch(q) {
  if (!q || q.trim().length < 2) return [];
  return (await fetch(`${BASE}/api/search?q=${encodeURIComponent(q.trim())}`)).json();
}

// Place-name geocoding via OpenStreetMap Nominatim (external). Biased to Mauritania.
// Returns [{type:'lieu', id, code, label, lng, lat}] — shape-compatible with getSearch.
export async function geocodePlace(q) {
  const query = (q || '').trim();
  if (query.length < 3) return [];
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5'
    + '&countrycodes=mr&accept-language=fr'
    + `&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      type: 'lieu',
      id: r.place_id,
      code: r.name || r.display_name?.split(',')[0],
      label: r.display_name,
      lng: Number(r.lon),
      lat: Number(r.lat),
    }));
  } catch {
    return [];
  }
}

// Analytics (jumeau numérique, chantier 3) — HEURISTIQUE, voir api/src/analytics.js.
// Pertes non techniques inférées → [{transfo_id, code, ecart_pct, suspicion, mad_an_estime, lng, lat}]
export async function getPertes() { return (await fetch(`${BASE}/api/pertes`)).json(); }
// Prévision de saturation → { horizon, g, taux_seuils, transfos:[...], timeline:[{mois,n_critique,n_surcharge}] }
export async function getPrevision(horizon = 0, g = 0.07) {
  const qs = new URLSearchParams({ horizon: String(horizon), g: String(g) });
  return (await fetch(`${BASE}/api/prevision?${qs}`)).json();
}

// --- coupures --- Registre des coupures & cockpit fiabilité (Chantier 5, ADR 0009).
function qsFrom(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') qs.set(k, v);
  return qs.toString() ? `?${qs}` : '';
}
// Journal filtré → [{id_coupure, type, statut, actif_type, code_actif, cause, debut, fin,
//                    clients_affectes, charge_kva, ens_kwh, source, duree_h, ...}]
export async function getCoupures(params = {}) {
  return (await fetch(`${BASE}/api/coupures${qsFrom(params)}`)).json();
}
export async function createCoupure(payload) {
  const res = await fetch(`${BASE}/api/coupures`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function cloturerCoupure(id, fin) {
  const res = await fetch(`${BASE}/api/coupures/${id}/cloturer`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fin ? { fin } : {}),
  });
  return res.json();
}
// Clients affectés d'une coupure → [{numero_compteur, statut, adresse, type_batiment, quartier}]
export async function getCoupureClients(id) {
  return (await fetch(`${BASE}/api/coupures/${id}/clients`)).json();
}
// Indices de fiabilité → { n_clients, incidents:{saidi_h,saifi,caidi_h,ens_kwh,n},
//   programmees:{...}, timeline:[...], classement:[...], source_filtre, n_simule }
export async function getFiabilite(params = {}) {
  return (await fetch(`${BASE}/api/fiabilite${qsFrom(params)}`)).json();
}
// --- /coupures ---

// params: { type, classe, niveau_tension, statut, q, sort, order, limit, offset }
export async function getAssets(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return (await fetch(`${BASE}/api/assets${suffix}`)).json();
}
