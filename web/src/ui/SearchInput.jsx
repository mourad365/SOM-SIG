import React from 'react';
import { Search, X } from 'lucide-react';
import './ui.css';

export function SearchInput({ value = '', onChange, onClear, placeholder = 'Rechercher…', className = '', ...rest }) {
  return (
    <span className={`ui-search ${className}`}>
      <span className="ui-search__icon"><Search size={15} /></span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
      {value && (
        <button
          type="button"
          className="ui-btn ui-btn--icon ui-btn--sm ui-search__clear"
          aria-label="Effacer la recherche"
          onClick={() => (onClear ? onClear() : onChange?.(''))}
        >
          <X size={14} />
        </button>
      )}
    </span>
  );
}
