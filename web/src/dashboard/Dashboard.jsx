import React from 'react';
import { Spinner, EmptyState } from '../ui/index.js';
import KpiStrip from './KpiStrip.jsx';
import Charts from './Charts.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import './dashboard.css';

// Tableau de bord view — presentational. Data is fetched once in App and passed in.
// Props: { stats, histogramme, alertes, loading, error, onSelect }.
export default function Dashboard({ stats, histogramme = [], alertes = [], loading, error, onSelect }) {
  if (error) return <div className="dash"><EmptyState message="Données indisponibles" /></div>;
  if (loading) return <div className="dash dash-center"><Spinner /></div>;

  return (
    <div className="dash">
      <KpiStrip stats={stats} loading={loading} />
      <Charts histogramme={histogramme} alertes={alertes} stats={stats} />
      <AlertsPanel alertes={alertes} onSelect={onSelect} />
    </div>
  );
}
