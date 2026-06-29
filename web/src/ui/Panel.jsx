import React from 'react';
import './ui.css';

export function Panel({ title, caps = false, actions, children, className = '', bodyClassName = '', ...rest }) {
  return (
    <section className={`ui-panel ${className}`} {...rest}>
      {(title || actions) && (
        <div className="ui-panel__head">
          {title && <h3 className={`ui-panel__title ${caps ? 'caps' : ''}`}>{title}</h3>}
          {actions && <div className="ui-panel__actions">{actions}</div>}
        </div>
      )}
      <div className={`ui-panel__body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
