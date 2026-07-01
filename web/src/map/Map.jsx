import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Camera } from 'lucide-react';
import './map.css';
import { TILE_BASE } from '../api.js';
import {
  transfoCirclePaint, ligneLinePaint, posteCirclePaint,
  pointServiceCirclePaint,
  voltageColorExpr, surchargeHeatmapPaint, OVERLOADED_FILTER,
  transfoCritiquePulsePaint, CRITIQUE_FILTER,
  ligneFlowPaint, LIGNE_FLOW_FRAMES,
  recentFilter, recentRingPaint, recentLigneCasingPaint,
  quartierFillPaint, quartierLinePaint, quartierLabelLayout, quartierLabelPaint,
  parcelleFillPaint, parcelleLinePaint, parcelleLabelLayout, parcelleLabelPaint,
} from './style.js';
import { classeColorExpr, COLOR, BRAND } from '../theme/tokens.js';
import {
  applyTraceHighlight, addTraceHighlightLayers, syncTraceHighlightVisibility, bindTraceRestore,
} from './trace-highlight.js';
import { MapLegend } from './MapLegend.jsx';
import { COORD_FORMATS, formatCoord } from './coords.js';
import { Select } from '../ui/index.js';

const NOUAKCHOTT = { center: [-15.97, 18.09], zoom: 12 };
const MIN_ZOOM = 4;
const MAX_ZOOM = 22; // raised from MapLibre's effective default; vector tiles overzoom crisply.
const RECENT_DAYS = 90;

// Base style is CARTO Voyager (Google-Maps-like, OpenMapTiles schema so it carries
// name:ar / name:latin for relabelling). Alternative basemaps (OpenStreetMap, satellite)
// are layered in as opaque rasters ON TOP of this style (below our data) and toggled by
// visibility — rather than swapping the whole style — so the network layers are added
// once and never disappear when switching. Only one overlay is visible at a time; with
// none visible, the Voyager vector base shows through ('map').
const STREET_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT_ATTRIB = 'Imagery © Esri, Maxar, Earthstar Geographics';
// OpenStreetMap standard raster. NOTE: tile.openstreetmap.org is fine for the pilot/demo,
// but its usage policy forbids heavy/bulk traffic — swap for a hosted provider before
// any high-volume production use. OSM labels are baked into the raster (no AR/Latin switch).
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIB = '© OpenStreetMap contributors';

const DEFAULT_LAYERS = { quartier: false, parcelle: false, poste: false, transfo: true, ligne: true, point_service: false, support: false };

// Vector tile sources. source-layer == layer key.
const SOURCES = ['transfo', 'ligne', 'poste', 'point_service', 'support', 'quartier', 'parcelle'];

// id field returned per layer for onSelectFeature.
const ID_FIELD = {
  transfo: 'transfo_id', ligne: 'ligne_id', poste: 'poste_id',
  point_service: 'point_id', support: 'support_id', quartier: 'quartier_id', parcelle: 'parcelle_id',
};

// Layers that carry classe/taux_charge (load-bearing) — get overloaded filter + color-by.
const LOAD_LAYERS = ['transfo', 'ligne'];
// Interactive layers for hover/click.
const HOVER_LAYERS = ['transfo', 'ligne', 'poste', 'support', 'parcelle-fill'];
const CLICK_LAYERS = ['transfo', 'ligne', 'poste', 'point_service', 'support', 'quartier-fill', 'parcelle-fill'];
// Layer id → logical feature type (when they differ, e.g. the quartier fill polygon).
const CLICK_TYPE = { 'quartier-fill': 'quartier', 'parcelle-fill': 'parcelle' };

// Which field each `filters` key maps to, and which layers have it.
const FILTER_FIELDS = {
  niveau_tension: ['transfo', 'ligne'],
  statut: ['poste', 'point_service'],
  classe: ['transfo', 'ligne'],
  fonction: ['support'],
  materiau: ['support'],
};

const fmtPct = (v) => (v == null || v === '' ? '—' : `${Math.round(Number(v))}%`);

