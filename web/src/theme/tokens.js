// SIG SOMELEC design tokens for JS consumers (MapLibre paint, Recharts, gauges).
// Mirrors web/src/theme/tokens.css — LIGHT, brand-aligned. Color = signal.

export const LOAD = {
  normal:    '#16A34A',
  surcharge: '#E0820C',
  critique:  '#DC2626',
  inconnu:   '#94A3B8',
};

export const LOAD_LABEL = {
  normal:    'Normal',
  surcharge: 'Surcharge (≥80%)',
  critique:  'Critique (≥100%)',
  inconnu:   'Inconnu',
};

// SOMELEC brand. blue = interactive/chrome; electric cyan (energy) = electricity motif only.
export const BRAND = {
  blue: '#0E5BA6',
  blueDeep: '#0A4682',
  electric: '#08AEC8',
  electricBright: '#2BD4EC', // lit current packet on the line flow
  electricDeep: '#0B7C97',
};

export const COLOR = {
  bgBase: '#F4F7FB',
  bgSurface: '#FFFFFF',
  bgSurface2: '#EEF3F9',
  border: 'rgba(16,33,61,0.12)',
  textPrimary: '#14223A',
  textSecondary: '#4A5A72',
  textMuted: '#8493A7',
  accent: '#0E5BA6',
  energy: '#08AEC8',
  energyBright: '#2BD4EC',
  grid: 'rgba(16,33,61,0.07)',
};

// Voltage-level palette (cool, readable on white). NOT load colors.
export const VOLTAGE = {
  HTA33: '#1D5FA8',
  HTA15: '#1AA0A0',
  BT:    '#7C8AA0',
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
