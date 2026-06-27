import React, { useState } from 'react';
import Map from './map/Map.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import { getAsset } from './api.js';

export default function App() {
  const [flyTo, setFlyTo] = useState(null);
  async function handleSelect(row) {
    // Minimal: query the asset detail then center on its rendered feature if present.
    const a = await getAsset('transfo', row.transfo_id ?? 0).catch(() => null);
    if (a && a.lng && a.lat) setFlyTo([a.lng, a.lat]);
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100vh', fontFamily: 'Arial' }}>
      <Map flyTo={flyTo} />
      <aside style={{ borderLeft: '1px solid #eee', overflow: 'auto' }}>
        <Dashboard onSelect={handleSelect} />
      </aside>
    </div>
  );
}
