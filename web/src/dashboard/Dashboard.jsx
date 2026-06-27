import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getKpi, getTopSurcharges } from '../api.js';
import { Panel, Stat, Badge, Table, Spinner, EmptyState } from '../ui/index.js';
import { LOAD, COLOR, chartAxis } from '../theme/tokens.js';
import './dashboard.css';

const BINS = ['<50%', '50-80%', '80-100%', '>100%'];
const BIN_COLOR = [LOAD.normal, LOAD.normal, LOAD.surcharge, LOAD.critique];

function bin(taux) {
  if (taux == null || Number.isNaN(taux)) return null;
  if (taux < 0.5) return BINS[0];
  if (taux < 0.8) return BINS[1];
  if (taux < 1.0) return BINS[2];
  return BINS[3];
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tip">
      <div className="caps">{label}</div>
      <div className="mono">{payload[0].value}</div>
    </div>
  );
}

export default function Dashboard({ onSelect, refreshKey = 0 }) {
  const [kpi, setKpi] = useState(null);
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getKpi().then(setKpi).catch(() => setKpi({ error: true })),
      getTopSurcharges().then((r) => setTop(Array.isArray(r) ? r : [])).catch(() => setTop([])),
    ]).finally(() => setLoading(false));
  }, [refreshKey]);

  const histo = BINS.map((b, i) => ({
    bin: b,
    n: top.filter((t) => bin(Number(t.taux_charge)) === b).length,
    fill: BIN_COLOR[i],
  }));

  const byClasse = kpi?.byClasse || {};

  const columns = [
    { key: 'code_actif', header: 'Transfo', sortable: true },
    {
      key: 'classe', header: 'Classe', sortable: true,
      render: (r) => <Badge classe={r.classe} dot={false} />,
    },
    {
      key: 'taux_charge', header: 'Charge', numeric: true, sortable: true,
      sortValue: (r) => Number(r.taux_charge),
      render: (r) => (
        <span style={{ color: Number(r.taux_charge) >= 1 ? LOAD.critique : LOAD.surcharge }}>
          {Math.round(Number(r.taux_charge) * 100)}%
        </span>
      ),
    },
  ];

  return (
    <div className="dash">
      <section className="dash-kpis">
        <Stat hero label="Total transfos" value={loading ? '—' : kpi?.total ?? '—'} />
        <Stat label="Critique" value={byClasse.critique || 0} valueColor={LOAD.critique} />
        <Stat label="Surcharge" value={byClasse.surcharge || 0} valueColor={LOAD.surcharge} />
        <Stat label="Normal" value={byClasse.normal || 0} valueColor={LOAD.normal} />
      </section>

      <div className="dash-cols">
        <Panel title="Top surcharges" caps className="dash-panel">
          {loading ? (
            <div className="dash-center"><Spinner /></div>
          ) : top.length === 0 ? (
            <EmptyState message="Aucune surcharge" />
          ) : (
            <Table
              columns={columns}
              rows={top}
              rowKey={(r) => r.code_actif}
              onRowClick={onSelect}
              getRowClassName={(r) => (r.classe === 'critique' ? 'dash-row--critique' : '')}
              initialSort={{ key: 'taux_charge', dir: 'desc' }}
            />
          )}
        </Panel>

        <Panel title="Répartition de charge" caps className="dash-panel">
          {loading ? (
            <div className="dash-center"><Spinner /></div>
          ) : (
            <div className="dash-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histo} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="bin" tick={chartAxis} axisLine={{ stroke: COLOR.grid }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={chartAxis} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: COLOR.grid }} />
                  <Bar dataKey="n" radius={[3, 3, 0, 0]}>
                    {histo.map((d) => <Cell key={d.bin} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
