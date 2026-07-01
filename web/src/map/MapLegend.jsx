import React from 'react';
import { Legend } from '../ui/index.js';
import { VOLTAGE, COLOR } from '../theme/tokens.js';
import { POTEAU_FONCTION } from './style.js';

const VOLTAGE_ROWS = [
  { color: VOLTAGE.HTA33, label: 'HTA 33 kV' },
  { color: VOLTAGE.HTA15, label: 'HTA 15 kV' },
  { color: VOLTAGE.BT, label: 'BT' },
];

const POTEAU_ROWS = [
  { color: POTEAU_FONCTION.support, label: 'Support BT' },
  { color: POTEAU_FONCTION.eclairage_public, label: 'Éclairage public' },
  { color: POTEAU_FONCTION.eclairage_solaire, label: 'Éclairage solaire' },
  { color: POTEAU_FONCTION.mixte, label: 'Mixte (BT + éclairage)' },
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
        <div className="ui-legend__row"><span className="map-legend__sym map-legend__sym--poste" /> Poste source</div>
        <div className="ui-legend__row"><span className="map-legend__sym map-legend__sym--point" /> Compteur</div>
      </div>

      <div className="map-legend__types caps">Poteaux — fonction</div>
      <div className="ui-legend">
        {POTEAU_ROWS.map((r) => (
          <div className="ui-legend__row" key={r.label}>
            <span className="map-legend__sym map-legend__sym--poteau-fn" style={{ color: r.color }} />
            {r.label}
          </div>
        ))}
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
