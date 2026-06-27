import React from 'react';
import './ui.css';

export function Tooltip({ label, children, className = '' }) {
  return (
    <span className={`ui-tooltip-wrap ${className}`}>
      {children}
      <span className="ui-tooltip" role="tooltip">{label}</span>
    </span>
  );
}
