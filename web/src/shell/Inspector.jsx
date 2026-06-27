import React, { useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { Drawer, Gauge, Stat, Badge, Button, Spinner, EmptyState } from '../ui/index.js';
import { getAsset } from '../api.js';
import './shell.css';

function num(v) { return v == null ? '—' : Number(v); }
function fmt(v, digits = 0) {
  if (v == null) return '—';
  return Number(v).toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

// Right slide-in inspector. Opens when a map feature is selected; loads full asset detail.
export function Inspector({ feature, open, onClose, onFlyTo }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!feature) return;
    const id = feature.transfo_id ?? feature.id;
    // Seed from tile props immediately, then refine with the API call.
    setDetail(feature);
    if (id == null) return;
    setLoading(true);
    getAsset('transfo', id)
      .then((d) => { if (d && !d.error) setDetail((prev) => ({ ...prev, ...d })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [feature]);

  const d = detail || {};
  const taux = d.taux_charge == null ? null : Number(d.taux_charge);

  return (
    <Drawer open={open} onClose={onClose} title="Inspecteur d'actif">
      {!feature ? (
        <EmptyState message="Sélectionnez un actif sur la carte" />
      ) : (
        <>
          <div className="inspector-head">
            <span className="inspector-code">{d.code_actif || '—'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span className="caps">Transformateur</span>
              {d.classe && <Badge classe={d.classe} />}
              {loading && <Spinner size={12} />}
            </div>
          </div>

          <div className="inspector-gauge">
            <Gauge value={taux} />
          </div>

          <div className="inspector-grid">
            <Stat label="Capacité" value={fmt(d.puissance_kva)} unit="kVA" />
            <Stat label="Charge" value={fmt(d.charge_kva, 1)} unit="kVA" />
            <Stat
              label="Taux de charge"
              value={taux == null ? '—' : `${Math.round(taux * 100)}%`}
            />
            <Stat label="Identifiant" value={num(d.transfo_id)} />
          </div>

          <div className="inspector-actions">
            <Button
              variant="subtle" size="sm"
              onClick={() => d.lng != null && d.lat != null && onFlyTo?.([d.lng, d.lat])}
              disabled={d.lng == null || d.lat == null}
            >
              <Crosshair size={14} /> Centrer
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
}
