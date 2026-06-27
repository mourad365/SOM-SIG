import React, { useEffect, useState } from 'react';
import { Tabs, Spinner, EmptyState } from '../ui/index.js';
import { getStats, getHistogramme, getAlertes } from '../api.js';
import KpiStrip from './KpiStrip.jsx';
import Charts from './Charts.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import AssetsTable from './AssetsTable.jsx';
import './dashboard.css';

const TABS = [
  { value: 'overview', label: "Vue d'ensemble" },
  { value: 'assets', label: 'Actifs' },
];

// Props (from App): { filters, onSelect }. refreshKey re-fetches overview data.
export default function Dashboard({ filters = {}, onSelect, refreshKey = 0 }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [histogramme, setHistogramme] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    Promise.all([getStats(), getHistogramme(), getAlertes()])
      .then(([s, h, a]) => {
        if (!alive) return;
        setStats(s);
        setHistogramme(Array.isArray(h) ? h : []);
        setAlertes(Array.isArray(a) ? a : []);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  return (
    <div className="dash">
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="dash-tabs" />

      {tab === 'overview' && (
        error ? (
          <EmptyState message="Données indisponibles" />
        ) : loading ? (
          <div className="dash-center"><Spinner /></div>
        ) : (
          <>
            <KpiStrip stats={stats} loading={loading} />
            <Charts histogramme={histogramme} alertes={alertes} stats={stats} />
            <AlertsPanel alertes={alertes} onSelect={onSelect} />
          </>
        )
      )}

      {tab === 'assets' && (
        <AssetsTable filters={filters} onSelect={onSelect} />
      )}
    </div>
  );
}
