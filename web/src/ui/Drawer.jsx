import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button.jsx';
import './ui.css';

// Right slide-in panel. ESC closes. Backdrop optional.
export function Drawer({ open, onClose, title, backdrop = false, children, footer }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {backdrop && (
        <div
          className={`ui-drawer__backdrop ${open ? 'ui-drawer__backdrop--open' : ''}`}
          style={{ pointerEvents: open ? 'auto' : 'none' }}
          onClick={onClose}
        />
      )}
      <aside
        className={`ui-drawer ${open ? 'ui-drawer--open' : ''}`}
        role="dialog"
        aria-hidden={!open}
        aria-label={title}
      >
        <div className="ui-drawer__head">
          <h3 className="ui-panel__title">{title}</h3>
          <Button variant="icon" size="sm" aria-label="Fermer" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <div className="ui-drawer__body">{children}</div>
        {footer && <div className="ui-drawer__head" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: 'none' }}>{footer}</div>}
      </aside>
    </>
  );
}
