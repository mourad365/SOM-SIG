import React from 'react';
import { LOAD, LOAD_LABEL } from '../theme/tokens.js';
import './ui.css';

// classe maps to load color via tokens.js. Use variant="neutral" for non-load badges.
export function Badge({ classe, variant, label, dot = true, children, className = '', ...rest }) {
  const isLoad = classe && LOAD[classe];
  const color = isLoad ? LOAD[classe] : 'var(--text-secondary)';
  const text = children ?? label ?? (classe ? LOAD_LABEL[classe] ?? classe : '');
  const style = isLoad
    ? { color, borderColor: color, background: `${color}1f` }
    : { color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--bg-surface-2)' };
  const pulse = classe === 'critique' ? 'ui-pulse' : '';
  return (
    <span className={`ui-badge ${pulse} ${className}`} style={style} {...rest}>
      {dot && <span className="ui-badge__dot" />}
      {text}
    </span>
  );
}
