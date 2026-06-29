import React from 'react';
import { useCountUp } from './useCountUp.js';

// Renders a numeric value that count-ups from its previous value on change.
// Non-numeric `value` (null / "—" / strings) renders as-is, no animation.
// `format(n)` controls display; defaults to French integer formatting.
export function CountUpValue({ value, format }) {
  const ref = useCountUp(value, { format });
  return <span ref={ref} />;
}
