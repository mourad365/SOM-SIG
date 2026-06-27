export const CLASSE_COLOR = [
  'match', ['get', 'classe'],
  'critique', '#d7191c',
  'surcharge', '#fdae61',
  'normal', '#1a9641',
  /* inconnu / other */ '#9e9e9e',
];

export const transfoCirclePaint = {
  'circle-color': CLASSE_COLOR,
  'circle-radius': [
    'match', ['get', 'classe'],
    'critique', 11, 'surcharge', 8, 6,
  ],
  'circle-stroke-width': ['match', ['get', 'classe'], 'critique', 3, 1],
  'circle-stroke-color': '#7a0000',
  'circle-opacity': 0.9,
};

export const ligneLinePaint = {
  'line-color': CLASSE_COLOR,
  'line-width': ['match', ['get', 'classe'], 'critique', 6, 'surcharge', 4, 2],
  'line-opacity': 0.85,
};

// Filter expression: show only surcharge + critique when enabled.
export const OVERLOADED_FILTER = ['in', ['get', 'classe'], ['literal', ['surcharge', 'critique']]];
