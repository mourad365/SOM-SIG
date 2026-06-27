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

// params: { type, classe, niveau_tension, statut, q, sort, order, limit, offset }
export async function getAssets(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return (await fetch(`${BASE}/api/assets${suffix}`)).json();
}
