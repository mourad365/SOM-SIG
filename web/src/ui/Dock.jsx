import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './ui.css';

// Bottom collapsible panel. Toggle handle; height var(--dock-h) when open.
export function Dock({ open, onToggle, title, icon, actions, children, height = 'var(--dock-h)' }) {
  return (
    <div className="ui-dock" style={{ height: open ? height : 'auto' }}>
      <div
        className="ui-dock__handle"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(); } }}
      >
        <span className="ui-dock__title">{icon}{title}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          {actions}
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </div>
      {open && <div className="ui-dock__body">{children}</div>}
    </div>
  );
}
