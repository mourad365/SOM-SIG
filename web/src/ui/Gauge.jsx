import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { LOAD } from '../theme/tokens.js';
import './ui.css';

// Radial load gauge. value is a ratio (0..>1). Colored by load-class thresholds.
// Thresholds match v_charge_transformateur: <0.8 normal, <1.0 surcharge, >=1.0 critique.
function classeFor(value) {
  if (value == null || Number.isNaN(value)) return 'inconnu';
  if (value >= 1.0) return 'critique';
  if (value >= 0.8) return 'surcharge';
  return 'normal';
}

export function Gauge({ value, size = 132, stroke = 12, label = 'Taux de charge' }) {
  const v = value == null || Number.isNaN(value) ? null : value;
  const classe = classeFor(v);
  const color = LOAD[classe];
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  // 270deg arc (gauge), starting bottom-left. Fraction of the 270deg track that's filled.
  const arcFraction = 0.75;
  const trackLen = circumference * arcFraction;
  const pct = v == null ? 0 : Math.min(v, 1.2) / 1.2; // cap visual at 120%
  const target = trackLen * pct; // filled length at target value
  const rotation = 135; // start angle so the gap sits at the bottom
  const pctLabel = v == null ? '—' : `${Math.round(v * 100)}%`;

  const ref = useRef(null);
  const arcRef = useRef(null);
  const numRef = useRef(null);

  // Sweep the arc (stroke-dashoffset) from empty -> target and count-up the
  // center %, replaying whenever `value` changes. Reduced-motion -> final state.
  useGSAP(() => {
    const arc = arcRef.current;
    const num = numRef.current;
    if (!arc) return;

    // Progress arc: fixed dasharray of [trackLen, rest]; offset hides it.
    // offset = trackLen -> empty; offset = trackLen - target -> filled to target.
    const filledOffset = trackLen - target;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || v == null) {
      gsap.set(arc, { strokeDashoffset: filledOffset });
      if (num) num.textContent = pctLabel;
      return;
    }

    gsap.set(arc, { strokeDashoffset: trackLen }); // start empty
    gsap.to(arc, { strokeDashoffset: filledOffset, duration: 0.7, ease: 'power2.out' });

    if (num) {
      const counter = { p: 0 };
      gsap.to(counter, {
        p: v,
        duration: 0.7,
        ease: 'power2.out',
        onUpdate: () => { num.textContent = `${Math.round(counter.p * 100)}%`; },
      });
    }
  }, { scope: ref, dependencies: [v, trackLen, target] });

  return (
    <div className="ui-gauge" style={{ width: size, height: size }} ref={ref}
         role="img" aria-label={`${label}: ${pctLabel}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(${rotation} ${cx} ${cx})`}>
          <circle
            cx={cx} cy={cx} r={r} fill="none"
            stroke="var(--bg-surface-3)" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${trackLen} ${circumference}`}
          />
          <circle
            ref={arcRef}
            cx={cx} cy={cx} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${trackLen} ${circumference}`}
            strokeDashoffset={trackLen}
          />
        </g>
      </svg>
      <div className="ui-gauge__center">
        <span ref={numRef} className="ui-gauge__pct" style={{ color, fontSize: size * 0.2 }}>{pctLabel}</span>
        <span className="ui-gauge__cap caps">{classe === 'inconnu' ? 'Inconnu' : classe}</span>
      </div>
    </div>
  );
}
