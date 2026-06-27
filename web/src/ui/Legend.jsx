import React from 'react';
import { LOAD, LOAD_LABEL } from '../theme/tokens.js';
import './ui.css';

const ORDER = ['normal', 'surcharge', 'critique', 'inconnu'];

// Load-class swatches. Pass items to override, otherwise show all load classes.
export function Legend({ items, className = '' }) {
  const rows = items || ORDER.map((k) => ({ color: LOAD[k], label: LOAD_LABEL[k] }));
  return (
    <div className={`ui-legend ${className}`}>
      {rows.map((r) => (
        <div className="ui-legend__row" key={r.label}>
          <span className="ui-legend__swatch" style={{ background: r.color }} />
          {r.label}
        </div>
      ))}
    </div>
  );
}
