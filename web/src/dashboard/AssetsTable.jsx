import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Table, Badge, Select, SearchInput, Button, Spinner, EmptyState } from '../ui/index.js';
import { LOAD } from '../theme/tokens.js';
import { getAssets } from '../api.js';

const LIMIT = 25;

const TYPE_OPTIONS = [
  { value: '', label: 'Tous types' },
  { value: 'transfo', label: 'Transfos' },
  { value: 'ligne', label: 'Lignes' },
];
const CLASSE_OPTIONS = [
  { value: '', label: 'Toutes classes' },
  { value: 'critique', label: 'Critique' },
  { value: 'surcharge', label: 'Surcharge' },
  { value: 'normal', label: 'Normal' },
  { value: 'inconnu', label: 'Inconnu' },
];
const NIVEAU_OPTIONS = [
  { value: '', label: 'Toutes tensions' },
  { value: 'HTA', label: 'HTA' },
  { value: 'BT', label: 'BT' },
];
const STATUT_OPTIONS = [
  { value: '', label: 'Tous statuts' },
  { value: 'en_service', label: 'En service' },
  { value: 'hors_service', label: 'Hors service' },
];
const SORT_OPTIONS = [
  { value: 'taux_charge:desc', label: 'Charge ↓' },
  { value: 'taux_charge:asc', label: 'Charge ↑' },
  { value: 'code:asc', label: 'Code A→Z' },
  { value: 'code:desc', label: 'Code Z→A' },
];

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const num = (v) => (v == null || v === '' ? null : Number(v));

// filters prop: global shell filters { niveau_tension?, statut?, classe? }, merged as defaults.
export default function AssetsTable({ filters = {}, onSelect }) {
  const [type, setType] = useState('');
  const [classe, setClasse] = useState(filters.classe || '');
  const [niveau, setNiveau] = useState(filters.niveau_tension || '');
  const [statut, setStatut] = useState(filters.statut || '');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'taux_charge', order: 'desc' });
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  // Reflect incoming global filters when they change.
  useEffect(() => { if (filters.classe !== undefined) setClasse(filters.classe || ''); }, [filters.classe]);
  useEffect(() => { if (filters.niveau_tension !== undefined) setNiveau(filters.niveau_tension || ''); }, [filters.niveau_tension]);
  useEffect(() => { if (filters.statut !== undefined) setStatut(filters.statut || ''); }, [filters.statut]);

  const debouncedQ = useDebounced(q, 300);

  // Reset to first page whenever any filter/search/sort changes.
  useEffect(() => { setOffset(0); }, [type, classe, niveau, statut, debouncedQ, sort.key, sort.order]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(false);
    getAssets({
      type, classe, niveau_tension: niveau, statut, q: debouncedQ,
      sort: sort.key, order: sort.order, limit: LIMIT, offset,
    })
      .then((r) => { if (id === reqId.current) setData({ rows: r.rows || [], total: r.total || 0 }); })
      .catch(() => { if (id === reqId.current) setError(true); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [type, classe, niveau, statut, debouncedQ, sort.key, sort.order, offset]);

  // Server handles sort/pagination; Table renders rows as received.
  const columns = useMemo(() => [
    { key: 'code', header: 'Code' },
    {
      key: 'classe', header: 'Classe',
      render: (r) => <Badge classe={r.classe} dot={false} />,
    },
    {
      key: 'taux_charge', header: 'Charge', numeric: true,
      render: (r) => {
        const t = num(r.taux_charge);
        if (t == null) return <span className="mono" style={{ color: 'var(--text-muted)' }}>—</span>;
        return (
          <span className="mono" style={{ color: t >= 1 ? LOAD.critique : t >= 0.8 ? LOAD.surcharge : LOAD.normal }}>
            {Math.round(t * 100)}%
          </span>
        );
      },
    },
    {
      key: 'taille', header: 'Puiss./Section', numeric: true,
      render: (r) => (
        <span className="mono">
          {r.puissance_kva != null ? `${r.puissance_kva} kVA`
            : r.section_mm2 != null ? `${r.section_mm2} mm²` : '—'}
        </span>
      ),
    },
  ], []);

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(data.total / LIMIT));

  return (
    <Panel title="Actifs" caps className="dash-panel dash-assets">
      <div className="dash-assets__filters">
        <Select aria-label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} />
        <Select aria-label="Classe" value={classe} onChange={setClasse} options={CLASSE_OPTIONS} />
        <Select aria-label="Niveau de tension" value={niveau} onChange={setNiveau} options={NIVEAU_OPTIONS} />
        <Select aria-label="Statut" value={statut} onChange={setStatut} options={STATUT_OPTIONS} />
        <Select
          aria-label="Tri"
          value={`${sort.key}:${sort.order}`}
          onChange={(v) => { const [key, order] = v.split(':'); setSort({ key, order }); }}
          options={SORT_OPTIONS}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Code…" className="dash-assets__search" />
      </div>

      {error ? (
        <EmptyState message="Données indisponibles" />
      ) : loading && data.rows.length === 0 ? (
        <div className="dash-center"><Spinner /></div>
      ) : data.rows.length === 0 ? (
        <EmptyState message="Aucun actif" />
      ) : (
        <Table
          columns={columns}
          rows={data.rows}
          rowKey={(r) => `${r.code}-${r.id}`}
          onRowClick={(r) => onSelect?.({ type: r.puissance_kva != null ? 'transfo' : 'ligne', id: r.id })}
        />
      )}

      <div className="dash-assets__foot">
        <span className="caps">{data.total} actifs</span>
        <div className="dash-assets__pager">
          <Button size="sm" variant="ghost" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}>
            Précédent
          </Button>
          <span className="mono dash-assets__page">{page} / {pages}</span>
          <Button size="sm" variant="ghost" disabled={offset + LIMIT >= data.total || loading} onClick={() => setOffset((o) => o + LIMIT)}>
            Suivant
          </Button>
        </div>
      </div>
    </Panel>
  );
}
