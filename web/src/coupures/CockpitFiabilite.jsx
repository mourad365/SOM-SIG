import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { AlertCircle } from 'lucide-react';
import { Panel, Stat, CountUpValue, Table, Badge, EmptyState, Spinner } from '../ui/index.js';
import { LOAD, COLOR, chartAxis } from '../theme/tokens.js';
import { fr2, frInt, fr1, fmtEnergie } from './format.js';
import '../dashboard/dashboard.css'; // réutilise la grille KPI/charts (.dash-kpis/.dash-panel/.dash-chart)
import './coupures.css';

const num = (n, fmt) => (n == null ? '—' : <CountUpValue value={Number(n)} format={fmt} />);

function Tip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tip">
      <div className="caps">{label}</div>
      <div className="mono">{frInt(payload[0].value)} {unit}</div>
    </div>
  );
}

// Cockpit fiabilité (face direction) : indices SAIDI/SAIFI/CAIDI/ENS sur les incidents,
// tendance mensuelle, classement des postes, et un rappel honnête de la part simulée.
export default function CockpitFiabilite({ fiabilite, loading, error }) {
  const ref = useRef(null);
  useGSAP(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tiles = ref.current?.querySelectorAll('.kpi-value');
    if (!tiles?.length) return;
    if (reduce) { gsap.set(tiles, { opacity: 1, y: 0 }); return; }
    gsap.from(tiles, { y: 12, opacity: 0, duration: 0.4, ease: 'power2.out', stagger: 0.06 });
  }, { scope: ref, dependencies: [fiabilite] });

  if (error) return <EmptyState icon={<AlertCircle size={36} strokeWidth={1.5} />} message="Indices indisponibles" />;
  if (loading || !fiabilite) return <div className="coupure-loading"><Spinner size={18} /> Calcul des indices…</div>;

  const inc = fiabilite.incidents || {};
  const prog = fiabilite.programmees || {};
  const timeline = fiabilite.timeline || [];
  const ensData = timeline.map((t) => ({ mois: t.mois, ens: Math.round(Number(t.ens_kwh) || 0) }));
  const saidiData = timeline.map((t) => ({ mois: t.mois, saidi: Number(t.saidi_h) || 0 }));

  const classement = (fiabilite.classement || []).map((r) => ({ ...r }));
  const clsColumns = [
    { key: 'code', header: 'Poste source', render: (r) => <span className="mono">{r.code}</span> },
    { key: 'n_incidents', header: 'Incidents', numeric: true, sortable: true },
    { key: 'client_heures', header: 'Client·h', numeric: true, sortable: true, render: (r) => frInt(r.client_heures) },
    { key: 'ens_kwh', header: 'ENS', numeric: true, sortable: true, render: (r) => fmtEnergie(r.ens_kwh) },
  ];

  return (
    <div className="coupure-cockpit" ref={ref}>
      <div className="coupure-cockpit__head">
        <p className="coupure-note">
          Indices calculés sur les <strong>incidents</strong> (coupures subies). N = {frInt(fiabilite.n_clients)} clients servis.
          {fiabilite.n_simule > 0 && <> · <span className="coupure-sim-tag">dont {fiabilite.n_simule} coupures simulées</span></>}
        </p>
      </div>

      <section className="dash-kpis">
        <Stat className="kpi-value" hero label="SAIDI" value={num(inc.saidi_h, (n) => fr2(n))} unit="h/client" />
        <Stat className="kpi-value" label="SAIFI" value={num(inc.saifi, (n) => fr2(n))} unit="int./client" />
        <Stat className="kpi-value" label="CAIDI" value={num(inc.caidi_h, (n) => fr2(n))} unit="h" />
        <Stat className="kpi-value" label="ENS (incidents)" value={fmtEnergie(inc.ens_kwh)} valueColor={LOAD.critique} />
        <Stat className="kpi-value" label="Incidents" value={num(inc.n)} />
        <Stat className="kpi-value" label="Coupures progr." value={num(prog.n)} />
      </section>

      <div className="dash-charts coupure-charts">
        <Panel title="ENS par mois (incidents)" caps className="dash-panel">
          <div className="dash-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ensData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLOR.grid} />
                <XAxis dataKey="mois" tick={{ ...chartAxis, fontSize: 10 }} axisLine={{ stroke: COLOR.grid }} tickLine={false} />
                <YAxis tick={chartAxis} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<Tip unit="kWh" />} cursor={{ fill: COLOR.grid }} />
                <Bar dataKey="ens" radius={[3, 3, 0, 0]} fill={LOAD.critique} isAnimationActive animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="SAIDI par mois (h/client)" caps className="dash-panel">
          <div className="dash-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={saidiData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLOR.grid} />
                <XAxis dataKey="mois" tick={{ ...chartAxis, fontSize: 10 }} axisLine={{ stroke: COLOR.grid }} tickLine={false} />
                <YAxis tick={chartAxis} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<Tip unit="h" />} cursor={{ fill: COLOR.grid }} />
                <Bar dataKey="saidi" radius={[3, 3, 0, 0]} fill={COLOR.accent} isAnimationActive animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Classement des postes par ENS (incidents)" caps className="dash-panel coupure-classement">
        {classement.length === 0 ? (
          <EmptyState message="Aucun incident sur la période" />
        ) : (
          <Table columns={clsColumns} rows={classement} rowKey={(r) => r.poste_id}
            initialSort={{ key: 'ens_kwh', dir: 'desc' }} />
        )}
      </Panel>

      {prog.n > 0 && (
        <p className="coupure-note coupure-note--prog">
          Coupures programmées (rapportées à part) : {prog.n} · SAIDI {fr2(prog.saidi_h)} h/client ·
          ENS {fmtEnergie(prog.ens_kwh)}.
        </p>
      )}
    </div>
  );
}
