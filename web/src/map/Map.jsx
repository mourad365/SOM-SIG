import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';
import { TILE_BASE } from '../api.js';
import {
  transfoCirclePaint, ligneLinePaint, posteCirclePaint,
  pointServiceCirclePaint, supportCirclePaint,
  voltageColorExpr, surchargeHeatmapPaint, OVERLOADED_FILTER,
} from './style.js';
import { classeColorExpr } from '../theme/tokens.js';
import { MapLegend } from './MapLegend.jsx';

const NOUAKCHOTT = { center: [-15.97, 18.09], zoom: 12 };
const BASEMAPS = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const DEFAULT_LAYERS = { poste: false, transfo: true, ligne: true, point_service: false, support: false };

// Vector tile sources. source-layer == layer key.
const SOURCES = ['transfo', 'ligne', 'poste', 'point_service', 'support'];

// id field returned per layer for onSelectFeature.
const ID_FIELD = {
  transfo: 'transfo_id', ligne: 'ligne_id', poste: 'poste_id',
  point_service: 'point_id', support: 'support_id',
};

// Layers that carry classe/taux_charge (load-bearing) — get overloaded filter + color-by.
const LOAD_LAYERS = ['transfo', 'ligne'];
// Interactive layers for hover/click.
const HOVER_LAYERS = ['transfo', 'ligne', 'poste'];
const CLICK_LAYERS = ['transfo', 'ligne', 'poste', 'point_service', 'support'];

// Which field each `filters` key maps to, and which layers have it.
const FILTER_FIELDS = {
  niveau_tension: ['transfo', 'ligne'],
  statut: ['poste', 'point_service'],
  classe: ['transfo', 'ligne'],
};

const fmtPct = (v) => (v == null || v === '' ? '—' : `${Math.round(Number(v))}%`);

