import React from 'react';
import { Panel, Table, Badge, EmptyState } from '../ui/index.js';
import { LOAD } from '../theme/tokens.js';

const TYPE_LABEL = { transfo: 'Transfo', ligne: 'Ligne' };

// alertes: /api/alertes payload (surcharge+critique). Row click -> onSelect({type,id,lng,lat}).
export default function AlertsPanel({ alertes = [], onSelect }) {
  const columns = [
    {
      key: 'type', header: 'Type', sortable: true,
      render: (r) => TYPE_LABEL[r.type] || r.type,
    },
    { key: 'code', header: 'Code', sortable: true },
    {
      key: 'classe', header: 'Classe', sortable: true,
      render: (r) => <Badge classe={r.classe} dot={false} />,
    },
    {
      key: 'taux_charge', header: 'Charge', numeric: true, sortable: true,
      sortValue: (r) => Number(r.taux_charge),
      render: (r) => (
        <span className="mono" style={{ color: Number(r.taux_charge) >= 1 ? LOAD.critique : LOAD.surcharge }}>
          {Math.round(Number(r.taux_charge) * 100)}%
        </span>
      ),
    },
  ];

  return (
    <Panel title={`${alertes.length} alertes`} caps className="dash-panel dash-alerts">
      {alertes.length === 0 ? (
        <EmptyState message="Aucune alerte" />
      ) : (
        <Table
          columns={columns}
          rows={alertes}
          rowKey={(r) => `${r.type}-${r.id}`}
          onRowClick={(r) => onSelect?.({ type: r.type, id: r.id, lng: r.lng, lat: r.lat })}
          getRowClassName={(r) => (r.classe === 'critique' ? 'alert-critique' : '')}
          initialSort={{ key: 'taux_charge', dir: 'desc' }}
        />
      )}
    </Panel>
  );
}
