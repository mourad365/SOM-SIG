import React from 'react';
import './ui.css';

// tabs: [{ value, label }]
export function Tabs({ tabs = [], value, onChange, className = '' }) {
  function onKey(e, i) {
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange?.(tabs[(i + 1) % tabs.length].value); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange?.(tabs[(i - 1 + tabs.length) % tabs.length].value); }
  }
  return (
    <div className={`ui-tabs ${className}`} role="tablist">
      {tabs.map((t, i) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          className={`ui-tab ${value === t.value ? 'ui-tab--active' : ''}`}
          onClick={() => onChange?.(t.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Segmented control — same data shape, compact pill style.
export function Segmented({ tabs = [], value, onChange, className = '', 'aria-label': ariaLabel }) {
  return (
    <div className={`ui-seg ${className}`} role="group" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={value === t.value}
          className={`ui-seg__btn ${value === t.value ? 'ui-seg__btn--active' : ''}`}
          onClick={() => onChange?.(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
