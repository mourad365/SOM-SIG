import React, { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { Drawer, Select, Button, Stat, Spinner, Badge } from '../ui/index.js';
import { createCoupure } from '../api.js';
import { ensKwh, dureeHeures } from './fiabilite.js';
import {
  TYPE_OPTIONS, CAUSE_OPTIONS, ACTIF_LABEL, fr1, frInt, fmtEnergie, fmtDuree, toLocalInput,
} from './format.js';
import './coupures.css';

// Déclaration d'une coupure depuis l'Inspecteur. L'impact (clients, charge) est fourni par
// la trace déjà lancée côté App (réutilise topology) ; l'ENS est estimée via le cœur pur.
export default function DeclareCoupure({ open, onClose, feature, trace, traceLoading, onCreated }) {
  const [type, setType] = useState('incident');
  const [cause, setCause] = useState('defaut');
  const [debut, setDebut] = useState(() => toLocalInput());
  const [fin, setFin] = useState('');           // vide ⇒ coupure en cours (active)
  const [commentaire, setCommentaire] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const actifType = feature?.type;
  const actifId = feature ? (feature[`${actifType}_id`] ?? feature.id) : null;
  const code = trace?.root?.code || feature?.code_actif || feature?.code || '—';

  const clients = trace?.summary?.clients ?? null;
  const charge = trace?.summary?.charge_kva ?? null;

  // Aperçu ENS : nulle tant que la coupure est « en cours » (pas de fin saisie).
  const ensPreview = useMemo(() => {
    if (charge == null || !fin) return null;
    return ensKwh(charge, dureeHeures(new Date(debut).toISOString(), new Date(fin).toISOString()));
  }, [charge, debut, fin]);

  async function submit() {
    if (actifId == null) return;
    setBusy(true); setErr(null);
    const payload = {
      type, actif_type: actifType, actif_id: Number(actifId), cause,
      debut: new Date(debut).toISOString(),
      fin: fin ? new Date(fin).toISOString() : undefined,
      commentaire: commentaire.trim() || undefined,
    };
    try {
      const r = await createCoupure(payload);
      if (!r || r.error) { setErr(r?.error || 'Échec de la déclaration'); return; }
      onCreated?.(r);
      onClose?.();
    } catch {
      setErr('Échec de la déclaration');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Déclarer une coupure" backdrop>
      {!feature ? null : (
        <div className="coupure-form">
          <div className="coupure-form__actif">
            <span className="inspector-code">{code}</span>
            <span className="caps">{ACTIF_LABEL[actifType] || actifType}</span>
            {feature.classe && <Badge classe={feature.classe} />}
          </div>

          <label className="coupure-field">
            <span className="caps coupure-field__label">Nature</span>
            <Select value={type} onChange={setType} options={TYPE_OPTIONS} aria-label="Nature de la coupure" />
          </label>

          <label className="coupure-field">
            <span className="caps coupure-field__label">Cause</span>
            <Select value={cause} onChange={setCause} options={CAUSE_OPTIONS} aria-label="Cause" />
          </label>

          <div className="coupure-field-row">
            <label className="coupure-field">
              <span className="caps coupure-field__label">Début</span>
              <input className="coupure-input" type="datetime-local" value={debut}
                onChange={(e) => setDebut(e.target.value)} />
            </label>
            <label className="coupure-field">
              <span className="caps coupure-field__label">Fin (optionnel)</span>
              <input className="coupure-input" type="datetime-local" value={fin} min={debut}
                onChange={(e) => setFin(e.target.value)} />
            </label>
          </div>
          <p className="coupure-hint">Sans fin renseignée, la coupure est suivie « en cours » (l'ENS s'accumule).</p>

          <label className="coupure-field">
            <span className="caps coupure-field__label">Commentaire</span>
            <textarea className="coupure-input" rows={2} value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)} placeholder="Note d'exploitation…" />
          </label>

          <div className="coupure-impact">
            <span className="caps coupure-impact__title">
              {traceLoading ? <><Spinner size={12} /> Calcul de l'impact…</> : 'Impact estimé'}
            </span>
            <div className="coupure-impact__grid">
              <Stat label="Clients affectés" value={frInt(clients)} />
              <Stat label="Charge" value={fr1(charge)} unit="kVA" />
              <Stat label="ENS estimée" value={fin ? fmtEnergie(ensPreview) : 'en cours'} />
              <Stat label="Durée" value={fin ? fmtDuree(dureeHeures(new Date(debut).toISOString(), new Date(fin).toISOString())) : '—'} />
            </div>
          </div>

          {err && <p className="coupure-error">{err}</p>}

          <div className="coupure-form__actions">
            <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
            <Button variant="primary" size="sm" loading={busy} disabled={actifId == null} onClick={submit}>
              <Zap size={14} /> Enregistrer la coupure
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