// Map: dark/light ops-console basemap + all network layers.
export default function Map({
  layers = DEFAULT_LAYERS,
  colorBy = 'charge',
  heatmap = false,
  onlyOverloaded = false,
  filters = {},
  basemap = 'dark',
  flyTo,
  onSelectFeature,
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);
  const popupRef = useRef(null);
  // Latest props for event handlers bound once.
  const onSelectRef = useRef(onSelectFeature);
  onSelectRef.current = onSelectFeature;

  // Add all sources + layers. Reused on initial load AND after setStyle (basemap switch).
  function addLayers(map) {
    SOURCES.forEach((s) => {
      if (!map.getSource(s)) {
        map.addSource(s, {
          type: 'vector',
          tiles: [`${TILE_BASE}/tiles/${s}/{z}/{x}/{y}.pbf`],
          minzoom: 6, maxzoom: 20,
        });
      }
    });

    // Order: lines under circles; small dots/squares high-zoom; poste on top.
    if (!map.getLayer('ligne')) {
      map.addLayer({ id: 'ligne', type: 'line', source: 'ligne', 'source-layer': 'ligne', paint: ligneLinePaint });
    }
    if (!map.getLayer('transfo-heat')) {
      map.addLayer({
        id: 'transfo-heat', type: 'heatmap', source: 'transfo', 'source-layer': 'transfo',
        maxzoom: 20, paint: surchargeHeatmapPaint, layout: { visibility: 'none' },
      });
    }
    if (!map.getLayer('point_service')) {
      map.addLayer({
        id: 'point_service', type: 'circle', source: 'point_service', 'source-layer': 'point_service',
        minzoom: 13, paint: pointServiceCirclePaint,
      });
    }
    if (!map.getLayer('support')) {
      map.addLayer({
        id: 'support', type: 'circle', source: 'support', 'source-layer': 'support',
        minzoom: 14, paint: supportCirclePaint,
      });
    }
    if (!map.getLayer('transfo')) {
      map.addLayer({ id: 'transfo', type: 'circle', source: 'transfo', 'source-layer': 'transfo', paint: transfoCirclePaint });
    }
    if (!map.getLayer('poste')) {
      map.addLayer({ id: 'poste', type: 'circle', source: 'poste', 'source-layer': 'poste', paint: posteCirclePaint });
    }
  }

  // Bind hover + click handlers (idempotent enough for single mount).
  function bindInteractions(map) {
    HOVER_LAYERS.forEach((id) => {
      map.on('mousemove', id, (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features[0];
        if (!f) return;
        const p = f.properties || {};
        const code = p.code_actif || p.code_poste || p.code || '—';
        const classe = p.classe ? `<span class="map-tip__classe map-tip__classe--${p.classe}">${p.classe}</span>` : '';
        const taux = 'taux_charge' in p ? `<span class="map-tip__taux">${fmtPct(p.taux_charge)}</span>` : '';
        const html = `<div class="map-tip__code">${code}</div><div class="map-tip__meta">${classe}${taux}</div>`;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false, closeOnClick: false, offset: 12, className: 'map-tip-popup',
          });
        }
        popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('mouseleave', id, () => {
        map.getCanvas().style.cursor = '';
        popupRef.current?.remove();
      });
    });

    CLICK_LAYERS.forEach((id) => {
      map.on('click', id, (e) => {
        const f = e.features[0];
        if (!f) return;
        const p = f.properties || {};
        const fid = p[ID_FIELD[id]] ?? p.id ?? null;
        onSelectRef.current?.({ type: id, id: fid, lng: e.lngLat.lng, lat: e.lngLat.lat, ...p });
      });
    });
  }

  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current,
      style: BASEMAPS[basemap] || BASEMAPS.dark,
      center: NOUAKCHOTT.center,
      zoom: NOUAKCHOTT.zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      try {
        addLayers(map);
        bindInteractions(map);
      } catch (err) {
        console.warn('Map layer init partial:', err);
      }
      loadedRef.current = true;
      applyState();
    });

    return () => { loadedRef.current = false; popupRef.current?.remove(); map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply visibility, color-by, heatmap, filters. Re-run on every relevant prop change.
  function applyState() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const setVis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    setVis('transfo', layers.transfo);
    setVis('ligne', layers.ligne);
    setVis('poste', layers.poste);
    setVis('point_service', layers.point_service);
    setVis('support', layers.support);

    // color-by mode (load vs voltage) on transfo + ligne.
    const expr = colorBy === 'tension' ? voltageColorExpr : classeColorExpr;
    if (map.getLayer('transfo')) map.setPaintProperty('transfo', 'circle-color', expr);
    if (map.getLayer('ligne')) map.setPaintProperty('ligne', 'line-color', expr);

    // heatmap (only meaningful on transfo source).
    setVis('transfo-heat', heatmap);

    // Combined filter per layer: onlyOverloaded + filters.*
    LOAD_LAYERS.concat(['poste', 'point_service', 'support']).forEach((id) => {
      if (!map.getLayer(id)) return;
      const clauses = [];
      if (onlyOverloaded && LOAD_LAYERS.includes(id)) clauses.push(OVERLOADED_FILTER);
      Object.entries(filters || {}).forEach(([key, val]) => {
        if (val == null || val === '') return;
        const fields = FILTER_FIELDS[key];
        if (fields && fields.includes(id)) clauses.push(['==', ['get', key], val]);
      });
      const filter = clauses.length === 0 ? null
        : clauses.length === 1 ? clauses[0]
        : ['all', ...clauses];
      map.setFilter(id, filter);
    });
  }

  // Re-apply on control prop changes.
  useEffect(() => { applyState(); });

  // Basemap switch: setStyle then re-add sources/layers on style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const target = BASEMAPS[basemap] || BASEMAPS.dark;
    map.setStyle(target);
    map.once('style.load', () => {
      try {
        addLayers(map);
        bindInteractions(map);
      } catch (err) {
        console.warn('Map restyle re-add partial:', err);
      }
      applyState();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: flyTo, zoom: 15, duration: 800 });
  }, [flyTo]);

  return (
    <div className="ops-map-wrap">
      <div className="ops-map" ref={ref} />
      <MapLegend colorBy={colorBy} />
    </div>
  );
}
