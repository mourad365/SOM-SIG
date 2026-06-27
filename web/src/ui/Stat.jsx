import React from 'react';
import './ui.css';

// label (caps) + mono value + optional unit/delta. valueColor overrides for load signal.
export function Stat({ label, value, unit, delta, deltaColor, valueColor, hero = false, className = '', ...rest }) {
  return (
    <div className={`ui-stat ${hero ? 'ui-stat--hero' : ''} ${className}`} {...rest}>
      {label && <span className="ui-stat__label caps">{label}</span>}
      <div className="ui-stat__row">
        <span className="ui-stat__value" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
        {unit && <span className="ui-stat__unit">{unit}</span>}
        {delta != null && (
          <span className="ui-stat__delta" style={deltaColor ? { color: deltaColor } : undefined}>{delta}</span>
        )}
      </div>
    </div>
  );
}
