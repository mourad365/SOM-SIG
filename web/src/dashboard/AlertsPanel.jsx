import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Panel, Table, Badge, EmptyState } from '../ui/index.js';
import { LOAD } from '../theme/tokens.js';

const TYPE_LABEL = { transfo: 'Transfo', ligne: 'Ligne' };

// alertes: /api/alertes payload (surcharge+critique). Row click -> onSelect({type,id,lng,lat}).
export default function AlertsPanel({ alertes = [], onSelect }) {
  const ref = useRef(null);

  // Stagger alert rows in on mount/data change, and run a subtle infinite pulse
  // on the critique status dots only. Reduced-motion -> static, dots visible.
  useGSAP(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rows = ref.current?.querySelectorAll('tbody tr');
    const dots = ref.current?.querySelectorAll('.alert-critique .alert-dot');

    if (reduce) {
      if (rows?.length) gsap.set(rows, { opacity: 1, y: 0 });
      return;
    }
    if (rows?.length) {
      gsap.from(rows, { y: 12, opacity: 0, duration: 0.4, ease: 'power2.out', stagger: 0.06 });
    }
    if (dots?.length) {
      gsap.to(dots, { opacity: 0.6, duration: 1.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
    }
  }, { scope: ref, dependencies: [alertes] });

  const columns = [
    {
      key: 'type', header: 'Type', sortable: true,
      render: (r) => (
        <span className="alert-type">
          {r.classe === 'critique' && <span className="alert-dot" aria-hidden="true" />}
          {TYPE_LABEL[r.type] || r.type}
        </span>
      ),
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
    <div ref={ref}>
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
    </div>
  );
}
