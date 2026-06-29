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

const ARC_FRACTION = 0.75; // 270° gauge
const VMAX = 1.2;          // visual cap (120%)
// Where the surcharge / critique thresholds sit along the visible track.
const THRESHOLDS = [
  { at: 0.8 / VMAX, color: LOAD.surcharge },
  { at: 1.0 / VMAX, color: LOAD.critique },
];

export function Gauge({ value, size = 132, stroke = 12, label = 'Taux de charge' }) {
  const v = value == null || Number.isNaN(value) ? null : value;
  const classe = classeFor(v);
  const color = LOAD[classe];
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const trackLen = circumference * ARC_FRACTION;
  const pct = v == null ? 0 : Math.min(v, VMAX) / VMAX; // cap visual at 120%
  const target = trackLen * pct; // filled length at target value
  const rotation = 135; // start angle so the gap sits at the bottom
  const pctLabel = v == null ? '—' : `${Math.round(v * 100)}%`;
  const critical = classe === 'critique';

  // Threshold tick endpoints (inside the rotated group: angle measured from the
  // 3-o'clock start, sweeping clockwise over the 270° track).
  const tick = (frac) => {
    const a = frac * ARC_FRACTION * 2 * Math.PI;
    const h = stroke / 2 + 2.5;
    return {
      x1: cx + (r - h) * Math.cos(a), y1: cx + (r - h) * Math.sin(a),
      x2: cx + (r + h) * Math.cos(a), y2: cx + (r + h) * Math.sin(a),
    };
  };

  const ref = useRef(null);
  const arcRef = useRef(null);
  const numRef = useRef(null);

  // Sweep the arc (stroke-dashoffset) from empty -> target and count-up the
  // center %, replaying whenever `value` changes. Reduced-motion -> final state.
  useGSAP(() => {
    const arc = arcRef.current;
    const num = numRef.current;
    if (!arc) return;

    const filledOffset = trackLen - target;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || v == null) {
      gsap.set(arc, { strokeDashoffset: filledOffset });
      if (num) num.textContent = pctLabel;
      return;
    }

    gsap.set(arc, { strokeDashoffset: trackLen }); // start empty
    gsap.to(arc, { strokeDashoffset: filledOffset, duration: 0.9, ease: 'expo.out' });

    if (num) {
      const counter = { p: 0 };
      gsap.to(counter, {
        p: v,
        duration: 0.9,
        ease: 'expo.out',
        onUpdate: () => { num.textContent = `${Math.round(counter.p * 100)}%`; },
      });
    }
  }, { scope: ref, dependencies: [v, trackLen, target] });

  return (
    <div className={`ui-gauge${critical ? ' ui-gauge--critique' : ''}`} style={{ width: size, height: size }}
         ref={ref} role="img" aria-label={`${label}: ${pctLabel}`}>
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
            className="ui-gauge__arc"
            cx={cx} cy={cx} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${trackLen} ${circumference}`}
            strokeDashoffset={trackLen}
          />
          {/* Threshold notches: where surcharge / critique begin on the track. */}
          {v != null && THRESHOLDS.map((t, i) => {
            const p = tick(t.at);
            return (
              <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
                stroke={t.color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
            );
          })}
        </g>
      </svg>
      <div className="ui-gauge__center">
        <span ref={numRef} className="ui-gauge__pct" style={{ color, fontSize: size * 0.2 }}>{pctLabel}</span>
        <span className="ui-gauge__cap caps">{classe === 'inconnu' ? 'Inconnu' : classe}</span>
      </div>
    </div>
  );
}
