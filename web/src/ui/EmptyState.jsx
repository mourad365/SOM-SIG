import React from 'react';
import { Inbox } from 'lucide-react';
import './ui.css';

export function EmptyState({ icon, message = 'Aucune donnée', children, className = '' }) {
  return (
    <div className={`ui-empty ${className}`}>
      <span className="ui-empty__icon">{icon || <Inbox size={28} />}</span>
      <span className="ui-empty__msg">{message}</span>
      {children}
    </div>
  );
}
