import React from 'react';
import './ui.css';

export function Spinner({ size = 16, className = '' }) {
  return (
    <span
      className={`ui-spinner ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Chargement"
    />
  );
}
