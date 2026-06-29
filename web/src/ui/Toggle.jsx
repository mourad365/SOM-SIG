import React from 'react';
import './ui.css';

export function Toggle({ checked = false, onChange, label, disabled = false, className = '', ...rest }) {
  function handle() { if (!disabled) onChange?.(!checked); }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handle(); }
  }
  return (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      className={`ui-toggle ${checked ? 'ui-toggle--on' : ''} ${className}`}
      onClick={handle}
      onKeyDown={onKey}
      {...rest}
    >
      <span className="ui-toggle__track"><span className="ui-toggle__thumb" /></span>
      {label && <span className="ui-toggle__label">{label}</span>}
    </span>
  );
}

export const Switch = Toggle;
