import React, { useState } from 'react';
import { Tabs } from '../ui/index.js';
import { useCoupures } from './useCoupures.js';
import JournalCoupures from './JournalCoupures.jsx';
import CockpitFiabilite from './CockpitFiabilite.jsx';
import AvisCoupure from './AvisCoupure.jsx';
import './coupures.css';

const TABS = [
  { value: 'journal', label: 'Journal' },
  { value: 'fiabilite', label: 'Fiabilité' },
];

// Vue « Coupures » : deux faces d'un même registre — desk d'exploitation (Journal) et
// direction (Cockpit fiabilité). `refreshKey` force un rechargement après une déclaration
// faite depuis l'inspecteur (carte).
export default function CoupuresView({ refreshKey = 0 }) {
  const [tab, setTab] = useState('journal');
  const [avis, setAvis] = useState(null);
  const { coupures, fiabilite, loading, error, filtre, setFiltre, cloturer } = useCoupures(refreshKey);

  return (
    <div className="shell-view shell-view--pad coupures-view">
      <div className="coupures-view__head">
        <div>
          <h1 className="view-title">Gestion des coupures</h1>
          <p className="coupures-view__sub">Registre d'exploitation & indices de fiabilité (sans télémétrie · ADR 0009)</p>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'journal' ? (
        <JournalCoupures
          coupures={coupures} loading={loading} error={error}
          filtre={filtre} onFiltre={setFiltre} onCloturer={cloturer} onAvis={setAvis}
        />
      ) : (
        <CockpitFiabilite fiabilite={fiabilite} loading={loading} error={error} />
      )}

      {avis && <AvisCoupure coupure={avis} onClose={() => setAvis(null)} />}
    </div>
  );
}
