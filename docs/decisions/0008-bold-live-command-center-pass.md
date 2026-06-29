# 0008 — Bold "live command-center" design pass

Status: Accepted

## Context
After ADR 0006 (retire gold; electric-cyan energy accent) the web app reached a high-craft
but deliberately quiet baseline: token-driven, role-disciplined color, restrained motion. The
owner asked for a **bolder, more distinctive** design pass — signature moments and a stronger
"this is a live operations console" presence — while keeping the committed light theme and the
hard color-role rules.

## Problem
Elevate from "good professional console" to "distinctive live command-center" without:
- going dark or repainting the palette (violates the LIGHT decision + ADR 0006),
- repurposing colors (green/amber/red = load signal; blue = interactive; electric cyan = energy),
- adding AI-slop patterns (side-stripe accents, decorative glassmorphism, gradient text, hero-metric template).

## Options considered
1. **Repaint / dark mode.** Most dramatic. Rejected: violates the light + brand decisions.
2. **Surface polish only** (spacing, type). Safe but not distinctive enough for the ask.
3. **Signature-moment bold pass within the existing constraints (chosen).** Keep the system; add
   depth, glow, and a coherent "energised live network" motif at a handful of high-impact moments.

## Decision
Additive token layer + targeted component work. Role discipline preserved throughout.

- **Tokens** (`theme/tokens.css` + `.js`): expanded electric-cyan scale (`--energy-bright`,
  `--energy-faint`, `--energy-grad`), glow elevation (`--glow-energy`, `--glow-critique`),
  translucent floating-HUD surfaces (`--bg-float`, `--border-float`, `--shadow-float`), a display
  numeral size (`--fs-3xl`) + `--tracking-tight`, and expo motion curves / longer signature durations.
- **Map hero**: a live electric hairline along the top edge + a soft focus vignette (both inert);
  the critique marker is now a **radar-ping ring**; the current-flow line glows (`line-blur`,
  `--energy-bright`); all floating chrome (alerts, legend, coordbar, capture, trace, tooltip) adopts
  the translucent HUD treatment.
- **Identity / top bar**: a live "En direct" heartbeat (energy `live-dot`) with last-update time;
  stronger wordmark + a more decisive active-nav state.
- **Dashboard**: KPI cluster with a display-size hero numeral and full-tile load tints on the
  Critique/Surcharge readouts; charts gain hairline gridlines and more height; the radial **Gauge**
  gains surcharge/critique threshold ticks and a critical glow.
- **Motion**: view-level entrance transitions (map fades; full-screen views fade + rise).
- **States**: dashboard + assets-table loading now use **skeletons** that mirror the real layout;
  clearer error state.
- **Anti-slop fix**: the alert-row `inset 2px` **side-stripe** is removed in favour of a full-row
  load tint + the existing pulsing status dot (side-stripe accents are banned).

## Why
The "live electrical current" metaphor is the product's most ownable idea; concentrating boldness
into energy-cyan signature moments (radar ping, glowing wire, live heartbeat, energised map edge)
reads as a real network operations console and stays clear of the category-reflex (dark + neon).
Glassmorphism is used **only** where it is genuinely purposeful — instrumentation floating over a
live basemap — not as a default surface.

## Consequences
- `backdrop-filter` is now used on map-floating chrome; it is GPU-cheap at these sizes and degrades
  to a solid-ish translucent fill where unsupported. Keep it scoped to map HUD chrome only.
- All new motion respects `prefers-reduced-motion` (per-rule guards + the global parker).
- `docs/design/design-system.md` is updated to match (gold references finally retired per ADR 0006,
  plus a "Bold pass" section). Future work must keep the role rules intact and must not spread the
  HUD/glass treatment beyond floating map chrome.
