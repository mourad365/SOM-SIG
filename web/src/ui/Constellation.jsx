import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import './ui.css';

// Electric constellation mark — a small network of nodes wired together, with a
// packet of "current" that runs along the spine like electricity through a line.
// It is the app's identity glyph (top-bar wordmark) and the ambient empty-state
// motif. Energy = electric cyan (var(--energy)); see tokens / ADR 0006.
//
// Geometry lives in a 0..24 viewBox so the same mark scales crisp at any `size`.
// `spine` is the lit current path; `links` are the dim background wires.
const NODES = [
  { x: 4,  y: 5  }, // 0 — top-left source
  { x: 12, y: 11 }, // 1 — hub
  { x: 8,  y: 16 }, // 2 — lower branch
  { x: 20, y: 8  }, // 3 — upper branch
  { x: 13, y: 21 }, // 4 — sink
];
const LINKS = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 1]];
const SPINE = [0, 1, 4]; // current travels source → hub → sink (a node-built bolt)

const path = (idx) => idx.map((i, k) => `${k ? 'L' : 'M'}${NODES[i].x} ${NODES[i].y}`).join(' ');
const SPINE_D = path(SPINE);

export function Constellation({ size = 26, className = '', title = 'Réseau' }) {
  const root = useRef(null);

  useGSAP(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // static lit frame is fine — CSS leaves it visible

    // Two independent loops so neither stalls the other:
    // (1) the current packet runs the spine continuously (period = dash period, 24).
    gsap.fromTo('.cst-current',
      { strokeDashoffset: 24 },
      { strokeDashoffset: 0, duration: 1.6, ease: 'none', repeat: -1 });
    // (2) nodes breathe softly, staggered, like the line is energised.
    gsap.to('.cst-node', {
      opacity: 1, duration: 0.7, ease: 'sine.inOut',
      repeat: -1, yoyo: true, stagger: { each: 0.16, from: 'start' },
    });
  }, { scope: root });

  return (
    <svg
      ref={root}
      className={`cst ${className}`}
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" role="img" aria-label={title}
    >
      {LINKS.map(([a, b], i) => (
        <line key={i} className="cst-wire"
          x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
      ))}
      <path className="cst-spine" d={SPINE_D} />
      <path className="cst-current" d={SPINE_D} pathLength="24" />
      {NODES.map((n, i) => (
        <circle key={i} className={`cst-node${i === 1 ? ' cst-node--hub' : ''}`}
          cx={n.x} cy={n.y} r={i === 1 ? 2 : 1.5} />
      ))}
    </svg>
  );
}
