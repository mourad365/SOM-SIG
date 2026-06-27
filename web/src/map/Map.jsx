import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';
import { TILE_BASE } from '../api.js';
import {
  transfoCirclePaint, ligneLinePaint, voltageColorExpr,
  surchargeHeatmapPaint, OVERLOADED_FILTER,
} from './style.js';
import { classeColorExpr } from '../theme/tokens.js';

const NOUAKCHOTT = { center: [-15.97, 18.09], zoom: 12 };
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const DEFAULT_LAYERS = { poste: false, transfo: true, ligne: true, point_service: false, support: false };

// Map: dark ops-console basemap + load layers. Props are wired even where tiles aren't ready yet.
export default function Map({
  layers = DEFAULT_LAYERS,
  colorBy = 'charge',
  heatmap = false,
  onlyOverloaded = false,
  flyTo,
  onSelectFeature,
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current,
      style: DARK_STYLE,
      center: NOUAKCHOTT.center,
      zoom: NOUAKCHOTT.zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      try {
        map.addSource('transfo', { type: 'vector', tiles: [`${TILE_BASE}/tiles/transfo/{z}/{x}/{y}.pbf`], minzoom: 6, maxzoom: 20 });
        map.addSource('ligne', { type: 'vector', tiles: [`${TILE_BASE}/tiles/ligne/{z}/{x}/{y}.pbf`], minzoom: 6, maxzoom: 20 });

        map.addLayer({ id: 'ligne', type: 'line', source: 'ligne', 'source-layer': 'ligne', paint: ligneLinePaint });
        map.addLayer({
          id: 'transfo-heat', type: 'heatmap', source: 'transfo', 'source-layer': 'transfo',
          paint: surchargeHeatmapPaint, layout: { visibility: 'none' },
        });
        map.addLayer({ id: 'transfo', type: 'circle', source: 'transfo', 'source-layer': 'transfo', paint: transfoCirclePaint });

        map.on('click', 'transfo', (e) => {
          const f = e.features[0];
          onSelectFeature?.({ ...f.properties, lng: e.lngLat.lng, lat: e.lngLat.lat });
        });
        map.on('mouseenter', 'transfo', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'transfo', () => { map.getCanvas().style.cursor = ''; });
      } catch (err) {
        // Tiles for some layers may not be available yet — don't crash the shell.
        console.warn('Map layer init partial:', err);
      }
      loadedRef.current = true;
      applyState();
    });

    return () => { loadedRef.current = false; map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply layer visibility, color-by, heatmap, filter. Re-run on any prop change.
  function applyState() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const setVis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    setVis('transfo', layers.transfo);
    setVis('ligne', layers.ligne);

    // color-by mode
    const expr = colorBy === 'tension' ? voltageColorExpr : classeColorExpr;
    if (map.getLayer('transfo')) map.setPaintProperty('transfo', 'circle-color', expr);
    if (map.getLayer('ligne')) map.setPaintProperty('ligne', 'line-color', expr);

    // heatmap
    setVis('transfo-heat', heatmap && layers.transfo);

    // overloaded-only filter
    const f = onlyOverloaded ? OVERLOADED_FILTER : null;
    if (map.getLayer('transfo')) map.setFilter('transfo', f);
    if (map.getLayer('ligne')) map.setFilter('ligne', f);
  }

  useEffect(() => { applyState(); });

  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: flyTo, zoom: 15, duration: 800 });
  }, [flyTo]);

  return <div className="ops-map" ref={ref} />;
}
