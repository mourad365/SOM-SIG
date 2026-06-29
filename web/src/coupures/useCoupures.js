import { useCallback, useEffect, useState } from 'react';
import { getCoupures, getFiabilite, cloturerCoupure } from '../api.js';

// Coquille impérative du registre : journal filtré + indices de fiabilité, façon App.
// `externalKey` force un rechargement depuis l'extérieur (ex. après une déclaration faite
// depuis l'Inspecteur). `filtre` = { statut, type, source }.
export function useCoupures(externalKey = 0) {
  const [coupures, setCoupures] = useState([]);
  const [fiabilite, setFiabilite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtre, setFiltre] = useState({});
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    // Le cockpit ne dépend que de `source` ; le journal honore tout le filtre.
    Promise.all([getCoupures(filtre), getFiabilite(filtre.source ? { source: filtre.source } : {})])
      .then(([cs, f]) => {
        if (!alive) return;
        setCoupures(Array.isArray(cs) ? cs : []);
        setFiabilite(f && !f.error ? f : null);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filtre, tick, externalKey]);

  const cloturer = useCallback(async (id, fin) => {
    const r = await cloturerCoupure(id, fin);
    if (r && !r.error) refresh();
    return r;
  }, [refresh]);

  return { coupures, fiabilite, loading, error, filtre, setFiltre, refresh, cloturer };
}
