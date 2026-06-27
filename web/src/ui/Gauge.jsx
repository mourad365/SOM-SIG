import React from 'react';
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
  const dash = trackLen * pct;
  const rotation = 135; // start angle so the gap sits at the bottom
  const pctLabel = v == null ? '—' : `${Math.round(v * 100)}%`;

  return (
    <div className="ui-gauge" style={{ width: size, height: size }}
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
            cx={cx} cy={cx} r={r} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: 'stroke-dasharray var(--dur-slow) var(--ease-out)' }}
          />
        </g>
      </svg>
      <div className="ui-gauge__center">
        <span className="ui-gauge__pct" style={{ color, fontSize: size * 0.2 }}>{pctLabel}</span>
        <span className="ui-gauge__cap caps">{classe === 'inconnu' ? 'Inconnu' : classe}</span>
      </div>
    </div>
  );
}
