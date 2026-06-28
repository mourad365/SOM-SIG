import { useCallback, useMemo, useState } from 'react';
import { computeCharge } from '../sim/load.js';

// Contrôleur du bac à sable « what-if ».
//
// État OVERLAY UNIQUEMENT — aucune écriture DB, aucune mutation des tuiles vectorielles.
// Les tuiles n'exposent pas puiss_souscrite_kw / transfo_id sur les points de service,
// donc le bac à sable construit son PROPRE petit monde : on « capture » dans l'overlay
// les actifs cliqués (transfo → kVA ; point → kW + rattachement), puis on rejoue la
// formule de charge (cœur pur `computeCharge`) en direct pour recolorer.
//
// Modes d'interaction :
//   - 'idle'        : cliquer un transfo le capture et le sélectionne ; cliquer un point
//                     le capture, demande sa puissance souscrite et le rattache au transfo
//                     sélectionné.
//   - 'add-transfo' : le prochain clic carte ajoute un transformateur (saisie kVA).
//
// Identifiants overlay préfixés pour ne jamais entrer en collision avec les ids réels.
let seq = 0;
const nextId = (prefix) => `${prefix}-${++seq}`;

export function useWhatIf() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('idle'); // 'idle' | 'add-transfo'
  const [transfos, setTransfos] = useState([]); // [{ id, code, puissance_kva, lng, lat, source }]
  const [points, setPoints] = useState([]);     // [{ id, transfo_id, puiss_souscrite_kw, lng, lat, source }]
  const [selectedTransfoId, setSelectedTransfoId] = useState(null);

  const reset = useCallback(() => {
    setMode('idle');
    setTransfos([]);
    setPoints([]);
    setSelectedTransfoId(null);
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled((on) => {
      if (on) reset(); // sortir du bac à sable efface l'overlay
      return !on;
    });
  }, [reset]);

  // Ajoute (capture) un transformateur dans l'overlay et le sélectionne. Idempotent par id.
  const addTransfo = useCallback(({ id, code, puissance_kva, lng, lat, source = 'ajout' }) => {
    const tid = id ?? nextId('wt-tr');
    setTransfos((list) => {
      if (list.some((t) => t.id === tid)) return list;
      return [...list, { id: tid, code: code || tid, puissance_kva, lng, lat, source }];
    });
    setSelectedTransfoId(tid);
    return tid;
  }, []);

  // Ajoute / rattache un point de service au transfo cible (ou au transfo sélectionné).
  const addPoint = useCallback(({ id, transfo_id, puiss_souscrite_kw, lng, lat, source = 'ajout' }) => {
    const pid = id ?? nextId('wt-ps');
    setPoints((list) => {
      const others = list.filter((p) => p.id !== pid); // réaffectation = remplacement
      return [...others, { id: pid, transfo_id, puiss_souscrite_kw, lng, lat, source }];
    });
    return pid;
  }, []);

  // Réaffecte tous les points capturés du transfo sélectionné non concerné — utilitaire
  // pour la démo : déplace `count` points du transfo `fromId` vers `toId`.
  const reassignPoints = useCallback((fromId, toId) => {
    setPoints((list) => list.map((p) => (p.transfo_id === fromId ? { ...p, transfo_id: toId } : p)));
  }, []);

  // Recalcul live de la classe par transfo (cœur pur, identique au SQL).
  const charge = useMemo(
    () => computeCharge(transfos.map((t) => ({ id: t.id, puissance_kva: t.puissance_kva })), points),
    [transfos, points],
  );

  // Source GeoJSON overlay : transfos (recolorés via la classe recalculée) + points.
  const geojson = useMemo(() => {
    const features = [];
    for (const t of transfos) {
      if (t.lng == null || t.lat == null) continue;
      const c = charge.get(t.id) || {};
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
        properties: {
          kind: 'transfo',
          id: String(t.id),
          code: t.code,
          classe: c.classe || 'inconnu',
          taux_charge: c.taux == null ? null : Math.round(c.taux * 100),
          puissance_kva: t.puissance_kva,
          selected: t.id === selectedTransfoId,
        },
      });
    }
    for (const p of points) {
      if (p.lng == null || p.lat == null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { kind: 'point', id: String(p.id), transfo_id: String(p.transfo_id) },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [transfos, points, charge, selectedTransfoId]);

  return {
    enabled, toggleEnabled,
    mode, setMode,
    transfos, points, selectedTransfoId, setSelectedTransfoId,
    addTransfo, addPoint, reassignPoints, reset,
    charge, geojson,
  };
}
