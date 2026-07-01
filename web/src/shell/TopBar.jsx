import React from 'react';
import { RefreshCw, MapPin } from 'lucide-react';
import { SearchInput, Button, FilterChip, Tooltip, Badge, Constellation } from '../ui/index.js';
import './shell.css';

const FILTERS = [
  { key: 'critique', label: 'Critique' },
  { key: 'surcharge', label: 'Surcharge' },
];

const VIEWS = [
  { key: 'carte', label: 'Carte' },
  { key: 'tableau', label: 'Tableau de bord' },
  { key: 'actifs', label: 'Actifs' },
  { key: 'coupures', label: 'Coupures' }, // --- coupures --- (Chantier 5, ADR 0009)
];

const RESULT_TYPE_LABEL = { transfo: 'Transfo', poste: 'Poste', ligne: 'Ligne', coord: 'Coord.', lieu: 'Lieu' };

export function TopBar({
  view = 'carte', onView, alertCount = 0,
  search, onSearch, searchResults = [], onPickResult,
  activeFilters = {}, onToggleFilter, updatedAt, onRefresh, refreshing,
}) {
  return (
    <header className="shell-topbar">
      <div className="shell-wordmark">
        <Constellation size={26} className="shell-wordmark__glyph" title="Conduite réseau" />
        <span className="shell-wordmark__mark">Conduite réseau</span>
        <span className="shell-wordmark__sub caps">Réseau électrique</span>
      </div>

      <nav className="shell-nav" aria-label="Vues">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`shell-nav__item${view === v.key ? ' shell-nav__item--active' : ''}`}
            aria-current={view === v.key ? 'page' : undefined}
            onClick={() => onView?.(v.key)}
          >
            {v.label}
            {v.key === 'tableau' && alertCount > 0 && (
              <span className="shell-nav__badge mono">{alertCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="shell-topbar__search">
        <SearchInput value={search} onChange={onSearch} placeholder="Rechercher un actif, un poste…" />
        {searchResults.length > 0 && (
          <ul className="shell-search-results" role="listbox">
            {searchResults.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <button type="button" className="shell-search-result" onClick={() => onPickResult?.(r)}>
                  <MapPin size={13} className="shell-search-result__icon" />
                  <span className="shell-search-result__code mono">{r.code || r.label}</span>
                  <span className="shell-search-result__label">{r.label}</span>
                  <span className="caps shell-search-result__type">{RESULT_TYPE_LABEL[r.type] || r.type}</span>
                  {r.classe && <Badge classe={r.classe} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shell-topbar__right">
        {FILTERS.map((f) => (
          <FilterChip key={f.key} active={!!activeFilters[f.key]} onClick={() => onToggleFilter?.(f.key)}>
            {f.label}
          </FilterChip>
        ))}
        <span className="shell-live" title={`Flux en direct — actualisé à ${updatedAt || '—'}`}>
          <span className="live-dot" aria-hidden="true" />
          <span className="shell-live__label caps">En direct</span>
          <span className="shell-live__time mono">{updatedAt || '—'}</span>
        </span>
        <Tooltip label="Actualiser">
          <Button variant="icon" aria-label="Actualiser" onClick={onRefresh} loading={refreshing}>
            <RefreshCw size={16} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
