import React from 'react';
import { RefreshCw } from 'lucide-react';
import { SearchInput, Button, FilterChip, Tooltip } from '../ui/index.js';
import './shell.css';

const FILTERS = [
  { key: 'critique', label: 'Critique' },
  { key: 'surcharge', label: 'Surcharge' },
];

export function TopBar({ search, onSearch, activeFilters = {}, onToggleFilter, updatedAt, onRefresh, refreshing }) {
  return (
    <header className="shell-topbar">
      <div className="shell-wordmark">
        <span className="shell-wordmark__mark">SOMELEC</span>
        <span className="shell-wordmark__sub caps">Centre de conduite réseau</span>
      </div>

      <div className="shell-topbar__search">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder="Rechercher un actif, un poste…"
        />
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
