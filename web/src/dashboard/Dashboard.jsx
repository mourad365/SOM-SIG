import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '../ui/index.js';
import KpiStrip from './KpiStrip.jsx';
import Charts from './Charts.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import './dashboard.css';

// Skeleton that mirrors the real dashboard layout (KPI bank · 3 charts · alerts),
// so the load feels like the console booting up rather than a spinner stall.
function DashboardSkeleton() {
  return (
    <div className="dash" aria-busy="true" aria-label="Chargement du tableau de bord">
      <section className="dash-kpis">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="kpi-skel">
            <span className="skel skel--text" style={{ width: '55%' }} />
            <span className="skel" style={{ width: '72%', height: 24 }} />
          </div>
        ))}
      </section>
      <div className="dash-charts">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="ui-panel dash-panel">
            <div className="ui-panel__head"><span className="skel skel--text" style={{ width: 130 }} /></div>
            <div className="ui-panel__body"><span className="skel dash-chart-skel" /></div>
          </div>
        ))}
      </div>
      <div className="ui-panel">
        <div className="ui-panel__head"><span className="skel skel--text" style={{ width: 96 }} /></div>
        <div className="ui-panel__body dash-rows-skel">
          {Array.from({ length: 5 }).map((_, i) => <span key={i} className="skel" style={{ height: 18 }} />)}
        </div>
      </div>
    </div>
  );
}

// Tableau de bord view — presentational. Data is fetched once in App and passed in.
// Props: { stats, histogramme, alertes, loading, error, onSelect }.
export default function Dashboard({ stats, histogramme = [], alertes = [], loading, error, onSelect }) {
  if (error) {
    return (
      <div className="dash">
        <EmptyState
          icon={<AlertTriangle size={38} strokeWidth={1.5} />}
          message="Données indisponibles — réessayez via Actualiser"
        />
      </div>
    );
  }
  if (loading) return <DashboardSkeleton />;

  return (
    <div className="dash">
      <KpiStrip stats={stats} loading={loading} />
      <Charts histogramme={histogramme} alertes={alertes} stats={stats} />
      <AlertsPanel alertes={alertes} onSelect={onSelect} />
    </div>
  );
}
