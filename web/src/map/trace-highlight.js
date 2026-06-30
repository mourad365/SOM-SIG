// Surbrillance de traçabilité (Chantier 1). Couches dédiées pilotées par le
// feature-state `highlighted` afin de NE PAS restyler les couches existantes.
// Couleurs = tokens uniquement (COLOR.energy = cyan électrique d'accentuation,
// distinct des couleurs de charge ; BRAND.blue pour le poste racine).
import { BRAND, COLOR } from '../theme/tokens.js';

// Couches sources concernées par la trace -> id-field (== promoteId de la source).
export const TRACE_SOURCE_LAYERS = {
  transfo: 'transfo_id',
  ligne: 'ligne_id',
  poste: 'poste_id',
  point_service: 'point_id',
};

// Mappe une clé d'`affected` (postes/transfos/lignes/points) -> couche source.
const AFFECTED_TO_SOURCE = {
  postes: 'poste', transfos: 'transfo', lignes: 'ligne', points: 'point_service',
};

const HL_PREFIX = 'trace-hl-';

// opacité conditionnée au feature-state : visible seulement si highlighted == true.
const stateOpacity = (on, off) => ['case', ['boolean', ['feature-state', 'highlighted'], false], on, off];

// Ajoute (idempotent) les couches de surbrillance au-dessus des couches réseau.
export function addTraceHighlightLayers(map) {
  const add = (id, def) => { if (!map.getLayer(id)) map.addLayer(def); };

  // Halo cyan électrique au niveau des transfos affectés.
  add(`${HL_PREFIX}transfo`, {
    id: `${HL_PREFIX}transfo`, type: 'circle', source: 'transfo', 'source-layer': 'transfo',
    paint: {
      'circle-radius': 12,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': COLOR.energy,
      'circle-stroke-width': 3,
      'circle-stroke-opacity': stateOpacity(0.95, 0),
      'circle-opacity': 0,
    },
  });

  // Lignes affectées épaissies en cyan électrique.
  add(`${HL_PREFIX}ligne`, {
    id: `${HL_PREFIX}ligne`, type: 'line', source: 'ligne', 'source-layer': 'ligne',
    paint: {
      'line-color': COLOR.energy,
      'line-width': 6,
      'line-opacity': stateOpacity(0.85, 0),
    },
  });

  // Poste racine : anneau bleu marqué.
  add(`${HL_PREFIX}poste`, {
    id: `${HL_PREFIX}poste`, type: 'circle', source: 'poste', 'source-layer': 'poste',
    paint: {
      'circle-radius': 16,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': BRAND.blue,
      'circle-stroke-width': 3,
      'circle-stroke-opacity': stateOpacity(0.95, 0),
      'circle-opacity': 0,
    },
  });

  // Points de service affectés (petits points pleins, accentués).
  // NB : le contour (stroke) DOIT être conditionné au feature-state comme le fond,
  // sinon l'anneau blanc se dessine pour TOUS les compteurs de la source (≈8k),
  // pas seulement les points affectés → masse blanche couvrant le réseau.
  add(`${HL_PREFIX}point_service`, {
    id: `${HL_PREFIX}point_service`, type: 'circle', source: 'point_service', 'source-layer': 'point_service',
    paint: {
      'circle-radius': 4,
      'circle-color': COLOR.energy,
      'circle-stroke-color': COLOR.bgSurface,
      'circle-stroke-width': 1,
      'circle-opacity': stateOpacity(0.95, 0),
      'circle-stroke-opacity': stateOpacity(0.95, 0),
    },
  });
}

// Efface l'état `highlighted` pour un ensemble d'ids donné.
function clearState(map, affected) {
  if (!affected) return;
  for (const [key, source] of Object.entries(AFFECTED_TO_SOURCE)) {
    const ids = affected[key];
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      try { map.setFeatureState({ source, sourceLayer: source, id }, { highlighted: false }); } catch { /* tuile non chargée */ }
    }
  }
}

// Applique `highlighted=true` sur les ids de `next`, après avoir effacé `prev`.
// `prev`/`next` ont la forme `affected` du contrat : {postes,transfos,lignes,points}.
export function applyTraceHighlight(map, prev, next) {
  clearState(map, prev);
  if (!next) return;
  for (const [key, source] of Object.entries(AFFECTED_TO_SOURCE)) {
    const ids = next[key];
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      try { map.setFeatureState({ source, sourceLayer: source, id }, { highlighted: true }); } catch { /* tuile non chargée */ }
    }
  }
}

// Réapplique la surbrillance quand de nouvelles tuiles arrivent (fly-to, zoom) :
// le feature-state vit par tuile et est perdu au (re)chargement. `getActive`
// fournit l'ensemble `affected` courant (ou null). Idempotent / lié une fois.
export function bindTraceRestore(map, getActive) {
  map.on('sourcedata', (e) => {
    if (!e.isSourceLoaded) return;
    if (!(e.sourceId in TRACE_SOURCE_LAYERS)) return;
    const active = getActive();
    if (active) applyTraceHighlight(map, null, active);
  });
}

// Montre les couches de surbrillance seulement quand une trace est active.
// (Indépendant des toggles de couches : on veut voir l'impact même si la couche
// parente est masquée, mais on respecte le point_service qui n'apparaît qu'au zoom.)
export function syncTraceHighlightVisibility(map, active, _layers) {
  const on = !!active;
  for (const source of Object.keys(TRACE_SOURCE_LAYERS)) {
    const id = `${HL_PREFIX}${source}`;
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
}
