import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Info } from 'lucide-react';
import { getPertes } from '../api.js';
import { LOAD, COLOR } from '../theme/tokens.js';
import { EmptyState, Spinner } from '../ui/index.js';
import './analytics.css';

// Pertes non techniques — couche « zones suspectes » + panneau top-suspects.
// ⚠️ HEURISTIQUE (cf. api/src/analytics.js) : on infère un soupçon de pertes en
// comparant la charge déclarée à une charge attendue (densité clients × calibre
// médian). Ce n'est PAS une mesure : c'est une piste d'enquête. L'UI le rappelle.
//
// Couleur = niveau de suspicion (réutilise la palette LOAD des tokens — pas de
// couleur en dur) : high→critique, med→surcharge, low→normal.
const SUSPICION_COLOR = {
  high: LOAD.critique,
  med: LOAD.surcharge,
  low: LOAD.normal,
};
const SUSPICION_LABEL = { high: 'Suspicion élevée', med: 'Suspicion moyenne', low: 'Suspicion faible' };

const SRC = 'an-pertes-src';
const LYR = 'an-pertes-circles';

const fmtMAD = (v) => `${Math.round(Number(v) / 1000).toLocaleString('fr-FR')} k MAD/an`;

function toFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: rows
      .filter((r) => r.lng != null && r.lat != null)
      .map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] },
        properties: { ...r },
      })),
  };
}

// map : instance MapLibre (depuis <Map onMapReady>). active : couche visible ?
export default function LossLayer({ map, active, onSelect }) {
  const [rows, setRows] = useState(null); // null = pas encore chargé
  const [open, setOpen] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Chargement à la première activation (lazy — pas de fetch tant que désactivé).
  useEffect(() => {
    if (!active || rows != null) return;
    let alive = true;
    getPertes()
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [active, rows]);

  // Ajoute / met à jour la source + la couche de cercles gradués sur la carte.
  useEffect(() => {
    if (!map || !rows) return;
    const data = toFeatureCollection(rows);
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data });
      map.addLayer({
        id: LYR, type: 'circle', source: SRC,
        paint: {
          // Rayon gradué par MAD/an estimé (cercles gradués demandés au contrat).
          'circle-radius': [
            'interpolate', ['linear'], ['coalesce', ['get', 'mad_an_estime'], 0],
            0, 6, 2_000_000, 16, 10_000_000, 26,
          ],
          'circle-color': [
            'match', ['get', 'suspicion'],
            'high', SUSPICION_COLOR.high,
            'med', SUSPICION_COLOR.med,
            SUSPICION_COLOR.low,
          ],
          'circle-opacity': 0.45,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': COLOR.bgSurface,
        },
      });
      // Clic sur une zone → inspecter le transfo correspondant.
      map.on('click', LYR, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        onSelectRef.current?.({ type: 'transfo', id: p.transfo_id, code: p.code, lng: p.lng, lat: p.lat });
      });
      map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = ''; });
    } else {
      map.getSource(SRC).setData(data);
    }
  }, [map, rows]);

  // Latest onSelect for the once-bound click handler.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Bascule la visibilité de la couche selon `active`.
  useEffect(() => {
    if (!map || !map.getLayer(LYR)) return;
    map.setLayoutProperty(LYR, 'visibility', active ? 'visible' : 'none');
    if (!active) setOpen(false);
  }, [map, active, rows]);

  if (!active) return null;

  const suspects = (rows || []).filter((r) => r.suspicion !== 'low');
  const totalMad = suspects.reduce((s, r) => s + Number(r.mad_an_estime || 0), 0);
  const loading = rows == null;

  return (
    <div className="an-loss">
      {open && (
        <div className="an-loss__panel">
          <div className="an-loss__head">
            <span className="caps">Pertes — zones suspectes</span>
            <button type="button" className="map-alerts__close" onClick={() => setOpen(false)} aria-label="Fermer">
              <X size={14} />
            </button>
          </div>
          <div className="an-heuristic">
            <Info size={14} />
            <span>Estimation heuristique (sans télémétrie) — piste d'enquête, pas une mesure.</span>
          </div>
          <div style={{ padding: 'var(--sp-2) var(--sp-3)' }} className="an-loss__total">
            ~ <span className="mono">{fmtMAD(totalMad)}</span> à risque sur {suspects.length} zone{suspects.length > 1 ? 's' : ''}
          </div>
          <div className="an-loss__list">
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-4)' }}><Spinner /></div>
            ) : suspects.length === 0 ? (
              <EmptyState message="Aucune zone suspecte" />
            ) : (
              suspects.slice(0, 12).map((r) => (
                <button
                  key={r.transfo_id} type="button" className="an-suspect"
                  onClick={() => onSelect?.({ type: 'transfo', id: r.transfo_id, code: r.code, lng: r.lng, lat: r.lat })}
                >
                  <span className="an-suspect__dot" style={{ background: SUSPICION_COLOR[r.suspicion] }} />
                  <span className="an-suspect__main">
                    <span className="an-suspect__code">{r.code}</span>
                    <span className="an-suspect__meta">
                      {SUSPICION_LABEL[r.suspicion]} · écart {Math.round(r.ecart_pct * 100)}%
                    </span>
                  </span>
                  <span className="an-suspect__mad mono">{fmtMAD(r.mad_an_estime)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`an-loss__btn${open ? ' an-loss__btn--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Search size={15} />
        <span>Pertes suspectes</span>
        {!loading && <span className="mono">{suspects.length}</span>}
      </button>
    </div>
  );
}
