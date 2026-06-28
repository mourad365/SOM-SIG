# 0006 — Retire gold; electric-cyan constellation identity

Status: Accepted

## Context
The light brand theme (ADR-era design system, `docs/design/design-system.md`) defined two
accents: SOMELEC institutional blue `#0E5BA6` for all interactive/chrome, and gold `#F4B400`
reserved for the "electricity motif" — the wordmark bolt and the animated current-flow on lines.
The top-left identity was a literal `SOMELEC` wordmark with a gold `Zap` (lightning) glyph.

## Problem
The owner asked to drop the explicit `SOMELEC` name and the gold "flash logo", and to remove gold
from the entire app, while keeping — and strengthening — the electricity feeling. With gold gone,
the electricity role needs a new color, and the identity needs a mark that is no longer a literal
bolt but still reads as "live electrical network".

## Options considered
1. **Keep a recolored bolt (blue).** Smallest change. Rejected: a blue bolt collides with the
   "blue = interactive only" rule and still looks like a stock lightning icon.
2. **Plain text wordmark, no glyph.** Quietest. Rejected: loses the network/electricity identity
   the product is about.
3. **Electric-cyan constellation mark + retire gold (chosen).** Replace gold with electric cyan
   `#08AEC8` as the `--energy` accent, and replace the bolt with a small node-and-wire constellation
   that carries a travelling "current" packet — a bolt *built out of the network itself*. Inspired by
   the S2M constellation hero reference.

## Decision
- `--energy` / `BRAND.electric` is now electric cyan `#08AEC8` (deep `#0B7C97`). Gold is removed
  app-wide; `BRAND.gold`/`goldDeep` renamed to `electric`/`electricDeep`.
- The role rule is unchanged in spirit: **energy accent = electricity motif ONLY** (line current-flow,
  recent-asset emphasis, and the constellation mark). Blue stays interactive-only; load colors unchanged.
- New `web/src/ui/Constellation.jsx` is the identity glyph: top-bar wordmark (`Conduite réseau` /
  `Réseau électrique`) and the default `EmptyState` motif. Current travels the spine via GSAP
  (dash-offset), matching the map's ant-march; static under `prefers-reduced-motion`.

## Why
Cyan is a stronger "electricity" signal than gold on a cool-light canvas, is distinct from the brand
blue, and is not on the design system's reject list (indigo/violet). A constellation reads as a network
operations product far better than a literal bolt, and reuses one mark across chrome and empty states.

## Consequences
- `docs/design/design-system.md` references to "gold" / "wordmark bolt" are superseded by this record
  (gold → electric cyan; bolt → constellation). Update the prose there on next edit.
- Any future "color by …" or chart work must not reintroduce gold; use `--energy` for electricity only.
