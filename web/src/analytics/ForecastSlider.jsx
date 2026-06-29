import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPrevision } from '../api.js';
import { LOAD, classeColorExpr } from '../theme/tokens.js';
import './analytics.css';

// Prévision de saturation — curseur 0–36 mois recolorant la carte par classe PROJETÉE.
// ⚠️ HEURISTIQUE : projection composée taux(t)=taux₀×(1+g)^(mois/12) (cf. analytics.js).
// Aucune donnée temporelle réelle de consommation : c'est une extrapolation.
//
// On récupère taux₀ + seuils une seule fois (horizon=0) puis on PROJETTE côté client
// à chaque cran du curseur — pas de re-fetch par mois. La carte est recolorée via une
// source GeoJSON dédiée (les tuiles vectorielles ne sont jamais mutées).
const HORIZON_MAX = 36;
const G_DEFAUT = 0.07;
const SRC = 'an-prevision-src';
const LYR = 'an-prevision-circles';

// Projection (miroir pur de projeterTaux/classePourTaux côté API).
function classeProjetee(taux0, g, mois, seuilAlerte, seuilCritique) {
  if (taux0 == null) return 'inconnu';
  const t = taux0 * Math.pow(1 + g, mois / 12);
  if (t >= seuilCritique) return 'critique';
  if (t >= seuilAlerte) return 'surcharge';
  return 'normal';
}

function featureCollection(transfos, g, mois, seuils) {
  return {
    type: 'FeatureCollection',
    features: transfos
      .filter((t) => t.lng != null && t.lat != null)
      .map((t) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(t.lng), Number(t.lat)] },
        properties: {
          transfo_id: t.transfo_id, code: t.code,
          classe: classeProjetee(Number(t.taux0), g, mois, seuils.surcharge, seuils.critique),
        },
      })),
  };
}

// map : instance MapLibre. active : couche visible ?
export default function ForecastSlider({ map, active, onSelect }) {
  const [data, setData] = useState(null); // { transfos, taux_seuils }
  const [mois, setMois] = useState(0);

  // Charge taux₀ + seuils une fois, à la première activation.
  useEffect(() => {
    if (!active || data != null) return;
    let alive = true;
    getPrevision(0, G_DEFAUT)
      .then((r) => { if (alive) setData(r && Array.isArray(r.transfos) ? r : { transfos: [], taux_seuils: { surcharge: 0.8, critique: 1 } }); })
      .catch(() => { if (alive) setData({ transfos: [], taux_seuils: { surcharge: 0.8, critique: 1 } }); });
    return () => { alive = false; };
  }, [active, data]);

  const seuils = data?.taux_seuils || { surcharge: 0.8, critique: 1 };

  // Recompose la collection projetée à chaque changement de mois.
  const collection = useMemo(
    () => (data ? featureCollection(data.transfos, G_DEFAUT, mois, seuils) : null),
    [data, mois, seuils.surcharge, seuils.critique],
  );

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Crée la source/couche une fois ; recolore par classe via classeColorExpr (tokens).
  useEffect(() => {
    if (!map || !collection) return;
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data: collection });
      map.addLayer({
        id: LYR, type: 'circle', source: SRC,
        paint: {
          'circle-color': classeColorExpr,
          'circle-radius': ['match', ['get', 'classe'], 'critique', 9, 'surcharge', 7, 5],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(255,255,255,0.7)',
          'circle-opacity': 0.95,
        },
      });
      map.on('click', LYR, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        onSelectRef.current?.({ type: 'transfo', id: p.transfo_id, code: p.code });
      });
      map.on('mouseenter', LYR, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', LYR, () => { map.getCanvas().style.cursor = ''; });
    } else {
      map.getSource(SRC).setData(collection);
    }
  }, [map, collection]);

  // Visibilité selon `active`.
  useEffect(() => {
    if (!map || !map.getLayer(LYR)) return;
    map.setLayoutProperty(LYR, 'visibility', active ? 'visible' : 'none');
  }, [map, active, collection]);

  if (!active) return null;

  // Comptes projetés au mois courant (pour la lecture « Mois X : N critiques »).
  const counts = (data?.transfos || []).reduce(
    (acc, t) => {
      const cl = classeProjetee(Number(t.taux0), G_DEFAUT, mois, seuils.surcharge, seuils.critique);
      if (cl === 'critique') acc.critique++;
      else if (cl === 'surcharge') acc.surcharge++;
      return acc;
    },
    { critique: 0, surcharge: 0 },
  );

  return (
    <div className="an-forecast">
      <div className="an-heuristic">
        <span>Prévision heuristique · croissance {Math.round(G_DEFAUT * 100)}%/an (sans télémétrie)</span>
      </div>
      <div className="an-forecast__body">
        <div className="an-forecast__readout">
          <span className="an-forecast__mois">
            Mois <span className="mono">{mois}</span> · ≈ <span className="mono">{(mois / 12).toFixed(1)}</span> an
          </span>
          <span className="an-forecast__counts">
            <span className="an-forecast__count" style={{ color: LOAD.critique }}>
              <span className="mono">{counts.critique}</span> critiques
            </span>
            <span className="an-forecast__count" style={{ color: LOAD.surcharge }}>
              <span className="mono">{counts.surcharge}</span> surcharges
            </span>
          </span>
        </div>
        <input
          type="range" min={0} max={HORIZON_MAX} step={1} value={mois}
          onChange={(e) => setMois(Number(e.target.value))}
          className="an-forecast__slider"
          aria-label="Horizon de prévision (mois)"
        />
        <div className="an-forecast__scale">
          <span>Aujourd'hui</span>
          <span>+{HORIZON_MAX} mois</span>
        </div>
      </div>
    </div>
  );
}
