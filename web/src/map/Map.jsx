import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TILE_BASE } from '../api.js';
import { transfoCirclePaint, ligneLinePaint, OVERLOADED_FILTER } from './style.js';

const NOUAKCHOTT = { center: [-15.97, 18.09], zoom: 12 };

export default function Map({ flyTo }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [onlyOverloaded, setOnlyOverloaded] = useState(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://demotiles.maplibre.org/style.json', // free base; swap for SOMELEC base later
      center: NOUAKCHOTT.center, zoom: NOUAKCHOTT.zoom,
    });
    mapRef.current = map;
    map.on('load', () => {
      map.addSource('transfo', { type: 'vector', tiles: [`${TILE_BASE}/tiles/transfo/{z}/{x}/{y}.pbf`], minzoom: 6, maxzoom: 20 });
      map.addSource('ligne',   { type: 'vector', tiles: [`${TILE_BASE}/tiles/ligne/{z}/{x}/{y}.pbf`],   minzoom: 6, maxzoom: 20 });
      map.addLayer({ id: 'ligne', type: 'line', source: 'ligne', 'source-layer': 'ligne', paint: ligneLinePaint });
      map.addLayer({ id: 'transfo', type: 'circle', source: 'transfo', 'source-layer': 'transfo', paint: transfoCirclePaint });

      map.on('click', 'transfo', (e) => {
        const p = e.features[0].properties;
        const taux = p.taux_charge == null ? '—' : `${Math.round(p.taux_charge * 100)}%`;
        new maplibregl.Popup().setLngLat(e.lngLat)
          .setHTML(`<b>${p.code_actif}</b><br/>Classe : ${p.classe}<br/>Charge : ${taux}`).addTo(map);
      });
      map.on('mouseenter', 'transfo', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'transfo', () => map.getCanvas().style.cursor = '');
    });
    return () => map.remove();
  }, []);

  // Apply / clear the overloaded-only filter on both layers.
  useEffect(() => {
    const map = mapRef.current; if (!map || !map.getLayer('transfo')) return;
    const f = onlyOverloaded ? OVERLOADED_FILTER : null;
    map.setFilter('transfo', f);
    map.setFilter('ligne', f);
  }, [onlyOverloaded]);

  // Imperative fly-to from the dashboard top-10.
  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: flyTo, zoom: 15 });
  }, [flyTo]);

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 10, left: 10, background: '#fff', padding: 10, borderRadius: 8, font: '13px Arial' }}>
        <label><input type="checkbox" checked={onlyOverloaded} onChange={e => setOnlyOverloaded(e.target.checked)} /> Surcharge uniquement</label>
        <div style={{ marginTop: 8 }}>
          <Legend color="#1a9641" label="Normal" />
          <Legend color="#fdae61" label="Surcharge (≥80%)" />
          <Legend color="#d7191c" label="Critique (≥100%)" />
          <Legend color="#9e9e9e" label="Inconnu" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 12, height: 12, background: color, display: 'inline-block', borderRadius: 3 }} />{label}
  </div>;
}
