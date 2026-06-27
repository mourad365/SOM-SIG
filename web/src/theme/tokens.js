// SIG SOMELEC design tokens for JS consumers (MapLibre paint, Recharts, gauges).
// Mirrors web/src/theme/tokens.css. Keep in sync. Color = signal.

export const LOAD = {
  normal:    '#2BB673',
  surcharge: '#F5A524',
  critique:  '#F0453A',
  inconnu:   '#5A6473',
};

export const LOAD_LABEL = {
  normal:    'Normal',
  surcharge: 'Surcharge (≥80%)',
  critique:  'Critique (≥100%)',
  inconnu:   'Inconnu',
};

export const COLOR = {
  bgBase: '#0B0E14',
  bgSurface: '#131722',
  bgSurface2: '#1C212E',
  border: 'rgba(255,255,255,0.12)',
  textPrimary: '#E6E9EF',
  textSecondary: '#9AA4B2',
  textMuted: '#687185',
  accent: '#38BDF8',
  grid: 'rgba(255,255,255,0.06)',
};

// Voltage-level palette (used for "color by voltage" mode + line dash). Neutral-cool, NOT load colors.
export const VOLTAGE = {
  HTA33: '#7CA9D6',
  HTA15: '#56D0C9',
  BT:    '#B8C2D0',
};

// MapLibre data-driven expressions ------------------------------------------------
// classe -> color, used by both transfo circles and ligne lines.
export const classeColorExpr = [
  'match', ['get', 'classe'],
  'critique', LOAD.critique,
  'surcharge', LOAD.surcharge,
  'normal', LOAD.normal,
  /* inconnu / default */ LOAD.inconnu,
];

export const OVERLOADED_CLASSES = ['surcharge', 'critique'];

// Recharts shared theme bits
export const chartAxis = { stroke: COLOR.textMuted, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' };
