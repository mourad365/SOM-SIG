import React from 'react';
import './ui.css';

export function Chip({ active = false, children, onClick, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`ui-chip ${active ? 'ui-chip--active' : ''} ${className}`}
      aria-pressed={active}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

// Alias: a FilterChip is a toggleable Chip.
export const FilterChip = Chip;
