import React, { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Crosshair, Share2 } from 'lucide-react';
import { Drawer, Gauge, Stat, Badge, Button, Spinner, EmptyState } from '../ui/index.js';
import { getAsset } from '../api.js';
import { TRACEABLE } from '../trace/useTrace.js';
import './shell.css';

function num(v) { return v == null ? '—' : Number(v); }
function fmt(v, digits = 0) {
  if (v == null) return '—';
  return Number(v).toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

const TYPE_LABEL = {
  transfo: 'Transformateur', ligne: 'Ligne', poste: 'Poste',
  point_service: 'Point de service', support: 'Support',
};
const LOAD_TYPES = ['transfo', 'ligne'];

// Right slide-in inspector. Opens when a map feature / dashboard row is selected; loads full asset detail.
export function Inspector({ feature, open, onClose, onFlyTo, onTrace }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const type = feature?.type || 'transfo';
  const isLoad = LOAD_TYPES.includes(type);

  useEffect(() => {
    if (!feature) return;
    const id = feature[`${type}_id`] ?? feature.transfo_id ?? feature.ligne_id ?? feature.id;
    setDetail(feature); // seed from tile/row props immediately
    if (id == null || !isLoad) return; // only transfo/ligne have an asset-detail endpoint
    setLoading(true);
    getAsset(type, id)
      .then((d) => { if (d && !d.error) setDetail((prev) => ({ ...prev, ...d })); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  const d = detail || {};
  const taux = d.taux_charge == null ? null : Number(d.taux_charge);
  const code = d.code_actif || d.code_poste || d.code || d.num_compteur || '—';

  const contentRef = useRef(null);

  // Fade/slide the inspector content children in when it opens for a feature.
  // Reduced-motion -> visible immediately. CSS still handles the drawer slide.
  useGSAP(() => {
    if (!open || !feature) return;
    const kids = contentRef.current?.children;
    if (!kids?.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { gsap.set(kids, { opacity: 1, y: 0 }); return; }
    gsap.from(kids, { y: 12, opacity: 0, duration: 0.4, ease: 'power2.out', stagger: 0.06 });
  }, { scope: contentRef, dependencies: [open, feature, type] });

  return (
    <Drawer open={open} onClose={onClose} title="Inspecteur d'actif">
      {!feature ? (
        <EmptyState message="Sélectionnez un actif sur la carte" />
      ) : (
        <div ref={contentRef}>
          <div className="inspector-head">
            <span className="inspector-code">{code}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span className="caps">{TYPE_LABEL[type] || type}</span>
              {d.classe && <Badge classe={d.classe} />}
              {loading && <Spinner size={12} />}
            </div>
          </div>

          {isLoad && (
            <div className="inspector-gauge">
              <Gauge value={taux} />
            </div>
          )}

          <div className="inspector-grid">
            {type === 'transfo' && (
              <>
                <Stat label="Capacité" value={fmt(d.puissance_kva)} unit="kVA" />
                <Stat label="Charge" value={fmt(d.charge_kva, 1)} unit="kVA" />
                <Stat label="Taux de charge" value={taux == null ? '—' : `${Math.round(taux * 100)}%`} />
                <Stat label="Points de service" value={num(d.n_points ?? d.points_count)} />
                {d.poste_nom && <Stat label="Poste" value={d.poste_nom} />}
              </>
            )}
            {type === 'ligne' && (
              <>
                <Stat label="Niveau tension" value={d.niveau_tension || '—'} />
                <Stat label="Section" value={fmt(d.section_mm2)} unit="mm²" />
                <Stat label="Capacité" value={fmt(d.capacite_a)} unit="A" />
                <Stat label="Longueur" value={fmt(d.longueur_m)} unit="m" />
                <Stat label="Taux de charge" value={taux == null ? '—' : `${Math.round(taux * 100)}%`} />
              </>
            )}
            {!isLoad && (
              <>
                <Stat label="Type" value={d.type_poste || d.type_support || d.type_compteur || '—'} />
                <Stat label="Statut" value={d.statut || d.etat || '—'} />
                {d.nom && <Stat label="Nom" value={d.nom} />}
              </>
            )}
          </div>

          <div className="inspector-actions">
            <Button
              variant="subtle" size="sm"
              onClick={() => d.lng != null && d.lat != null && onFlyTo?.([d.lng, d.lat])}
              disabled={d.lng == null || d.lat == null}
            >
              <Crosshair size={14} /> Centrer
            </Button>
            {/* --- trace --- bouton « Tracer l'impact » (Chantier 1) */}
            {onTrace && TRACEABLE.includes(type) && (
              <Button
                variant="primary" size="sm"
                onClick={() => {
                  const id = feature[`${type}_id`] ?? feature.id;
                  if (id != null) onTrace(type, Number(id));
                }}
              >
                <Share2 size={14} /> Tracer l'impact
              </Button>
            )}
            {/* --- end trace --- */}
          </div>
        </div>
      )}
    </Drawer>
  );
}
