import React from 'react';
import { Legend } from '../ui/index.js';
import { VOLTAGE, COLOR } from '../theme/tokens.js';

const VOLTAGE_ROWS = [
  { color: VOLTAGE.HTA33, label: 'HTA 33 kV' },
  { color: VOLTAGE.HTA15, label: 'HTA 15 kV' },
  { color: VOLTAGE.BT, label: 'BT' },
];

// Floating map legend (bottom-left). Swaps content per color-by mode.
export function MapLegend({ colorBy = 'charge', showRecent = false }) {
  const title = colorBy === 'tension' ? 'Niveau de tension' : 'Taux de charge';
  return (
    <div className="map-legend">
      <div className="map-legend__title caps">{title}</div>
      {colorBy === 'tension'
        ? <Legend items={VOLTAGE_ROWS} />
        : <Legend />}

      <div className="map-legend__types caps">Types</div>
      <div className="ui-legend">
        <div className="ui-legend__row"><span className="map-legend__sym map-legend__sym--transfo" /> Transformateur</div>
        <div className="ui-legend__row"><span className="map-legend__sym map-legend__sym--poste" /> Poste</div>
        <div className="ui-legend__row"><span className="map-legend__sym map-legend__sym--support" /> Support</div>
        <div className="ui-legend__row"><span className="map-legend__sym map-legend__sym--point" /> Point de service</div>
      </div>

      {showRecent && (
        <div className="ui-legend__row map-legend__recent">
          <span className="map-legend__sym map-legend__sym--recent" style={{ borderColor: COLOR.energy }} />
          Récent (≤ 90 j)
        </div>
      )}
    </div>
  );
}
