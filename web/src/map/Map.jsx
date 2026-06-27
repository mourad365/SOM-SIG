import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Camera } from 'lucide-react';
import './map.css';
import { TILE_BASE } from '../api.js';
import {
  transfoCirclePaint, ligneLinePaint, posteCirclePaint,
  pointServiceCirclePaint, supportCirclePaint,
  voltageColorExpr, surchargeHeatmapPaint, OVERLOADED_FILTER,
  transfoCritiquePulsePaint, CRITIQUE_FILTER,
  ligneFlowPaint, LIGNE_FLOW_FRAMES,
  recentFilter, recentRingPaint, recentLigneCasingPaint,
} from './style.js';
import { classeColorExpr, COLOR, BRAND } from '../theme/tokens.js';
import { MapLegend } from './MapLegend.jsx';
import { COORD_FORMATS, formatCoord } from './coords.js';
import { Select } from '../ui/index.js';

const NOUAKCHOTT = { center: [-15.97, 18.09], zoom: 12 };
const MIN_ZOOM = 4;
const MAX_ZOOM = 22; // raised from MapLibre's effective default; vector tiles overzoom crisply.
const RECENT_DAYS = 90;

// Vector basemaps (CARTO/OpenMapTiles — carry name:ar / name:latin for relabelling).
const VECTOR_BASEMAPS = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};
// Satellite imagery (raster) — higher real-world resolution at deep zoom.
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    sat: {
      type: 'raster', tileSize: 256, maxzoom: 19,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
};
const styleForBasemap = (b) => (b === 'satellite' ? SATELLITE_STYLE : (VECTOR_BASEMAPS[b] || VECTOR_BASEMAPS.light));

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

// 90-day cutoff as an ISO date string — compared lexically against date_mise_service.
function recentCutoffISO() {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_DAYS);
  return d.toISOString().slice(0, 10);
}

// Load the RTL shaping plugin once (needed for legible Arabic labels). Lazy = only
// fetched the first time an Arabic glyph is rendered.
let rtlPluginRequested = false;
function ensureRTLPlugin() {
  if (rtlPluginRequested) return;
  rtlPluginRequested = true;
  try {
    maplibregl.setRTLTextPlugin(
      'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
      null, true,
    );
  } catch { /* already set in this session */ }
}

