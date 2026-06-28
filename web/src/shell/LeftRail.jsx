import React from 'react';
import { PanelLeftClose, PanelLeftOpen, Layers } from 'lucide-react';
import { Toggle, Segmented, Select, Legend, Button } from '../ui/index.js';
import './shell.css';

// Les clés restent le contrat des tuiles (cf. ADR 0007) ; seuls les libellés
// suivent le modèle MCD : poste source, compteurs, poteaux.
const LAYER_DEFS = [
  { key: 'poste', label: 'Postes source' },
  { key: 'transfo', label: 'Transformateurs' },
  { key: 'ligne', label: 'Lignes BT' },
  { key: 'point_service', label: 'Compteurs' },
  { key: 'support', label: 'Poteaux' },
];

const BASEMAPS = [
  { value: 'map', label: 'Carte' },
  { value: 'osm', label: 'OpenStreetMap' },
  { value: 'satellite', label: 'Satellite' },
];

const COLOR_MODES = [
  { value: 'charge', label: 'Charge' },
  { value: 'tension', label: 'Tension' },
];

const LANGUAGES = [
  { value: 'fr', label: 'Latin' },
  { value: 'ar', label: 'العربية' },
];

export function LeftRail({
  collapsed, onToggleCollapse,
  layers, onToggleLayer,
  colorBy, onColorBy,
  heatmap, onHeatmap,
  onlyOverloaded, onOnlyOverloaded,
  basemap, onBasemap,
  language, onLanguage,
  showRecent, onShowRecent,
}) {
  return (
    <nav className={`shell-rail ${collapsed ? 'shell-rail--collapsed' : ''}`} aria-label="Panneau de couches">
      <div className="shell-rail__top">
        {!collapsed && <span className="caps" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Layers size={14} /> Couches</span>}
        <Button
          variant="icon" size="sm"
          aria-label={collapsed ? 'Déplier le panneau' : 'Replier le panneau'}
          onClick={onToggleCollapse}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>

      <div className="shell-rail__body">
        <section className="shell-rail-section">
          <div className="shell-rail-section__rows">
            {LAYER_DEFS.map((l) => (
              <Toggle
                key={l.key}
                label={l.label}
                checked={!!layers[l.key]}
                onChange={() => onToggleLayer?.(l.key)}
              />
            ))}
          </div>
        </section>

        <section className="shell-rail-section">
          <span className="shell-rail-section__title caps">Affichage</span>
          <div className="shell-rail__field">
            <span className="caps">Colorer par</span>
            <Segmented tabs={COLOR_MODES} value={colorBy} onChange={onColorBy} aria-label="Colorer par" />
          </div>
          <div className="shell-rail-section__rows">
            <Toggle label="Heatmap des surcharges" checked={heatmap} onChange={onHeatmap} />
            <Toggle label="Surcharge uniquement" checked={onlyOverloaded} onChange={onOnlyOverloaded} />
            <Toggle label="Infrastructures récentes" checked={!!showRecent} onChange={onShowRecent} />
          </div>
          <div className="shell-rail__field">
            <span className="caps">Fond de carte</span>
            <Select value={basemap} onChange={onBasemap} options={BASEMAPS} aria-label="Fond de carte" />
          </div>
          <div className="shell-rail__field">
            <span className="caps">Libellés de la carte</span>
            <Segmented tabs={LANGUAGES} value={language} onChange={onLanguage} aria-label="Langue des libellés" />
          </div>
        </section>

        <section className="shell-rail-section">
          <span className="shell-rail-section__title caps">Légende — classe de charge</span>
          <Legend />
        </section>
      </div>
    </nav>
  );
}
