import React, { useState } from 'react';
import Map from './map/Map.jsx';

export default function App() {
  const [flyTo, setFlyTo] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100vh', fontFamily: 'Arial' }}>
      <Map flyTo={flyTo} />
      <aside style={{ borderLeft: '1px solid #eee', overflow: 'auto' }}>
        {/* Dashboard mounted in Task 10 */}
        <h1 style={{ fontSize: 18, padding: 16 }}>SIG SOMELEC</h1>
      </aside>
    </div>
  );
}
