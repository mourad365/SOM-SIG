import React, { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import Map from './map/Map.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import { TopBar } from './shell/TopBar.jsx';
import { LeftRail } from './shell/LeftRail.jsx';
import { Inspector } from './shell/Inspector.jsx';
import { Dock } from './ui/index.js';
import { getSearch } from './api.js';
import './shell/shell.css';

const DEFAULT_LAYERS = { poste: false, transfo: true, ligne: true, point_service: false, support: false };

function nowHHMM() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  // Map control state (lifted; passed to Map via props).
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [colorBy, setColorBy] = useState('charge');
  const [heatmap, setHeatmap] = useState(false);
  const [onlyOverloaded, setOnlyOverloaded] = useState(false);
  const [basemap, setBasemap] = useState('light');
  const [railCollapsed, setRailCollapsed] = useState(false);

  // Shell chrome state.
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  // Global data filters honored by both Map (setFilter) and Dashboard (/api/assets): {niveau_tension, statut, classe}.
  const [filters, setFilters] = useState({});
  const [updatedAt, setUpdatedAt] = useState(nowHHMM());
  const [refreshing, setRefreshing] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Inspector + map fly state.
  const [feature, setFeature] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [flyTo, setFlyTo] = useState(null);

  const toggleLayer = useCallback((key) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }, []);

  // Top-bar Critique/Surcharge chips set the global `classe` filter (toggle).
  const toggleFilter = useCallback((key) => {
    setFilters((f) => ({ ...f, classe: f.classe === key ? undefined : key }));
  }, []);

  // Open inspector + fly when coordinates are known.
  const selectFeature = useCallback((props) => {
    if (!props) return;
    setFeature(props);
    setInspectorOpen(true);
    if (props.lng != null && props.lat != null) setFlyTo([props.lng, props.lat]);
  }, []);

  // Map click already centers the view; just inspect.
  const handleMapSelect = useCallback((props) => {
    setFeature(props);
    setInspectorOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setUpdatedAt(nowHHMM());
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // Debounced global search → /api/search.
  useEffect(() => {
    if (!search || search.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      getSearch(search).then((r) => setSearchResults(Array.isArray(r) ? r : [])).catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const pickSearchResult = useCallback((r) => {
    selectFeature(r);
    setSearch('');
    setSearchResults([]);
  }, [selectFeature]);

  return (
    <div className="shell">
      <TopBar
        search={search}
        onSearch={setSearch}
        searchResults={searchResults}
        onPickResult={pickSearchResult}
        activeFilters={{ critique: filters.classe === 'critique', surcharge: filters.classe === 'surcharge' }}
        onToggleFilter={toggleFilter}
        updatedAt={updatedAt}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <div className="shell-main">
        <LeftRail
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((v) => !v)}
          layers={layers}
          onToggleLayer={toggleLayer}
          colorBy={colorBy}
          onColorBy={setColorBy}
          heatmap={heatmap}
          onHeatmap={setHeatmap}
          onlyOverloaded={onlyOverloaded}
          onOnlyOverloaded={setOnlyOverloaded}
          basemap={basemap}
          onBasemap={setBasemap}
        />

        <div className="shell-mapwrap">
          <Map
            layers={layers}
            colorBy={colorBy}
            heatmap={heatmap}
            onlyOverloaded={onlyOverloaded}
            filters={filters}
            basemap={basemap}
            flyTo={flyTo}
            onSelectFeature={handleMapSelect}
          />
        </div>
      </div>

      <Dock
        open={dockOpen}
        onToggle={() => setDockOpen((v) => !v)}
        title="Tableau de bord"
        icon={<LayoutDashboard size={14} />}
      >
        <Dashboard filters={filters} onSelect={selectFeature} refreshKey={refreshKey} />
      </Dock>

      <Inspector
        feature={feature}
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        onFlyTo={(c) => setFlyTo([...c])}
      />
    </div>
  );
}
