import React from 'react';
import './ui.css';
import { Constellation } from './Constellation.jsx';

export function EmptyState({ icon, message = 'Aucune donnée', children, className = '' }) {
  return (
    <div className={`ui-empty ${className}`}>
      <span className="ui-empty__icon">{icon || <Constellation size={40} className="ui-empty__glyph" />}</span>
      <span className="ui-empty__msg">{message}</span>
      {children}
    </div>
  );
}
