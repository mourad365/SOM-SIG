import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Stat, CountUpValue } from '../ui/index.js';
import { LOAD } from '../theme/tokens.js';

const frInt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

// stats: /api/stats payload. Renders 6 KPI tiles. Numeric values count-up on
// change via CountUpValue; the tile row staggers in on mount.
export default function KpiStrip({ stats, loading = false }) {
  const ref = useRef(null);

  useGSAP(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tiles = ref.current?.querySelectorAll('.kpi-value');
    if (!tiles?.length) return;
    if (reduce) { gsap.set(tiles, { opacity: 1, y: 0 }); return; }
    gsap.from(tiles, { y: 12, opacity: 0, duration: 0.4, ease: 'power2.out', stagger: 0.06 });
  }, { scope: ref });

  const c = stats?.counts_by_type || {};
  const t = stats?.transfo_by_classe || {};
  const l = stats?.ligne_by_classe || {};
  const totalActifs = Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0);
  const critique = (Number(t.critique) || 0) + (Number(l.critique) || 0);
  const surcharge = (Number(t.surcharge) || 0) + (Number(l.surcharge) || 0);
  const health = stats?.network_health_pct;
  const charge = stats?.charge_totale_kva;
  const postes = Number(c.poste) || 0;

  // numeric value -> count-up; null -> "—". `loading` forces the placeholder.
  const countVal = (n, fmt) => (loading || n == null ? '—' : <CountUpValue value={Number(n)} format={fmt} />);

  const tile = (label, value, opts = {}) => (
    <Stat
      className="kpi-value"
      label={label}
      value={value}
      unit={opts.unit}
      valueColor={opts.color}
      hero={opts.hero}
    />
  );

  return (
    <section className="dash-kpis" ref={ref}>
      {tile('Total actifs', countVal(totalActifs, frInt), { hero: true })}
      {tile('Critique', countVal(critique), { color: LOAD.critique })}
      {tile('Surcharge', countVal(surcharge), { color: LOAD.surcharge })}
      {tile('Réseau sain', countVal(health), { unit: '%', color: LOAD.normal })}
      {tile('Charge totale', countVal(charge, frInt), { unit: 'kVA' })}
      {tile('Postes', countVal(postes))}
    </section>
  );
}
