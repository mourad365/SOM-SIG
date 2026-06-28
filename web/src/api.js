const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
export const TILE_BASE = BASE;
export async function getKpi() { return (await fetch(`${BASE}/api/kpi`)).json(); }
export async function getTopSurcharges() { return (await fetch(`${BASE}/api/top-surcharges`)).json(); }
export async function getAsset(type, id) { return (await fetch(`${BASE}/api/asset/${type}/${id}`)).json(); }

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

// params: { type, classe, niveau_tension, statut, q, sort, order, limit, offset }
export async function getAssets(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return (await fetch(`${BASE}/api/assets${suffix}`)).json();
}
