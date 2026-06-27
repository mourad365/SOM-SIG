// Map paint expressions — token-driven (see theme/tokens.js). Color = load signal only.
import { classeColorExpr, OVERLOADED_CLASSES, VOLTAGE } from '../theme/tokens.js';

export const CLASSE_COLOR = classeColorExpr;

// Color-by-voltage expression (neutral cool palette, NOT load colors).
export const voltageColorExpr = [
  'match', ['get', 'niveau_tension'],
  'HTA33', VOLTAGE.HTA33,
  'HTA15', VOLTAGE.HTA15,
  'BT', VOLTAGE.BT,
  VOLTAGE.BT,
];

export const transfoCirclePaint = {
  'circle-color': CLASSE_COLOR,
  'circle-radius': ['match', ['get', 'classe'], 'critique', 9, 'surcharge', 7, 5],
  'circle-stroke-width': ['match', ['get', 'classe'], 'critique', 2.5, 1],
  'circle-stroke-color': 'rgba(255,255,255,0.65)',
  'circle-opacity': 0.95,
};

export const ligneLinePaint = {
  'line-color': CLASSE_COLOR,
  'line-width': ['match', ['get', 'classe'], 'critique', 5, 'surcharge', 3.5, 2],
  'line-opacity': 0.8,
};

// Heatmap of surcharges — weight by overloaded classes.
export const surchargeHeatmapPaint = {
  'heatmap-weight': ['match', ['get', 'classe'], 'critique', 1, 'surcharge', 0.6, 0],
  'heatmap-intensity': 1.1,
  'heatmap-radius': 28,
  'heatmap-opacity': 0.55,
  'heatmap-color': [
    'interpolate', ['linear'], ['heatmap-density'],
    0, 'rgba(0,0,0,0)',
    0.4, 'rgba(245,165,36,0.35)',
    0.8, 'rgba(240,69,58,0.55)',
    1, 'rgba(240,69,58,0.85)',
  ],
};

// Filter: show only surcharge + critique when enabled.
export const OVERLOADED_FILTER = ['in', ['get', 'classe'], ['literal', OVERLOADED_CLASSES]];
