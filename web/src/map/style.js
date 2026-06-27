// Map paint expressions — token-driven (see theme/tokens.js). Color = load signal only.
import { classeColorExpr, OVERLOADED_CLASSES, VOLTAGE, LOAD, COLOR, BRAND } from '../theme/tokens.js';

export const CLASSE_COLOR = classeColorExpr;

// Color-by-voltage expression (neutral cool palette, NOT load colors).
export const voltageColorExpr = [
  'match', ['get', 'niveau_tension'],
  'HTA33', VOLTAGE.HTA33,
  'HTA15', VOLTAGE.HTA15,
  'BT', VOLTAGE.BT,
  VOLTAGE.BT,
];

// ---- Transfo circles ----
export const transfoCirclePaint = {
  'circle-color': CLASSE_COLOR,
  'circle-radius': ['match', ['get', 'classe'], 'critique', 9, 'surcharge', 7, 5],
  'circle-stroke-width': ['match', ['get', 'classe'], 'critique', 2.5, 1],
  'circle-stroke-color': 'rgba(255,255,255,0.65)',
  'circle-opacity': 0.95,
};

// ---- Ligne lines ----
export const ligneLinePaint = {
  'line-color': CLASSE_COLOR,
  'line-width': ['match', ['get', 'classe'], 'critique', 5, 'surcharge', 3.5, 2],
  'line-opacity': 0.8,
};

// ---- Ligne current-flow overlay (signature electricity motif) ----
// A thin gold dashed line drawn above the base `ligne`. The dash offset is
// cycled imperatively (ant-march) in Map.jsx to make current appear to flow.
// Gold = energy/electricity accent ONLY (see tokens). Base dasharray below is
// the reduced-motion / initial frame; the rAF loop swaps frames.
export const ligneFlowPaint = {
  'line-color': BRAND.gold,
  'line-width': 2,
  'line-opacity': 0.9,
  'line-dasharray': [0, 4, 3],
};

// Dash-offset frames for the flowing-current ant-march (~12fps). Each frame keeps
// the same dash:gap total but shifts the leading transparent gap so the gold
// dashes appear to travel forward along the line.
export const LIGNE_FLOW_FRAMES = [
  [0, 4, 3], [1, 4, 2], [2, 4, 1], [3, 4, 0],
];

// ---- Poste (larger ringed circles) ----
export const posteCirclePaint = {
  'circle-color': COLOR.accent,
  'circle-radius': 8,
  'circle-stroke-width': 2.5,
  'circle-stroke-color': COLOR.bgBase,
  'circle-opacity': 0.9,
};

// ---- Point de service (tiny dots, high zoom) ----
export const pointServiceCirclePaint = {
  'circle-color': COLOR.textSecondary,
  'circle-radius': 2.5,
  'circle-stroke-width': 0.5,
  'circle-stroke-color': COLOR.bgBase,
  'circle-opacity': 0.85,
};

// ---- Support (tiny squares via square-ish small circles, very high zoom) ----
export const supportCirclePaint = {
  'circle-color': COLOR.textMuted,
  'circle-radius': 3,
  'circle-stroke-width': 0.5,
  'circle-stroke-color': COLOR.bgBase,
  'circle-opacity': 0.8,
};

// Heatmap of surcharges — weight by taux_charge over overloaded transfos.
export const surchargeHeatmapPaint = {
  'heatmap-weight': [
    'interpolate', ['linear'], ['coalesce', ['get', 'taux_charge'], 0],
    0, 0,
    80, 0.5,
    100, 0.85,
    150, 1,
  ],
  'heatmap-intensity': 1.1,
  'heatmap-radius': 28,
  'heatmap-opacity': 0.55,
  'heatmap-color': [
    'interpolate', ['linear'], ['heatmap-density'],
    0, 'rgba(0,0,0,0)',
    0.3, 'rgba(43,182,115,0.25)',
    0.55, 'rgba(245,165,36,0.45)',
    0.8, 'rgba(240,69,58,0.6)',
    1, 'rgba(240,69,58,0.9)',
  ],
};

// ---- Critique pulse ring (animated via rAF in Map.jsx) ----
// A soft expanding ring under the solid transfo marker. Radius/opacity are
// driven imperatively; these are just the static base paint props.
export const transfoCritiquePulsePaint = {
  'circle-color': LOAD.critique,
  'circle-radius': 10,
  'circle-opacity': 0,
  'circle-stroke-width': 0,
};

// Filter: only critique transformers get the pulse.
export const CRITIQUE_FILTER = ['==', ['get', 'classe'], 'critique'];

// Filter: show only surcharge + critique when enabled.
export const OVERLOADED_FILTER = ['in', ['get', 'classe'], ['literal', OVERLOADED_CLASSES]];

// ---- Recent infrastructure highlight (gold "energy" emphasis) ----
// Driven by date_mise_service >= cutoff (cutoff computed in Map.jsx from today).
// Features lacking the date property fall back to '' which sorts below any real
// ISO date → no halo, so this degrades gracefully if tiles omit the column.
export const recentFilter = (cutoffISO) => ['>=', ['coalesce', ['get', 'date_mise_service'], ''], cutoffISO];

// Gold ring placed UNDER point markers (transfo / poste) for recent assets.
export const recentRingPaint = {
  'circle-color': 'rgba(0,0,0,0)',
  'circle-radius': ['match', ['get', 'classe'], 'critique', 14, 'surcharge', 12, 11],
  'circle-stroke-width': 2.5,
  'circle-stroke-color': COLOR.energy,
  'circle-opacity': 0,
  'circle-stroke-opacity': 0.95,
  'circle-blur': 0.15,
};

// Gold casing under recent lignes.
export const recentLigneCasingPaint = {
  'line-color': COLOR.energy,
  'line-gap-width': ['match', ['get', 'classe'], 'critique', 5, 'surcharge', 3.5, 2],
  'line-width': 2.5,
  'line-opacity': 0.85,
};

export { LOAD, VOLTAGE, COLOR };