// Build a small high-DPI marker icon (square / triangle) for symbol layers, so each
// infrastructure type is distinguishable by SHAPE, not colour alone.
function makeShapeIcon(kind, { fill, stroke }) {
  const px = 22, ratio = 2, s = px * ratio, lw = 2 * ratio, pad = lw;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  if (kind === 'square') {
    const r = 3 * ratio;
    const x = pad, y = pad, w = s - pad * 2, hh = s - pad * 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hh, r);
    ctx.arcTo(x + w, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  } else { // triangle
    ctx.beginPath();
    ctx.moveTo(s / 2, pad);
    ctx.lineTo(s - pad, s - pad);
    ctx.lineTo(pad, s - pad);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  return { width: s, height: s, data: ctx.getImageData(0, 0, s, s).data, pixelRatio: ratio };
}

function ensureIcons(map) {
  if (!map.hasImage('icon-poste')) {
    const i = makeShapeIcon('square', { fill: BRAND.blue, stroke: '#FFFFFF' });
    map.addImage('icon-poste', i, { pixelRatio: i.pixelRatio });
  }
  if (!map.hasImage('icon-support')) {
    const i = makeShapeIcon('triangle', { fill: COLOR.textMuted, stroke: '#FFFFFF' });
    map.addImage('icon-support', i, { pixelRatio: i.pixelRatio });
  }
}

// Map: ops-console basemap (vector light/dark or satellite) + all network layers.
export default function Map({
  layers = DEFAULT_LAYERS,
  colorBy = 'charge',
  heatmap = false,
  onlyOverloaded = false,
  filters = {},
  basemap = 'light',
  language = 'fr',
  showRecent = false,
  flyTo,
  onSelectFeature,
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);
  const popupRef = useRef(null);
  const pulseRafRef = useRef(null);
  const flowRafRef = useRef(null);
  const markerRef = useRef(null);        // transient pin for fly-to targets
  const coordTextRef = useRef(null);     // live coordinate readout (updated imperatively)
  const lastLngLatRef = useRef(null);    // last hovered lng/lat (for format re-render)
  // Latest props for event handlers bound once.
  const onSelectRef = useRef(onSelectFeature);
  onSelectRef.current = onSelectFeature;

  const [coordFormat, setCoordFormat] = useState('dd');
  const [zoom, setZoom] = useState(NOUAKCHOTT.zoom);
  const coordFormatRef = useRef(coordFormat);
  coordFormatRef.current = coordFormat;

  // Animate the critique pulse ring (radius 10->26, opacity 0.5->0 over ~1.6s,
  // looped) via requestAnimationFrame. Skipped under reduced-motion.
  function startPulse(map) {
    if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      if (map.getLayer('transfo-critique-pulse')) {
        map.setLayoutProperty('transfo-critique-pulse', 'visibility', 'none');
      }
      return;
    }
    const PERIOD = 1600;
    const start = performance.now();
    const tick = (now) => {
      if (!map.getLayer('transfo-critique-pulse')) { pulseRafRef.current = null; return; }
      // Skip paint churn while the ring is hidden (transfo layer toggled off) — keep the
      // loop alive so it resumes instantly when re-shown. rAF already idles when tab hidden.
      if (map.getLayoutProperty('transfo-critique-pulse', 'visibility') !== 'none') {
        const t = ((now - start) % PERIOD) / PERIOD; // 0..1
        map.setPaintProperty('transfo-critique-pulse', 'circle-radius', 10 + t * 16);
        map.setPaintProperty('transfo-critique-pulse', 'circle-opacity', 0.5 * (1 - t));
      }
      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);
  }

  // Signature electricity current-flow: ant-march the gold `ligne-flow` overlay
  // by cycling line-dasharray frames at ~12fps so gold dashes travel along lines.
  // Skipped (static dashes) under reduced-motion; idles while the ligne layer is hidden.
  function startFlow(map) {
    if (flowRafRef.current) cancelAnimationFrame(flowRafRef.current);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // keep the static gold dashes from ligneFlowPaint
    const FRAME_MS = 90; // ~11fps — deliberately throttled, not 60fps
    let i = 0;
    let last = 0;
    const tick = (now) => {
      if (!map.getLayer('ligne-flow')) { flowRafRef.current = null; return; }
      if (now - last >= FRAME_MS) {
        last = now;
        // Skip paint churn while the flow layer is hidden (ligne toggled off).
        if (map.getLayoutProperty('ligne-flow', 'visibility') !== 'none') {
          i = (i + 1) % LIGNE_FLOW_FRAMES.length;
          map.setPaintProperty('ligne-flow', 'line-dasharray', LIGNE_FLOW_FRAMES[i]);
        }
      }
      flowRafRef.current = requestAnimationFrame(tick);
    };
    flowRafRef.current = requestAnimationFrame(tick);
  }

  // Override basemap symbol labels to the chosen language (name:ar / name:latin).
  function applyLabelLanguage(map, lang) {
    let style;
    try { style = map.getStyle(); } catch { return; }
    if (!style || !style.layers) return;
    const field = lang === 'ar'
      ? ['coalesce', ['get', 'name:ar'], ['get', 'name']]
      : ['coalesce', ['get', 'name:latin'], ['get', 'name:fr'], ['get', 'name']];
    for (const layer of style.layers) {
      if (layer.type !== 'symbol') continue;
      if (!layer.layout || layer.layout['text-field'] === undefined) continue;
      try { map.setLayoutProperty(layer.id, 'text-field', field); } catch { /* layer w/o text */ }
    }
  }

  // Add all sources + layers. Reused on initial load AND after setStyle (basemap switch).
  function addLayers(map) {
    ensureIcons(map);
    SOURCES.forEach((s) => {
      if (!map.getSource(s)) {
        map.addSource(s, {
          type: 'vector',
          tiles: [`${TILE_BASE}/tiles/${s}/{z}/{x}/{y}.pbf`],
          minzoom: 6, maxzoom: 20,
        });
      }
    });

    const cutoff = recentCutoffISO();

    // Order: recent ligne casing → lignes → gold flow → heat → dots → markers.
    if (!map.getLayer('ligne-recent')) {
      map.addLayer({
        id: 'ligne-recent', type: 'line', source: 'ligne', 'source-layer': 'ligne',
        filter: recentFilter(cutoff), paint: recentLigneCasingPaint, layout: { visibility: 'none' },
      });
    }
    if (!map.getLayer('ligne')) {
      map.addLayer({ id: 'ligne', type: 'line', source: 'ligne', 'source-layer': 'ligne', paint: ligneLinePaint });
    }
    // Gold current-flow overlay sits directly above the base ligne line.
    if (!map.getLayer('ligne-flow')) {
      map.addLayer({ id: 'ligne-flow', type: 'line', source: 'ligne', 'source-layer': 'ligne', paint: ligneFlowPaint });
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
    // Support: triangle icon (distinct shape per type).
    if (!map.getLayer('support')) {
      map.addLayer({
        id: 'support', type: 'symbol', source: 'support', 'source-layer': 'support', minzoom: 14,
        layout: {
          'icon-image': 'icon-support', 'icon-allow-overlap': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.55, 17, 0.9],
        },
      });
    }
    // Recent ring sits under the transfo marker (above its pulse).
    if (!map.getLayer('transfo-recent')) {
      map.addLayer({
        id: 'transfo-recent', type: 'circle', source: 'transfo', 'source-layer': 'transfo',
        filter: recentFilter(cutoff), paint: recentRingPaint, layout: { visibility: 'none' },
      });
    }
    // Pulse ring sits directly UNDER the solid transfo marker so the dot stays on top.
    if (!map.getLayer('transfo-critique-pulse')) {
      map.addLayer({
        id: 'transfo-critique-pulse', type: 'circle', source: 'transfo', 'source-layer': 'transfo',
        filter: CRITIQUE_FILTER, paint: transfoCritiquePulsePaint,
      });
    }
    if (!map.getLayer('transfo')) {
      map.addLayer({ id: 'transfo', type: 'circle', source: 'transfo', 'source-layer': 'transfo', paint: transfoCirclePaint });
    }
    if (!map.getLayer('poste-recent')) {
      map.addLayer({
        id: 'poste-recent', type: 'circle', source: 'poste', 'source-layer': 'poste',
        filter: recentFilter(cutoff), paint: recentRingPaint, layout: { visibility: 'none' },
      });
    }
    // Poste: square icon (distinct shape per type), kept as the topmost layer.
    if (!map.getLayer('poste')) {
      map.addLayer({
        id: 'poste', type: 'symbol', source: 'poste', 'source-layer': 'poste',
        layout: {
          'icon-image': 'icon-poste', 'icon-allow-overlap': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 16, 1.05],
        },
      });
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

    // Live coordinate readout (imperative — avoids a React render per mouse move).
    map.on('mousemove', (e) => {
      lastLngLatRef.current = e.lngLat;
      if (coordTextRef.current) {
        coordTextRef.current.textContent = formatCoord(coordFormatRef.current, e.lngLat.lng, e.lngLat.lat);
      }
    });
  }

  useEffect(() => {
    ensureRTLPlugin();
    const map = new maplibregl.Map({
      container: ref.current,
      style: styleForBasemap(basemap),
      center: NOUAKCHOTT.center,
      zoom: NOUAKCHOTT.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
      preserveDrawingBuffer: true, // required so the canvas can be captured for export
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('zoom', () => setZoom(map.getZoom()));

    map.on('load', () => {
      try {
        addLayers(map);
        bindInteractions(map);
        applyLabelLanguage(map, language);
        startPulse(map);
        startFlow(map);
      } catch (err) {
        console.warn('Map layer init partial:', err);
      }
      loadedRef.current = true;
      applyState();
    });

    return () => {
      loadedRef.current = false;
      if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current);
      if (flowRafRef.current) cancelAnimationFrame(flowRafRef.current);
      popupRef.current?.remove();
      markerRef.current?.remove();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply visibility, color-by, heatmap, filters. Re-run on every relevant prop change.
  function applyState() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const setVis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    setVis('transfo', layers.transfo);
    // Pulse ring follows the transfo layer (but reduced-motion keeps it hidden).
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setVis('transfo-critique-pulse', layers.transfo && !reduce);
    setVis('ligne', layers.ligne);
    // Flow overlay follows the ligne layer.
    setVis('ligne-flow', layers.ligne);
    setVis('poste', layers.poste);
    setVis('point_service', layers.point_service);
    setVis('support', layers.support);

    // Recent-infrastructure halos: only when enabled AND parent layer is visible.
    setVis('transfo-recent', showRecent && layers.transfo);
    setVis('poste-recent', showRecent && layers.poste);
    setVis('ligne-recent', showRecent && layers.ligne);

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
    map.setStyle(styleForBasemap(basemap));
    map.once('style.load', () => {
      try {
        addLayers(map);
        bindInteractions(map);
        applyLabelLanguage(map, language);
        startPulse(map);
        startFlow(map);
      } catch (err) {
        console.warn('Map restyle re-add partial:', err);
      }
      applyState();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // Language switch on a live vector basemap (no full restyle needed).
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) applyLabelLanguage(map, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Re-render coordinate readout when the format changes (uses last hovered point).
  useEffect(() => {
    if (!coordTextRef.current) return;
    const ll = lastLngLatRef.current || (mapRef.current && mapRef.current.getCenter());
    coordTextRef.current.textContent = ll ? formatCoord(coordFormat, ll.lng, ll.lat) : '—';
  }, [coordFormat]);

  useEffect(() => {
    const map = mapRef.current;
    if (!flyTo || !map) return;
    map.flyTo({ center: flyTo, zoom: Math.max(map.getZoom(), 15), duration: 800 });
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: BRAND.blue }).setLngLat(flyTo).addTo(map);
  }, [flyTo]);

  // Export the current view as a PNG with north arrow, scale, date and an info panel.
  function captureView() {
    const map = mapRef.current;
    if (!map) return;
    map.once('render', () => exportComposite(map, { layers, colorBy, showRecent }));
    map.triggerRepaint();
  }

  const zoomPct = Math.round(((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100);

  return (
    <div className="ops-map-wrap">
      <div className="ops-map" ref={ref} />
      <MapLegend colorBy={colorBy} showRecent={showRecent} />

      <button type="button" className="map-capture-btn" onClick={captureView} title="Exporter une capture (PNG)">
        <Camera size={15} /> Capture
      </button>

      <div className="map-coordbar">
        <Select
          value={coordFormat}
          onChange={setCoordFormat}
          options={COORD_FORMATS}
          aria-label="Format des coordonnées"
          className="map-coordbar__fmt"
        />
        <span ref={coordTextRef} className="map-coordbar__val mono">—</span>
        <span className="map-coordbar__sep" aria-hidden="true" />
        <span className="map-coordbar__zoom mono" title="Niveau de zoom">
          z{zoom.toFixed(1)} · {zoomPct}%
        </span>
      </div>
    </div>
  );
}

// ---- Capture / export ---------------------------------------------------------
// Composites the map canvas with cartographic furniture and downloads a PNG.
function exportComposite(map, ctx) {
  const src = map.getCanvas();
  const W = src.width, H = src.height;
  const dpr = window.devicePixelRatio || 1;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const c = out.getContext('2d');
  c.drawImage(src, 0, 0);
  c.scale(dpr, dpr);            // draw furniture in CSS px regardless of device ratio
  const w = W / dpr, h = H / dpr;
  const pad = 14;

  drawNorthArrow(c, w - 38, 40);
  drawScaleBar(c, pad, h - 64, map);

  const now = new Date();
  const stamp = now.toLocaleString('fr-FR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  c.font = '12px Inter, system-ui, sans-serif';
  drawChipText(c, stamp, w - pad - c.measureText(stamp).width - 8, h - 22);

  const activeLayers = Object.entries(ctx.layers).filter(([, v]) => v).map(([k]) => LAYER_LABEL[k] || k);
  const center = map.getCenter();
  const lines = [
    'SIG SOMELEC — Réseau électrique',
    `Couches : ${activeLayers.join(', ') || '—'}`,
    `Coloration : ${ctx.colorBy === 'tension' ? 'Niveau de tension' : 'Taux de charge'}`,
    `Centre : ${formatCoord('dd', center.lng, center.lat)}`,
    `Zoom : ${map.getZoom().toFixed(1)}${ctx.showRecent ? '  ·  Récents en évidence' : ''}`,
  ];
  drawInfoPanel(c, pad, pad, lines);

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `som-sig_${now.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

const LAYER_LABEL = {
  poste: 'Postes', transfo: 'Transformateurs', ligne: 'Lignes',
  point_service: 'Points de service', support: 'Supports',
};

function drawInfoPanel(c, x, y, lines) {
  c.font = '12px Inter, system-ui, sans-serif';
  const wMax = Math.max(...lines.map((l) => c.measureText(l).width));
  const boxW = wMax + 20, lineH = 17, boxH = lines.length * lineH + 14;
  roundRect(c, x, y, boxW, boxH, 6);
  c.fillStyle = 'rgba(15,25,45,0.78)';
  c.fill();
  c.textBaseline = 'top';
  lines.forEach((line, i) => {
    c.fillStyle = i === 0 ? '#FFFFFF' : 'rgba(225,234,243,0.92)';
    c.font = `${i === 0 ? '600 12.5px' : '12px'} Inter, system-ui, sans-serif`;
    c.fillText(line, x + 10, y + 9 + i * lineH);
  });
}

function drawChipText(c, text, x, y) {
  const tw = c.measureText(text).width;
  roundRect(c, x - 8, y - 16, tw + 16, 22, 5);
  c.fillStyle = 'rgba(15,25,45,0.78)';
  c.fill();
  c.fillStyle = '#FFFFFF';
  c.textBaseline = 'middle';
  c.fillText(text, x, y - 5);
}

function drawNorthArrow(c, cx, cy) {
  c.save();
  c.translate(cx, cy);
  c.beginPath();
  c.moveTo(0, -16); c.lineTo(7, 8); c.lineTo(0, 2); c.lineTo(-7, 8); c.closePath();
  c.fillStyle = '#FFFFFF';
  c.strokeStyle = 'rgba(15,25,45,0.85)';
  c.lineWidth = 1.5;
  c.fill(); c.stroke();
  c.fillStyle = '#FFFFFF';
  c.font = '700 12px Inter, system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.strokeText('N', 0, -18);
  c.fillText('N', 0, -18);
  c.restore();
}

function drawScaleBar(c, x, y, map) {
  const center = map.getCenter();
  const mpp = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / 2 ** map.getZoom();
  const target = mpp * 120; // aim ~120px wide
  const pow = 10 ** Math.floor(Math.log10(target));
  let dist = pow;
  for (const n of [1, 2, 3, 5]) { if (n * pow <= target) dist = n * pow; }
  const barPx = dist / mpp;
  const label = dist >= 1000 ? `${dist / 1000} km` : `${dist} m`;
  c.textAlign = 'left';
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y + 8); c.lineTo(x, y); c.lineTo(x + barPx, y); c.lineTo(x + barPx, y + 8);
  c.strokeStyle = 'rgba(15,25,45,0.85)'; c.lineWidth = 4; c.stroke();
  c.strokeStyle = '#FFFFFF'; c.lineWidth = 2; c.stroke();
  c.font = '700 11px Inter, system-ui, sans-serif';
  c.textBaseline = 'bottom';
  c.lineWidth = 3; c.strokeStyle = 'rgba(15,25,45,0.85)';
  c.strokeText(label, x, y - 2);
  c.fillStyle = '#FFFFFF';
  c.fillText(label, x, y - 2);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
