import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, AlertCircle } from 'lucide-react';
import { Table, FilterChip, Badge, Button, Segmented, EmptyState, Spinner } from '../ui/index.js';
import { dureeHeures } from './fiabilite.js';
import {
  TYPE_LABEL, CAUSE_LABEL, STATUT_LABEL, fmtDateTime, fmtDuree, frInt, fmtEnergie,
} from './format.js';
import './coupures.css';

const STATUT_FILTERS = [
  { key: '', label: 'Toutes' },
  { key: 'active', label: 'Actives' },
  { key: 'planifiee', label: 'Programmées' },
  { key: 'resolue', label: 'Résolues' },
];
const SOURCE_TABS = [
  { value: '', label: 'Tout' },
  { value: 'reel', label: 'Réel' },
  { value: 'simule', label: 'Simulé' },
];

const statutVariant = { active: 'critique', planifiee: undefined, resolue: undefined };

// Journal des coupures : registre filtrable, horloge de rétablissement vivante sur les
// coupures actives, clôture en un clic, accès à l'avis imprimable.
export default function JournalCoupures({ coupures, loading, error, filtre, onFiltre, onCloturer, onAvis }) {
  // Tic d'horloge : rafraîchit la durée des coupures actives toutes les 30 s.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const hasActive = coupures.some((c) => c.statut === 'active');
    if (!hasActive) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [coupures]);

  const [closingId, setClosingId] = useState(null);
  async function cloturer(c) {
    setClosingId(c.id_coupure);
    try { await onCloturer(c.id_coupure); } finally { setClosingId(null); }
  }

  const columns = [
    { key: 'code_actif', header: 'Actif', sortable: true,
      render: (c) => <span className="mono">{c.code_actif || '—'}</span> },
    { key: 'type', header: 'Nature', sortable: true,
      render: (c) => <Badge variant="neutral" label={TYPE_LABEL[c.type] || c.type} dot={false} /> },
    { key: 'cause', header: 'Cause', render: (c) => CAUSE_LABEL[c.cause] || c.cause || '—' },
    { key: 'debut', header: 'Début', sortable: true, render: (c) => fmtDateTime(c.debut) },
    { key: 'statut', header: 'État', sortable: true,
      render: (c) => (
        c.statut === 'active'
          ? <span className="coupure-clock"><span className="coupure-clock__dot" />
              {fmtDuree(dureeHeures(c.debut, null, now))}</span>
          : <Badge variant="neutral" dot={false} label={STATUT_LABEL[c.statut] || c.statut} />
      ) },
    { key: 'clients_affectes', header: 'Clients', numeric: true, sortable: true,
      render: (c) => frInt(c.clients_affectes) },
    { key: 'ens_kwh', header: 'ENS', numeric: true, sortable: true,
      render: (c) => (c.statut === 'active' ? 'en cours' : fmtEnergie(c.ens_kwh)) },
    { key: 'actions', header: '', render: (c) => (
      <div className="coupure-row-actions">
        {c.statut === 'active' && (
          <Button variant="subtle" size="sm" loading={closingId === c.id_coupure}
            onClick={(e) => { e.stopPropagation(); cloturer(c); }}>
            <CheckCircle2 size={13} /> Clôturer
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-label="Avis de coupure"
          onClick={(e) => { e.stopPropagation(); onAvis?.(c); }}>
          <FileText size={13} /> Avis
        </Button>
      </div>
    ) },
  ];

  return (
    <div className="coupure-journal">
      <div className="coupure-journal__bar">
        <div className="coupure-filters">
          {STATUT_FILTERS.map((f) => (
            <FilterChip key={f.key || 'all'} active={(filtre.statut || '') === f.key}
              onClick={() => onFiltre({ ...filtre, statut: f.key || undefined })}>
              {f.label}
            </FilterChip>
          ))}
        </div>
        <Segmented aria-label="Source" tabs={SOURCE_TABS} value={filtre.source || ''}
          onChange={(v) => onFiltre({ ...filtre, source: v || undefined })} />
      </div>

      {error ? (
        <EmptyState icon={<AlertCircle size={36} strokeWidth={1.5} />} message="Registre indisponible" />
      ) : loading ? (
        <div className="coupure-loading"><Spinner size={18} /> Chargement du registre…</div>
      ) : coupures.length === 0 ? (
        <EmptyState message="Aucune coupure — déclarez-en une depuis l'inspecteur d'un actif" />
      ) : (
        <Table
          columns={columns}
          rows={coupures}
          rowKey={(c) => c.id_coupure}
          initialSort={{ key: 'debut', dir: 'desc' }}
          getRowClassName={(c) => (c.statut === 'active' ? 'coupure-row--active' : '')}
          pageSize={12}
        />
      )}
    </div>
  );
}
