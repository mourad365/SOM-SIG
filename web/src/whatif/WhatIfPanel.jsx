import React, { useState } from 'react';
import { FlaskConical, Plus, RotateCcw, X, Zap } from 'lucide-react';
import { Panel, Button, Chip, Badge, EmptyState } from '../ui/index.js';
import './whatif.css';

// Panneau du bac à sable « what-if ». Flotte sur la carte (vue Carte) quand le mode
// est actif. Réutilise les primitives ui/ et les tokens (aucune couleur en dur).
//
// Le panneau ne fait QUE piloter l'état overlay du contrôleur (useWhatIf) :
// rien n'est écrit en base. La classe pilote la couleur via le Badge (tokens LOAD).
export default function WhatIfPanel({ wi, onClose }) {
  const {
    mode, setMode,
    transfos, points, selectedTransfoId, setSelectedTransfoId,
    addPoint, reassignPoints, reset, charge,
  } = wi;

  const [kw, setKw] = useState('30');

  const selected = transfos.find((t) => t.id === selectedTransfoId) || null;

  // Rattache un nouveau point (puissance saisie) au transfo sélectionné, près de lui.
  function handleAddPoint() {
    if (!selected) return;
    const v = Number(kw);
    if (!Number.isFinite(v) || v <= 0) return;
    addPoint({
      transfo_id: selected.id,
      puiss_souscrite_kw: v,
      // léger décalage pour ne pas empiler les points exactement sur le transfo
      lng: selected.lng != null ? selected.lng + (Math.random() - 0.5) * 0.0015 : null,
      lat: selected.lat != null ? selected.lat + (Math.random() - 0.5) * 0.0015 : null,
    });
  }

  return (
    <div className="whatif-panel">
      <Panel
        title={<span className="whatif-title"><FlaskConical size={15} /> Bac à sable « what-if »</span>}
        actions={
          <Button variant="icon" size="sm" aria-label="Fermer le bac à sable" onClick={onClose}>
            <X size={15} />
          </Button>
        }
        className="whatif-panel__card"
      >
        <p className="whatif-hint">
          Simulation locale — <strong>aucune écriture en base</strong>. Recoloration en direct
          selon la classe de charge recalculée.
        </p>

        <div className="whatif-actions">
          <Button
            variant={mode === 'add-transfo' ? 'primary' : 'subtle'}
            size="sm"
            onClick={() => setMode(mode === 'add-transfo' ? 'idle' : 'add-transfo')}
          >
            <Plus size={14} /> Ajouter un transfo
          </Button>
          <Button variant="subtle" size="sm" onClick={reset}>
            <RotateCcw size={14} /> Réinitialiser
          </Button>
        </div>

        {mode === 'add-transfo' && (
          <p className="whatif-mode-tip">Cliquez sur la carte pour placer le transformateur, puis saisissez sa puissance (kVA).</p>
        )}

        <div className="whatif-section">
          <span className="caps whatif-section__title">Transformateurs ({transfos.length})</span>
          {transfos.length === 0 ? (
            <EmptyState
              icon={<Zap size={22} />}
              message="Cliquez un transformateur sur la carte pour le capturer, ou ajoutez-en un."
            />
          ) : (
            <ul className="whatif-list">
              {transfos.map((t) => {
                const c = charge.get(t.id) || {};
                const classe = c.classe || 'inconnu';
                return (
                  <li key={t.id}>
                    <Chip active={t.id === selectedTransfoId} onClick={() => setSelectedTransfoId(t.id)}>
                      <span className="whatif-chip__code">{t.code}</span>
                      <Badge classe={classe} />
                      <span className="whatif-chip__pct mono">{c.taux == null ? '—' : `${Math.round(c.taux * 100)}%`}</span>
                    </Chip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="whatif-section">
          <span className="caps whatif-section__title">Réaffecter des clients</span>
          {selected ? (
            <>
              <div className="whatif-reassign">
                <label className="whatif-field">
                  <span className="caps">Puiss. souscrite (kW)</span>
                  <input
                    type="number" min="1" step="1" value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    className="whatif-input mono"
                    aria-label="Puissance souscrite en kW"
                  />
                </label>
                <Button variant="subtle" size="sm" onClick={handleAddPoint}>
                  <Plus size={14} /> Rattacher à {selected.code}
                </Button>
              </div>
              {transfos.length > 1 && (
                <div className="whatif-move">
                  <span className="whatif-move__label">Déplacer tous les clients vers :</span>
                  <div className="whatif-move__targets">
                    {transfos.filter((t) => t.id !== selectedTransfoId).map((t) => (
                      <Chip key={t.id} onClick={() => reassignPoints(selectedTransfoId, t.id)}>{t.code}</Chip>
                    ))}
                  </div>
                </div>
              )}
              <span className="whatif-count mono">
                {points.filter((p) => p.transfo_id === selectedTransfoId).length} client(s) rattaché(s)
              </span>
            </>
          ) : (
            <p className="whatif-hint">Sélectionnez un transformateur ci-dessus.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
