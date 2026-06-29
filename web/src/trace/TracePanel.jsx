import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import { Panel, Stat, CountUpValue, Badge, Spinner, Button, EmptyState } from '../ui/index.js';
import { BRAND } from '../theme/tokens.js';

const frInt = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

// Panneau de traçabilité : compteur animé « N clients affectés » + actifs aval.
// Réutilise les primitives UI et le count-up GSAP (CountUpValue) comme KpiStrip.
export function TracePanel({ trace, loading = false, error = false, onClear }) {
  const ref = useRef(null);

  // Stagger d'apparition des tuiles à chaque nouvelle trace (effet « illumination »).
  useGSAP(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tiles = ref.current?.querySelectorAll('.trace-tile');
    if (!tiles?.length) return;
    if (reduce) { gsap.set(tiles, { opacity: 1, y: 0 }); return; }
    gsap.from(tiles, { y: 10, opacity: 0, duration: 0.4, ease: 'power2.out', stagger: 0.06 });
  }, { scope: ref, dependencies: [trace?.root?.id, trace?.root?.type] });

  if (!trace && !loading && !error) return null;

  const s = trace?.summary || {};
  const code = trace?.root?.code || '—';

  const close = (
    <Button variant="subtle" size="sm" onClick={onClear} aria-label="Fermer la trace">
      <X size={14} /> Effacer
    </Button>
  );

  return (
    <Panel title="Impact tracé" caps actions={onClear ? close : undefined} className="trace-panel">
      {error ? (
        <EmptyState message="Traçage indisponible pour cet actif" />
      ) : loading && !trace ? (
        <div className="trace-loading"><Spinner size={16} /> Calcul de l'impact…</div>
      ) : (
        <div ref={ref} className="trace-body">
          <div className="trace-tile trace-head">
            <span className="trace-root-code">{code}</span>
            {loading && <Spinner size={12} />}
          </div>

          <div className="trace-tile trace-hero">
            <Stat
              hero
              label="Clients affectés"
              value={<CountUpValue value={Number(s.clients ?? 0)} format={frInt} />}
              valueColor={BRAND.blue}
            />
          </div>

          <div className="trace-grid">
            <Stat
              className="trace-tile"
              label="Charge"
              value={<CountUpValue value={Number(s.charge_kva ?? 0)} format={frInt} />}
              unit="kVA"
            />
            <Stat
              className="trace-tile"
              label="Transfos"
              value={<CountUpValue value={Number(s.transfos ?? 0)} />}
            />
            <Stat
              className="trace-tile"
              label="Lignes"
              value={<CountUpValue value={Number(s.lignes ?? 0)} />}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
