import React, { useEffect, useState } from 'react';
import { Printer, Download, X } from 'lucide-react';
import { Button, Spinner } from '../ui/index.js';
import { getCoupureClients } from '../api.js';
import {
  TYPE_LABEL, CAUSE_LABEL, STATUT_LABEL, ACTIF_LABEL, fmtDateTime, frInt, fr1, fmtEnergie,
} from './format.js';
import './coupures.css';

function toCsv(rows) {
  const head = ['numero_compteur', 'adresse', 'quartier', 'type_batiment', 'statut'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const r of rows) lines.push(head.map((k) => esc(r[k])).join(','));
  return lines.join('\r\n');
}

function download(name, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime }); // BOM → Excel lit l'UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Avis de coupure imprimable + export CSV de la liste clients. Overlay plein écran ;
// l'impression masque tout sauf le document (cf. coupures.css @media print).
export default function AvisCoupure({ coupure, onClose }) {
  const [clients, setClients] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coupure) return;
    let alive = true;
    setLoading(true);
    getCoupureClients(coupure.id_coupure)
      .then((r) => { if (alive) setClients(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setClients([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [coupure]);

  if (!coupure) return null;
  const c = coupure;
  const titre = c.type === 'incident' ? "AVIS D'INTERRUPTION" : 'AVIS DE COUPURE PROGRAMMÉE';

  return (
    <div className="avis-overlay" role="dialog" aria-label="Avis de coupure">
      <div className="avis-toolbar">
        <Button variant="primary" size="sm" onClick={() => window.print()}>
          <Printer size={14} /> Imprimer
        </Button>
        <Button variant="subtle" size="sm" disabled={!clients?.length}
          onClick={() => download(`avis-coupure-${c.id_coupure}-clients.csv`, toCsv(clients || []))}>
          <Download size={14} /> Export clients (CSV)
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}><X size={14} /> Fermer</Button>
      </div>

      <article className="avis-doc">
        <header className="avis-doc__head">
          <div>
            <div className="avis-doc__brand">SOMELEC · Conduite réseau</div>
            <div className="avis-doc__sub">Réseau électrique — Nouakchott</div>
          </div>
          <div className="avis-doc__ref">
            <div className="avis-doc__title">{titre}</div>
            <div className="avis-doc__meta">Réf. C-{String(c.id_coupure).padStart(5, '0')}</div>
          </div>
        </header>

        <section className="avis-doc__grid">
          <div><span className="avis-k">Ouvrage</span><span className="avis-v mono">{c.code_actif || '—'}</span></div>
          <div><span className="avis-k">Type d'ouvrage</span><span className="avis-v">{ACTIF_LABEL[c.actif_type] || c.actif_type}</span></div>
          <div><span className="avis-k">Nature</span><span className="avis-v">{TYPE_LABEL[c.type] || c.type}</span></div>
          <div><span className="avis-k">Cause</span><span className="avis-v">{CAUSE_LABEL[c.cause] || c.cause || '—'}</span></div>
          <div><span className="avis-k">Début</span><span className="avis-v">{fmtDateTime(c.debut)}</span></div>
          <div><span className="avis-k">Fin prévue / réelle</span><span className="avis-v">{c.fin ? fmtDateTime(c.fin) : 'en cours'}</span></div>
          <div><span className="avis-k">État</span><span className="avis-v">{STATUT_LABEL[c.statut] || c.statut}</span></div>
          <div><span className="avis-k">Clients affectés</span><span className="avis-v">{frInt(c.clients_affectes)}</span></div>
          <div><span className="avis-k">Charge interrompue</span><span className="avis-v">{fr1(c.charge_kva)} kVA</span></div>
          <div><span className="avis-k">Énergie non distribuée</span><span className="avis-v">{c.statut === 'active' ? 'en cours' : fmtEnergie(c.ens_kwh)}</span></div>
        </section>

        {c.commentaire && <p className="avis-doc__comment">{c.commentaire}</p>}

        <section className="avis-doc__clients">
          <div className="avis-doc__clients-head">
            <h2 className="avis-doc__h2">Clients affectés</h2>
            <span className="avis-doc__count">{loading ? '' : `${frInt(clients?.length || 0)} compteur(s)`}</span>
          </div>
          {loading ? (
            <div className="coupure-loading"><Spinner size={16} /> Constitution de la liste…</div>
          ) : clients.length === 0 ? (
            <p className="avis-doc__empty">Aucun compteur recensé en aval de cet ouvrage.</p>
          ) : (
            <table className="avis-table">
              <thead>
                <tr><th>Compteur</th><th>Adresse</th><th>Quartier</th><th>Type</th><th>Statut</th></tr>
              </thead>
              <tbody>
                {clients.map((r) => (
                  <tr key={r.numero_compteur}>
                    <td className="mono">{r.numero_compteur}</td>
                    <td>{r.adresse || '—'}</td>
                    <td>{r.quartier || '—'}</td>
                    <td>{r.type_batiment || '—'}</td>
                    <td>{r.statut || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="avis-doc__foot">
          <span>Émis le {fmtDateTime(new Date().toISOString())} · Conduite réseau SOMELEC</span>
          <span className="avis-doc__sign">Visa exploitation : ____________________</span>
        </footer>
      </article>
    </div>
  );
}
