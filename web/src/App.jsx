import React, { useEffect, useState } from 'react';
import { getKpi } from './api.js';

export default function App() {
  const [kpi, setKpi] = useState(null);
  useEffect(() => { getKpi().then(setKpi).catch(() => setKpi({ error: true })); }, []);
  return (
    <div style={{ fontFamily: 'Arial', padding: 24 }}>
      <h1>SIG SOMELEC — Surcharge réseau</h1>
      {kpi?.error ? <p>Données indisponibles</p>
        : kpi ? <p>Transformateurs suivis : {kpi.total}</p>
        : <p>Chargement…</p>}
    </div>
  );
}