// --- whatif --- petites saisies (kVA / kW) pour le bac à sable. Renvoient null si annulé.
function promptKva() {
  const v = Number(window.prompt('Puissance du transformateur (kVA) ?', '250'));
  return Number.isFinite(v) && v > 0 ? v : null;
}
function promptKw() {
  const v = Number(window.prompt('Puissance souscrite du client (kW) ?', '30'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

// 90-day cutoff as an ISO date string — compared lexically against date_mise_service.
function recentCutoffISO() {
  const d = new Date();
  d.setDate(d.getDate() - RECENT_DAYS);
  return d.toISOString().slice(0, 10);
}

// Load the RTL shaping plugin once (needed for legible Arabic labels). Lazy = only
// fetched the first time an Arabic glyph is rendered.
//
// Gate on MapLibre's *global* plugin status, not a module-local flag: that flag resets
// on every Vite HMR reload while MapLibre's registration persists, so a stale flag would
// re-trigger setRTLTextPlugin and it throws "cannot be called multiple times". With
// lazy=true the call also returns a promise that rejects async, so catch that too.
function ensureRTLPlugin() {
  if (maplibregl.getRTLTextPluginStatus() !== 'unavailable') return;
  Promise.resolve(
    maplibregl.setRTLTextPlugin(
      'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
      null, true,
    ),
  ).catch(() => { /* already registered (e.g. across an HMR reload) */ });
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
  // Poteaux : un triangle coloré par fonction.
  const poteauIcons = {
    'icon-support':             { fill: '#6B7280', stroke: '#FFFFFF' }, // support (gris)
    'icon-support-ec':          { fill: '#F59E0B', stroke: '#FFFFFF' }, // éclairage public (ambre)
    'icon-support-solaire':     { fill: '#10B981', stroke: '#FFFFFF' }, // éclairage solaire (vert)
    'icon-support-mixte':       { fill: '#8B5CF6', stroke: '#FFFFFF' }, // mixte (violet)
  };
  for (const [name, colors] of Object.entries(poteauIcons)) {
    if (!map.hasImage(name)) {
      const i = makeShapeIcon('triangle', colors);
      map.addImage(name, i, { pixelRatio: i.pixelRatio });
    }
  }
}

// Map: ops-console basemap (Voyager vector, OpenStreetMap, or satellite) + all network layers.
export default function Map({
  layers = DEFAULT_LAYERS,
  colorBy = 'charge',
  heatmap = false,
  onlyOverloaded = false,
  filters = {},
  basemap = 'map',
  language = 'fr',
  showRecent = false,
  highlighted = null, // --- trace --- ids affectés par la trace, par couche
  flyTo,
  onSelectFeature,
  whatif = null, // --- whatif --- contrôleur du bac à sable (useWhatIf), ou null
  // --- analytics --- (chantier 3) optional: hand the live map instance to overlays
  // (Pertes / Prévision) so they can attach their own GeoJSON sources without
  // touching the core layer setup. Non-breaking: undefined by default.
  onMapReady,
  // --- /analytics ---
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);
  const popupRef = useRef(null);
  const pulseRafRef = useRef(null);
  const flowRafRef = useRef(null);
  const markerRef = useRef(null);        // transient pin for fly-to targets
  const highlightedRef = useRef(null);   // --- trace --- last applied highlight ids
  const coordTextRef = useRef(null);     // live coordinate readout (updated imperatively)
  const lastLngLatRef = useRef(null);    // last hovered lng/lat (for format re-render)
  // Latest props for event handlers bound once.
  const onSelectRef = useRef(onSelectFeature);
  onSelectRef.current = onSelectFeature;
  // --- whatif --- latest sandbox controller for the once-bound map click handler.
  const whatifRef = useRef(whatif);
  whatifRef.current = whatif;
  // --- analytics --- latest onMapReady for the once-bound load handler (chantier 3).
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  // --- /analytics ---

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
        // Radar ping: ring expands and fades. Ease-out on the fade so it lingers
        // small/bright then races out — reads as an active sweep, not a throb.
        map.setPaintProperty('transfo-critique-pulse', 'circle-radius', 8 + t * 24);
        map.setPaintProperty('transfo-critique-pulse', 'circle-stroke-opacity', 0.75 * (1 - t) ** 1.5);
      }
      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);
  }

  // Signature electricity current-flow: ant-march the electric-cyan `ligne-flow`
  // overlay by cycling line-dasharray frames at ~12fps so cyan dashes travel along lines.
  // Skipped (static dashes) under reduced-motion; idles while the ligne layer is hidden.
  function startFlow(map) {
    if (flowRafRef.current) cancelAnimationFrame(flowRafRef.current);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // keep the static cyan dashes from ligneFlowPaint
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
          // --- trace --- promoteId : utilise l'id métier comme feature-state id
          // (les tuiles ST_AsMVT n'attribuent pas d'id natif). Requis pour le highlight.
          promoteId: ID_FIELD[s],
          // --- end trace ---
        });
      }
    });

    const cutoff = recentCutoffISO();

    // Alternative basemap rasters — first of OUR layers, so they cover the Voyager
    // base (roads/labels) but sit BELOW every network layer added after them. Toggled
    // via visibility; never removed, so the data layers above always render.
    if (!map.getSource('osm')) {
      map.addSource('osm', { type: 'raster', tiles: [OSM_TILES], tileSize: 256, maxzoom: 19, attribution: OSM_ATTRIB });
    }
    if (!map.getLayer('osm')) {
      map.addLayer({ id: 'osm', type: 'raster', source: 'osm', layout: { visibility: basemap === 'osm' ? 'visible' : 'none' } });
    }
    if (!map.getSource('sat')) {
      map.addSource('sat', { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: SAT_ATTRIB });
    }
    if (!map.getLayer('satellite')) {
      map.addLayer({ id: 'satellite', type: 'raster', source: 'sat', layout: { visibility: basemap === 'satellite' ? 'visible' : 'none' } });
    }

    // Quartiers (polygones réels) — tout en bas de notre pile, sous le réseau :
    // remplissage léger + contour pointillé + libellé. N'obscurcit pas points/lignes.
    if (!map.getLayer('quartier-fill')) {
      map.addLayer({
        id: 'quartier-fill', type: 'fill', source: 'quartier', 'source-layer': 'quartier',
        paint: quartierFillPaint, layout: { visibility: 'none' },
      });
    }
    if (!map.getLayer('quartier-line')) {
      map.addLayer({
        id: 'quartier-line', type: 'line', source: 'quartier', 'source-layer': 'quartier',
        paint: quartierLinePaint, layout: { visibility: 'none' },
      });
    }
    if (!map.getLayer('quartier-label')) {
      map.addLayer({
        id: 'quartier-label', type: 'symbol', source: 'quartier', 'source-layer': 'quartier',
        layout: { ...quartierLabelLayout, visibility: 'none' }, paint: quartierLabelPaint,
      });
    }

    // Parcelles (lots cadastraux) — polygones individuels avec numéro de lot.
    // Affichage à partir de zoom 15. Clic → inspecteur avec chaîne complète.
    if (!map.getLayer('parcelle-fill')) {
      map.addLayer({
        id: 'parcelle-fill', type: 'fill', source: 'parcelle', 'source-layer': 'parcelle',
        minzoom: 13, paint: parcelleFillPaint, layout: { visibility: 'none' },
      });
    }
    if (!map.getLayer('parcelle-line')) {
      map.addLayer({
        id: 'parcelle-line', type: 'line', source: 'parcelle', 'source-layer': 'parcelle',
        minzoom: 13, paint: parcelleLinePaint, layout: { visibility: 'none' },
      });
    }
    if (!map.getLayer('parcelle-label')) {
      map.addLayer({
        id: 'parcelle-label', type: 'symbol', source: 'parcelle', 'source-layer': 'parcelle',
        minzoom: 15, layout: { ...parcelleLabelLayout, visibility: 'none' }, paint: parcelleLabelPaint,
      });
    }

    // Order: recent ligne casing → lignes → current flow → heat → dots → markers.
    if (!map.getLayer('ligne-recent')) {
      map.addLayer({
        id: 'ligne-recent', type: 'line', source: 'ligne', 'source-layer': 'ligne',
        filter: recentFilter(cutoff), paint: recentLigneCasingPaint, layout: { visibility: 'none' },
      });
    }
    if (!map.getLayer('ligne')) {
      map.addLayer({ id: 'ligne', type: 'line', source: 'ligne', 'source-layer': 'ligne', paint: ligneLinePaint });
    }
    // Electric-cyan current-flow overlay sits directly above the base ligne line.
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
        minzoom: 15, paint: pointServiceCirclePaint,
      });
    }
    // Support (poteaux) : triangles colorés par fonction, taille par matériau.
    if (!map.getLayer('support')) {
      map.addLayer({
        id: 'support', type: 'symbol', source: 'support', 'source-layer': 'support', minzoom: 11,
        layout: {
          'icon-image': [
            'match', ['get', 'fonction'],
            'eclairage_public',  'icon-support-ec',
            'eclairage_solaire', 'icon-support-solaire',
            'mixte',             'icon-support-mixte',
            /* support / default */ 'icon-support',
          ],
          'icon-allow-overlap': true,
          'icon-size': [
            'match', ['get', 'materiau'],
            'bois',  0.45,
            'beton', 0.55,
            'metal', 0.65,
            0.5,
          ],
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

    // --- trace --- couches de surbrillance (feature-state `highlighted`).
    // Ajoutées en dernier => au-dessus. Réutilisent les sources de tuiles existantes.
    addTraceHighlightLayers(map);
    // --- end trace ---

    // --- whatif ---------------------------------------------------------------
    // Source GeoJSON overlay du bac à sable « what-if », rendue AU-DESSUS des tuiles
    // vectorielles (jamais mutées). Recolore via la même expression `classe` des tokens.
    if (!map.getSource('whatif')) {
      map.addSource('whatif', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    // Points de service simulés (petits points neutres).
    if (!map.getLayer('whatif-point')) {
      map.addLayer({
        id: 'whatif-point', type: 'circle', source: 'whatif',
        filter: ['==', ['get', 'kind'], 'point'],
        paint: {
          'circle-color': COLOR.textSecondary,
          'circle-radius': 3,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.9,
        },
      });
    }
    // Halo de sélection sous le transfo sélectionné (anneau or = accent énergie).
    if (!map.getLayer('whatif-transfo-sel')) {
      map.addLayer({
        id: 'whatif-transfo-sel', type: 'circle', source: 'whatif',
        filter: ['all', ['==', ['get', 'kind'], 'transfo'], ['==', ['get', 'selected'], true]],
        paint: {
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': 15,
          'circle-stroke-width': 3,
          'circle-stroke-color': COLOR.energy,
          'circle-stroke-opacity': 0.95,
        },
      });
    }
    // Transfos simulés — recolorés par la classe recalculée (même expression que les tuiles).
    if (!map.getLayer('whatif-transfo')) {
      map.addLayer({
        id: 'whatif-transfo', type: 'circle', source: 'whatif',
        filter: ['==', ['get', 'kind'], 'transfo'],
        paint: {
          'circle-color': classeColorExpr,
          'circle-radius': ['match', ['get', 'classe'], 'critique', 10, 'surcharge', 8, 6],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.97,
        },
      });
    }
    // --- /whatif --------------------------------------------------------------
  }

  // --- whatif ---------------------------------------------------------------
  // Capture d'un actif cliqué dans le bac à sable. Renvoie true si le clic a été
  // consommé (=> ne pas inspecter). Aucun accès DB : on lit seulement les props de tuile.
  function handleWhatIfFeatureClick(layerId, e) {
    const wi = whatifRef.current;
    if (!wi || !wi.enabled) return false;
    const f = e.features[0];
    if (!f) return false;
    const p = f.properties || {};
    if (layerId === 'transfo') {
      // Les tuiles transfo exposent puissance_kva → capture directe.
      const kva = p.puissance_kva != null ? Number(p.puissance_kva) : promptKva();
      if (kva == null) return true;
      wi.addTransfo({
        id: `tr-${p.transfo_id}`, code: p.code_actif || `TR-${p.transfo_id}`,
        puissance_kva: kva, lng: e.lngLat.lng, lat: e.lngLat.lat, source: 'capture',
      });
      return true;
    }
    if (layerId === 'point_service') {
      // Les tuiles point n'exposent pas la puissance souscrite → on la demande.
      if (!wi.selectedTransfoId) { window.alert('Sélectionnez d\'abord un transformateur dans le bac à sable.'); return true; }
      const kw = promptKw();
      if (kw == null) return true;
      wi.addPoint({ transfo_id: wi.selectedTransfoId, puiss_souscrite_kw: kw, lng: e.lngLat.lng, lat: e.lngLat.lat, source: 'capture' });
      return true;
    }
    return false;
  }
  // --- /whatif --------------------------------------------------------------

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
        const fonct = p.fonction ? `<span class="map-tip__taux">${p.fonction}</span>` : '';
        const mat = p.materiau ? `<span class="map-tip__taux">${p.materiau}</span>` : '';
        const html = `<div class="map-tip__code">${code}</div><div class="map-tip__meta">${classe}${taux}${fonct}${mat}</div>`;
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
        // --- whatif --- en mode bac à sable, capter le clic d'actif au lieu d'inspecter.
        if (handleWhatIfFeatureClick(id, e)) return;
        const f = e.features[0];
        if (!f) return;
        const p = f.properties || {};
        const type = CLICK_TYPE[id] || id;
        const fid = p[ID_FIELD[type]] ?? p.id ?? null;
        onSelectRef.current?.({ type, id: fid, lng: e.lngLat.lng, lat: e.lngLat.lat, ...p });
      });
    });

    // --- whatif ---------------------------------------------------------------
    // Clic « à vide » sur la carte : en mode ajout, place un transformateur (saisie kVA).
    map.on('click', (e) => {
      const wi = whatifRef.current;
      if (!wi || !wi.enabled || wi.mode !== 'add-transfo') return;
      // Ignorer si un actif réel a été cliqué (géré par le handler de couche ci-dessus).
      const hits = map.queryRenderedFeatures(e.point, { layers: CLICK_LAYERS.filter((l) => map.getLayer(l)) });
      if (hits.length) return;
      const kva = promptKva();
      if (kva == null) return;
      wi.addTransfo({ code: `SIM-${Date.now().toString().slice(-4)}`, puissance_kva: kva, lng: e.lngLat.lng, lat: e.lngLat.lat });
      wi.setMode('idle');
    });
    // --- /whatif --------------------------------------------------------------

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
      style: STREET_STYLE,
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
        bindTraceRestore(map, () => highlightedRef.current); // --- trace ---
      } catch (err) {
        console.warn('Map layer init partial:', err);
      }
      loadedRef.current = true;
      applyState();
      // --- trace --- réapplique une éventuelle surbrillance après (re)chargement du style.
      if (highlighted) {
        applyTraceHighlight(map, null, highlighted);
        highlightedRef.current = highlighted;
        syncTraceHighlightVisibility(map, highlighted, layers);
      }
      // --- end trace ---
      // --- analytics --- expose the ready map to analytics overlays (chantier 3).
      try { onMapReadyRef.current?.(map); } catch (e) { console.warn('onMapReady failed', e); }
      // --- /analytics ---
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
    // Basemap: Voyager vector base ('map') vs OSM or satellite raster overlay.
    setVis('osm', basemap === 'osm');
    setVis('satellite', basemap === 'satellite');
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
    // Quartiers : remplissage + contour + libellé suivent le même toggle.
    setVis('quartier-fill', layers.quartier);
    setVis('quartier-line', layers.quartier);
    setVis('quartier-label', layers.quartier);
    // Parcelles : remplissage + contour + libellé suivent le même toggle.
    setVis('parcelle-fill', layers.parcelle);
    setVis('parcelle-line', layers.parcelle);
    setVis('parcelle-label', layers.parcelle);

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

  // Re-apply on control prop changes (incl. basemap satellite toggle).
  useEffect(() => { applyState(); });

  // Language switch on the live vector basemap.
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

  // --- trace --- applique/efface la surbrillance feature-state des actifs affectés.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyTraceHighlight(map, highlightedRef.current, highlighted);
    highlightedRef.current = highlighted;
    syncTraceHighlightVisibility(map, highlighted, layers);
  }, [highlighted, layers]);
  // --- end trace ---

  // --- whatif ---------------------------------------------------------------
  // Pousse l'overlay GeoJSON du bac à sable dans la source (sans toucher aux tuiles).
  // Le curseur passe en réticule quand on est en mode « ajouter un transfo ».
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource('whatif');
    if (src) src.setData(whatif?.geojson || { type: 'FeatureCollection', features: [] });
    const canvas = map.getCanvas();
    if (canvas) canvas.style.cursor = whatif?.enabled && whatif?.mode === 'add-transfo' ? 'crosshair' : '';
  }, [whatif?.geojson, whatif?.enabled, whatif?.mode]);
  // --- /whatif --------------------------------------------------------------

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
  quartier: 'Quartiers', parcelle: 'Lots/Parcelles', poste: 'Postes source', transfo: 'Transformateurs', ligne: 'Lignes BT',
  point_service: 'Compteurs', support: 'Poteaux',
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
