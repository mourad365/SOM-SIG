import React, { useCallback, useEffect, useState } from 'react';
import Map from './map/Map.jsx';
import MapAlerts from './map/MapAlerts.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import AssetsTable from './dashboard/AssetsTable.jsx';
import { TopBar } from './shell/TopBar.jsx';
import { LeftRail } from './shell/LeftRail.jsx';
import { Inspector } from './shell/Inspector.jsx';
import { getSearch, getStats, getHistogramme, getAlertes, geocodePlace } from './api.js';
import { parseCoord } from './map/coords.js';
import './shell/shell.css';

const DEFAULT_LAYERS = { poste: false, transfo: true, ligne: true, point_service: false, support: false };

function nowHHMM() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  // Top-level view: one job per screen (no longer all stacked).
  const [view, setView] = useState('carte'); // 'carte' | 'tableau' | 'actifs'

  // Map control state (lifted; passed to Map via props).
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [colorBy, setColorBy] = useState('charge');
  const [heatmap, setHeatmap] = useState(false);
  const [onlyOverloaded, setOnlyOverloaded] = useState(false);
  const [basemap, setBasemap] = useState('map');
  const [language, setLanguage] = useState('fr'); // map label language: 'fr' (latin) | 'ar'
  const [showRecent, setShowRecent] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  // Shell chrome state.
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  // Global data filters honored by Map (setFilter) and the Actifs table (/api/assets): {niveau_tension, statut, classe}.
  const [filters, setFilters] = useState({});
  const [updatedAt, setUpdatedAt] = useState(nowHHMM());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Dashboard data — fetched once at the top so both the Tableau view and the
  // Carte floating-alerts share it (no duplicate fetches).
  const [stats, setStats] = useState(null);
  const [histogramme, setHistogramme] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(false);

  // Inspector + map fly state.
  const [feature, setFeature] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [flyTo, setFlyTo] = useState(null);

  useEffect(() => {
    let alive = true;
    setDataLoading(true);
    setDataError(false);
    Promise.all([getStats(), getHistogramme(), getAlertes()])
      .then(([s, h, a]) => {
        if (!alive) return;
        setStats(s);
        setHistogramme(Array.isArray(h) ? h : []);
        setAlertes(Array.isArray(a) ? a : []);
      })
      .catch(() => { if (alive) setDataError(true); })
      .finally(() => { if (alive) setDataLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const toggleLayer = useCallback((key) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }, []);

  const toggleFilter = useCallback((key) => {
    setFilters((f) => ({ ...f, classe: f.classe === key ? undefined : key }));
  }, []);

  // Selecting from any view (alert, table row, search) → jump to the map, fly, inspect.
  const selectFeature = useCallback((props) => {
    if (!props) return;
    setView('carte');
    setFeature(props);
    setInspectorOpen(true);
    if (props.lng != null && props.lat != null) setFlyTo([props.lng, props.lat]);
  }, []);

  // Map click is already on the Carte view and centered; just inspect.
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

  // Debounced global search: coordinates (instant) + asset codes (/api/search) +
  // place names (Nominatim). Results merged into one ranked list.
  useEffect(() => {
    if (!search || search.trim().length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      // A typed coordinate jumps straight to the point — surfaced first.
      const coord = parseCoord(search);
      const coordRow = coord
        ? [{ type: 'coord', id: 'coord', code: 'Aller au point',
             label: `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`, lng: coord.lng, lat: coord.lat }]
        : [];
      Promise.all([
        getSearch(search).then((r) => (Array.isArray(r) ? r : [])).catch(() => []),
        geocodePlace(search).catch(() => []),
      ]).then(([assets, places]) => {
        if (cancelled) return;
        setSearchResults([...coordRow, ...assets, ...places]);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const pickSearchResult = useCallback((r) => {
    selectFeature(r);
    setSearch('');
    setSearchResults([]);
  }, [selectFeature]);

  const alertCount = alertes.length;

  return (
    <div className="shell">
      <TopBar
        view={view}
        onView={setView}
        alertCount={alertCount}
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

      {view === 'carte' && (
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
            language={language}
            onLanguage={setLanguage}
            showRecent={showRecent}
            onShowRecent={setShowRecent}
          />
          <div className="shell-mapwrap">
            <Map
              layers={layers}
              colorBy={colorBy}
              heatmap={heatmap}
              onlyOverloaded={onlyOverloaded}
              filters={filters}
              basemap={basemap}
              language={language}
              showRecent={showRecent}
              flyTo={flyTo}
              onSelectFeature={handleMapSelect}
            />
            <MapAlerts alertes={alertes} onSelect={selectFeature} />
          </div>
        </div>
      )}

      {view === 'tableau' && (
        <div className="shell-view">
          <Dashboard
            stats={stats}
            histogramme={histogramme}
            alertes={alertes}
            loading={dataLoading}
            error={dataError}
            onSelect={selectFeature}
          />
        </div>
      )}

      {view === 'actifs' && (
        <div className="shell-view shell-view--pad">
          <h1 className="view-title">Actifs du réseau</h1>
          <AssetsTable filters={filters} onSelect={selectFeature} />
        </div>
      )}

      <Inspector
        feature={feature}
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        onFlyTo={(c) => setFlyTo([...c])}
      />
    </div>
  );
}
