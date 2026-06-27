import React from 'react';
import { ChevronDown } from 'lucide-react';
import './ui.css';

// options: [{ value, label }]
export function Select({ value, onChange, options = [], className = '', 'aria-label': ariaLabel, ...rest }) {
  return (
    <span className={`ui-select-wrap ${className}`}>
      <select
        className="ui-select"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="ui-select-wrap__icon" />
    </span>
  );
}
