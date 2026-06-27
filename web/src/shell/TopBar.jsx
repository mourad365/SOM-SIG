import React from 'react';
import { RefreshCw, MapPin, Zap } from 'lucide-react';
import { SearchInput, Button, FilterChip, Tooltip, Badge } from '../ui/index.js';
import './shell.css';

const FILTERS = [
  { key: 'critique', label: 'Critique' },
  { key: 'surcharge', label: 'Surcharge' },
];

const RESULT_TYPE_LABEL = { transfo: 'Transfo', poste: 'Poste', ligne: 'Ligne' };

export function TopBar({
  search, onSearch, searchResults = [], onPickResult,
  activeFilters = {}, onToggleFilter, updatedAt, onRefresh, refreshing,
}) {
  return (
    <header className="shell-topbar">
      <div className="shell-wordmark">
        <Zap size={18} className="shell-wordmark__bolt" aria-hidden="true" />
        <span className="shell-wordmark__mark">SOMELEC</span>
        <span className="shell-wordmark__sub caps">Centre de conduite réseau</span>
      </div>

      <div className="shell-topbar__search">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder="Rechercher un actif, un poste…"
        />
        {searchResults.length > 0 && (
          <ul className="shell-search-results" role="listbox">
            {searchResults.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <button
                  type="button"
                  className="shell-search-result"
                  onClick={() => onPickResult?.(r)}
                >
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
          <FilterChip
            key={f.key}
            active={!!activeFilters[f.key]}
            onClick={() => onToggleFilter?.(f.key)}
          >
            {f.label}
          </FilterChip>
        ))}
        <span className="shell-maj caps">
          Actualisé à <span className="shell-maj__time">{updatedAt || '—'}</span>
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
