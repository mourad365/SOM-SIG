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
// A thin electric-cyan dashed line drawn above the base `ligne`. The dash offset
// is cycled imperatively (ant-march) in Map.jsx to make current appear to flow.
// Electric cyan = energy/electricity accent ONLY (see tokens). Base dasharray
// below is the reduced-motion / initial frame; the rAF loop swaps frames.
export const ligneFlowPaint = {
  'line-color': BRAND.electricBright,
  'line-width': 2.2,
  'line-opacity': 0.95,
  'line-blur': 0.6,            // soft neon bloom — current glowing in the wire
  'line-dasharray': [0, 4, 3],
};

// Dash-offset frames for the flowing-current ant-march (~12fps). Each frame keeps
// the same dash:gap total but shifts the leading transparent gap so the cyan
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

// ---- Point de service / compteurs (tiny blue dots, very high zoom only) ----
// ~8k client meters. Blue, small, and strokeless on purpose: the old near-white
// stroke (bgBase) made each dot read as a pale halo, and en masse they buried the
// colored transfo/ligne load markers. No stroke + low opacity + small radius lets
// them recede; they only render at z≥15 (minzoom set in Map.jsx).
export const pointServiceCirclePaint = {
  'circle-color': BRAND.blue,
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 1.6, 19, 3],
  'circle-stroke-width': 0,
  'circle-opacity': 0.7,
};

// ---- Support (poteaux) — differentiated by fonction (color) + materiau (size) ----
// Couleur = fonction du poteau (support réseau, éclairage public, éclairage solaire, mixte).
// Taille = matériau (bois plus fin, béton standard, métal plus massif).
export const POTEAU_FONCTION = {
  support:           '#6B7280',   // gris — support BT standard
  eclairage_public:  '#F59E0B',   // ambre — éclairage public (réseau)
  eclairage_solaire: '#10B981',   // vert émeraude — éclairage solaire autonome
  mixte:             '#8B5CF6',   // violet — support + éclairage combinés
};

export const supportCirclePaint = {
  'circle-color': [
    'match', ['get', 'fonction'],
    'eclairage_public',  POTEAU_FONCTION.eclairage_public,
    'eclairage_solaire', POTEAU_FONCTION.eclairage_solaire,
    'mixte',             POTEAU_FONCTION.mixte,
    /* support / default */ POTEAU_FONCTION.support,
  ],
  'circle-radius': [
    'match', ['get', 'materiau'],
    'bois',  2.5,
    'beton', 3.5,
    'metal', 4,
    3,
  ],
  'circle-stroke-width': 1,
  'circle-stroke-color': 'rgba(255,255,255,0.7)',
  'circle-opacity': 0.9,
};

// ---- Quartiers (zones / lotissements — polygones réels) ----
// Remplissage très léger + contour pointillé bleu marque, en bas de pile pour ne
// pas masquer le réseau. Le libellé porte le nom du quartier.
export const quartierFillPaint = {
  'fill-color': COLOR.accent,
  'fill-opacity': 0.07,
};
export const quartierLinePaint = {
  'line-color': COLOR.accent,
  'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 2],
  'line-opacity': 0.55,
  'line-dasharray': [3, 2],
};
export const quartierLabelLayout = {
  'text-field': ['get', 'nom_quartier'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 14],
  'text-transform': 'uppercase',
  'text-letter-spacing': 0.05,
  'text-allow-overlap': false,
};
export const quartierLabelPaint = {
  'text-color': COLOR.accent,
  'text-halo-color': '#FFFFFF',
  'text-halo-width': 1.4,
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
// A radar-ping ring expanding under the solid transfo marker. Radius + stroke
// opacity are driven imperatively; these are just the static base paint props.
export const transfoCritiquePulsePaint = {
  'circle-color': 'rgba(0,0,0,0)',
  'circle-radius': 8,
  'circle-opacity': 0,
  'circle-stroke-width': 2,
  'circle-stroke-color': LOAD.critique,
  'circle-stroke-opacity': 0,
};

// Filter: only critique transformers get the pulse.
export const CRITIQUE_FILTER = ['==', ['get', 'classe'], 'critique'];

// Filter: show only surcharge + critique when enabled.
export const OVERLOADED_FILTER = ['in', ['get', 'classe'], ['literal', OVERLOADED_CLASSES]];

// ---- Recent infrastructure highlight (electric-cyan "energy" emphasis) ----
// Driven by date_mise_service >= cutoff (cutoff computed in Map.jsx from today).
// Features lacking the date property fall back to '' which sorts below any real
// ISO date → no halo, so this degrades gracefully if tiles omit the column.
export const recentFilter = (cutoffISO) => ['>=', ['coalesce', ['get', 'date_mise_service'], ''], cutoffISO];

// Electric-cyan ring placed UNDER point markers (transfo / poste) for recent assets.
export const recentRingPaint = {
  'circle-color': 'rgba(0,0,0,0)',
  'circle-radius': ['match', ['get', 'classe'], 'critique', 14, 'surcharge', 12, 11],
  'circle-stroke-width': 2.5,
  'circle-stroke-color': COLOR.energy,
  'circle-opacity': 0,
  'circle-stroke-opacity': 0.95,
  'circle-blur': 0.15,
};

// Electric-cyan casing under recent lignes.
export const recentLigneCasingPaint = {
  'line-color': COLOR.energy,
  'line-gap-width': ['match', ['get', 'classe'], 'critique', 5, 'surcharge', 3.5, 2],
  'line-width': 2.5,
  'line-opacity': 0.85,
};

export { LOAD, VOLTAGE, COLOR };
