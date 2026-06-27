import React from 'react';
import { Legend } from '../ui/index.js';
import { VOLTAGE } from '../theme/tokens.js';

const VOLTAGE_ROWS = [
  { color: VOLTAGE.HTA33, label: 'HTA 33 kV' },
  { color: VOLTAGE.HTA15, label: 'HTA 15 kV' },
  { color: VOLTAGE.BT, label: 'BT' },
];

// Floating map legend (bottom-left). Swaps content per color-by mode.
export function MapLegend({ colorBy = 'charge' }) {
  const title = colorBy === 'tension' ? 'Niveau de tension' : 'Taux de charge';
  return (
    <div className="map-legend">
      <div className="map-legend__title caps">{title}</div>
      {colorBy === 'tension'
        ? <Legend items={VOLTAGE_ROWS} />
        : <Legend />}
    </div>
  );
}
