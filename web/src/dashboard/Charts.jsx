import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { Panel } from '../ui/index.js';
import { LOAD, COLOR, chartAxis } from '../theme/tokens.js';

// Bin -> load color: <50 & 50-80 normal, 80-100 surcharge, >100 critique.
const BIN_COLOR = {
  '<50%': LOAD.normal,
  '50-80%': LOAD.normal,
  '80-100%': LOAD.surcharge,
  '>100%': LOAD.critique,
};

const TYPE_LABEL = {
  poste: 'Postes',
  transformateur: 'Transfos',
  ligne: 'Lignes',
  point_service: 'Points service',
  support: 'Supports',
};

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="dash-tip">
      <div className="caps">{p.payload?.label ?? label}</div>
      <div className="mono">{p.value}</div>
    </div>
  );
}

function classeColor(classe) {
  return LOAD[classe] || LOAD.inconnu;
}

export default function Charts({ histogramme = [], alertes = [], stats }) {
  const histo = histogramme.map((d) => ({ ...d, fill: BIN_COLOR[d.bin] || LOAD.inconnu }));

  const top = [...alertes]
    .sort((a, b) => Number(b.taux_charge) - Number(a.taux_charge))
    .slice(0, 8)
    .map((a) => ({
      code: a.code,
      pct: Math.round(Number(a.taux_charge) * 100),
      fill: classeColor(a.classe),
    }));

  const counts = stats?.counts_by_type || {};
  const byType = Object.entries(counts).map(([k, v]) => ({
    label: TYPE_LABEL[k] || k,
    n: Number(v) || 0,
  }));

  return (
    <div className="dash-charts">
      <Panel title="Répartition de charge" caps className="dash-panel">
        <div className="dash-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histo} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="bin" tick={chartAxis} axisLine={{ stroke: COLOR.grid }} tickLine={false} />
              <YAxis allowDecimals={false} tick={chartAxis} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTip />} cursor={{ fill: COLOR.grid }} />
              <Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={600}>
                {histo.map((d) => <Cell key={d.bin} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Top surcharges" caps className="dash-panel">
        <div className="dash-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="code"
                tick={chartAxis}
                axisLine={false}
                tickLine={false}
                width={78}
              />
              <Tooltip content={<ChartTip />} cursor={{ fill: COLOR.grid }} />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={12} isAnimationActive animationDuration={600}>
                {top.map((d) => <Cell key={d.code} fill={d.fill} />)}
                <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} fill={COLOR.textSecondary} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Actifs par type" caps className="dash-panel">
        <div className="dash-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byType} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ ...chartAxis, fontSize: 10 }} axisLine={{ stroke: COLOR.grid }} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={chartAxis} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTip />} cursor={{ fill: COLOR.grid }} />
              <Bar dataKey="n" radius={[3, 3, 0, 0]} fill={COLOR.accent} isAnimationActive animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
