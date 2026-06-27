import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

// Animates a numeric readout from its previous value to `target` over ~0.6s.
// `format(n)` controls display (default: French locale integer). Non-numeric
// targets (null/NaN) are rendered as-is. Reduced-motion -> set final instantly.
//
// Returns a ref to attach to the text node whose textContent is animated.
export function useCountUp(target, { format, duration = 0.6 } = {}) {
  const ref = useRef(null);
  const prev = useRef(0);
  const fmt = format || ((n) => Math.round(n).toLocaleString('fr-FR'));

  useGSAP(() => {
    const node = ref.current;
    if (!node) return;

    const numeric = typeof target === 'number' && Number.isFinite(target);
    if (!numeric) {
      // Non-numeric value (e.g. "—"): render as-is, nothing to animate.
      node.textContent = target == null ? '—' : String(target);
      return;
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      node.textContent = fmt(target);
      prev.current = target;
      return;
    }

    const counter = { v: prev.current };
    gsap.to(counter, {
      v: target,
      duration,
      ease: 'power2.out',
      onUpdate: () => { node.textContent = fmt(counter.v); },
      onComplete: () => { prev.current = target; },
    });
  }, { dependencies: [target] });

  return ref;
}
