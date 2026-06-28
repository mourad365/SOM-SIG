import { useCallback, useRef, useState } from 'react';
import { getTrace } from '../api.js';

// Types d'actifs traçables (chaîne FK poste→transfo→point ; ligne→transfo).
export const TRACEABLE = ['poste', 'transfo', 'ligne'];

// Hook de traçabilité : lance une trace pour un actif, expose l'état (loading,
// data, error) et les ids affectés. `run(type, id)` ; `clear()` réinitialise.
// Coquille impérative minimale au-dessus du client api existant (web/src/api.js).
export function useTrace() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reqRef = useRef(0); // garde anti-course : seul le dernier appel gagne.

  const run = useCallback((type, id, direction = 'down') => {
    if (!TRACEABLE.includes(type) || id == null) return Promise.resolve(null);
    const seq = ++reqRef.current;
    setLoading(true);
    setError(false);
    return getTrace(type, id, direction)
      .then((d) => {
        if (seq !== reqRef.current) return null; // appel obsolète
        if (!d || d.error) { setError(true); setData(null); return null; }
        setData(d);
        return d;
      })
      .catch(() => { if (seq === reqRef.current) { setError(true); setData(null); } return null; })
      .finally(() => { if (seq === reqRef.current) setLoading(false); });
  }, []);

  const clear = useCallback(() => { reqRef.current++; setData(null); setError(false); setLoading(false); }, []);

  return { data, loading, error, run, clear };
}
