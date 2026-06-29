import React, { useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import AlertsPanel from '../dashboard/AlertsPanel.jsx';
import './map.css';

// Floating alerts control for the Carte view — keeps the map clean while still
// letting operators see hotspots and jump to them. Collapsed by default.
export default function MapAlerts({ alertes = [], onSelect }) {
  const [open, setOpen] = useState(false);
  const n = alertes.length;
  const critique = alertes.filter((a) => a.classe === 'critique').length;

  return (
    <div className={`map-alerts${open ? ' map-alerts--open' : ''}`}>
      <button
        type="button"
        className={`map-alerts__btn${critique > 0 ? ' map-alerts__btn--critique' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <TriangleAlert size={15} />
        <span className="mono">{n}</span>
        <span>alertes</span>
      </button>

      {open && (
        <div className="map-alerts__panel">
          <div className="map-alerts__head">
            <span className="caps">Alertes réseau</span>
            <button type="button" className="map-alerts__close" onClick={() => setOpen(false)} aria-label="Fermer">
              <X size={14} />
            </button>
          </div>
          <div className="map-alerts__list">
            <AlertsPanel alertes={alertes} onSelect={(r) => { onSelect?.(r); setOpen(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}
