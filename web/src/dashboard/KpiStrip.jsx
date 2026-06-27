import React from 'react';
import { Stat } from '../ui/index.js';
import { LOAD } from '../theme/tokens.js';

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n));

// stats: /api/stats payload. Renders 6 KPI tiles. Values carry .kpi-value for gsap.
export default function KpiStrip({ stats, loading = false }) {
  const c = stats?.counts_by_type || {};
  const t = stats?.transfo_by_classe || {};
  const l = stats?.ligne_by_classe || {};
  const totalActifs = Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0);
  const critique = (Number(t.critique) || 0) + (Number(l.critique) || 0);
  const surcharge = (Number(t.surcharge) || 0) + (Number(l.surcharge) || 0);
  const health = stats?.network_health_pct;
  const charge = stats?.charge_totale_kva;

  // className `kpi-value` on each tile lets a later gsap phase target the values.
  const tile = (label, value, opts = {}) => (
    <Stat
      className="kpi-value"
      label={label}
      value={loading ? '—' : value}
      unit={opts.unit}
      valueColor={opts.color}
      hero={opts.hero}
    />
  );

  return (
    <section className="dash-kpis">
      {tile('Total actifs', fmt(totalActifs), { hero: true })}
      {tile('Critique', loading ? '—' : critique, { color: LOAD.critique })}
      {tile('Surcharge', loading ? '—' : surcharge, { color: LOAD.surcharge })}
      {tile('Réseau sain', loading || health == null ? '—' : `${health}`, { unit: '%', color: LOAD.normal })}
      {tile('Charge totale', charge == null ? '—' : fmt(Math.round(charge)), { unit: 'kVA' })}
      {tile('Postes', loading ? '—' : (Number(c.poste) || 0))}
    </section>
  );
}
