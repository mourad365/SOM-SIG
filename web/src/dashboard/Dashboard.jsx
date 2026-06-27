import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getKpi, getTopSurcharges } from '../api.js';

const BINS = ['<50%', '50-80%', '80-100%', '>100%'];
function bin(taux) {
  if (taux == null) return null;
  if (taux < 0.5) return BINS[0]; if (taux < 0.8) return BINS[1];
  if (taux < 1.0) return BINS[2]; return BINS[3];
}

export default function Dashboard({ onSelect }) {
  const [kpi, setKpi] = useState(null);
  const [top, setTop] = useState([]);
  useEffect(() => {
    getKpi().then(setKpi).catch(() => setKpi({ error: true }));
    getTopSurcharges().then(setTop).catch(() => setTop([]));
  }, []);

  const histo = BINS.map(b => ({ bin: b, n: top.filter(t => bin(Number(t.taux_charge)) === b).length }));

  return (
    <div style={{ padding: 16, font: '13px Arial' }}>
      <h1 style={{ fontSize: 18 }}>SIG SOMELEC — Surcharge</h1>
      {kpi?.error && <p>Données indisponibles</p>}
      {kpi && !kpi.error && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
          <Card label="Total" value={kpi.total} />
          <Card label="Critique" value={kpi.byClasse?.critique || 0} color="#d7191c" />
          <Card label="Surcharge" value={kpi.byClasse?.surcharge || 0} color="#fdae61" />
          <Card label="Normal" value={kpi.byClasse?.normal || 0} color="#1a9641" />
        </div>
      )}

      <h2 style={{ fontSize: 14 }}>Top surcharges</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th align="left">Transfo</th><th align="right">Charge</th></tr></thead>
        <tbody>
          {top.map(t => (
            <tr key={t.code_actif} style={{ cursor: 'pointer' }} onClick={() => onSelect(t)}>
              <td>{t.code_actif}</td>
              <td align="right" style={{ color: Number(t.taux_charge) >= 1 ? '#d7191c' : '#b35900' }}>
                {Math.round(Number(t.taux_charge) * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, marginTop: 16 }}>Répartition de charge</h2>
      <div style={{ height: 160 }}>
        <ResponsiveContainer><BarChart data={histo}>
          <XAxis dataKey="bin" /><YAxis allowDecimals={false} /><Tooltip />
          <Bar dataKey="n" fill="#7b78d6" />
        </BarChart></ResponsiveContainer>
      </div>
    </div>
  );
}

function Card({ label, value, color }) {
  return <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
    <div style={{ color: '#666' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 600, color: color || '#1a1a1a' }}>{value}</div>
  </div>;
}
