# SIG SOMELEC — Design System: "Centre de conduite réseau"

**LIGHT, SOMELEC-brand operations console**, map-as-hero. This doc is the shared contract for all
implementation agents. Tokens: `web/src/theme/tokens.css` (CSS vars) + `web/src/theme/tokens.js` (JS).

> **Theme: LIGHT + SOMELEC brand.** Cool-light canvas (`#F4F7FB`), white surfaces, deep-navy text.
> Brand primary = SOMELEC blue `#0E5BA6` (all interactive/chrome). Electric cyan `#08AEC8` = **electricity
> motif only** (signature current-flow animation on lines + the constellation wordmark mark; gold retired
> per ADR 0006). Default basemap is light **CARTO Voyager** (OpenStreetMap + satellite available via the
> basemap switch). Signature detail: a glowing electric-cyan **current-flow** ant-march travelling along
> the network lines, plus a radar-ping on critique transformers (ADR 0008).

## Reference lock (refero-design)
- **Primary:** light observability console (Grafana/Datadog density) × Linear precision, map-as-hero (Electricity Maps / Felt), SOMELEC institutional brand.
- **Preserve:** cool-light canvas, full-bleed map with floating chrome, compact density, monospace numeric readouts, 1px borders, near-sharp radius (4–6px).
- **Role rules (hard):** green/amber/red = **load-state signal only**; SOMELEC blue `#0E5BA6` = **interactive only** (focus/active/links/chrome); electric cyan `#08AEC8` = **electricity/live motif only** (current-flow, recent-asset emphasis, live heartbeat, constellation mark). Never repurpose.
- **Reject:** indigo/violet, energy-cyan-as-general-chrome, cards-as-default, decorative side stripes, emoji icons, averaged pastels, fake imagery, glassmorphism beyond floating map chrome.

## Typography
- UI: **Inter**. Numeric data (KPI numbers, codes, %, coords, kVA): **JetBrains Mono**, `font-variant-numeric: tabular-nums` (use `.mono`/`.tnum`).
- Uppercase micro-labels use `.caps` (11px, 0.08em tracking, secondary color).
- Hierarchy: KPI hero (mono 28px) › panel title (20) › section (16) › base (14) › secondary (13/12) › caps label (11).

## Color (see tokens)
- Canvas `--bg-base #F4F7FB`; panels `--bg-surface #FFFFFF`; raised `--bg-surface-2 #EEF3F9`.
- Text primary `#14223A`, secondary `#4A5A72`, muted `#8493A7`.
- Brand/interactive: SOMELEC blue `--brand`/`--accent` `#0E5BA6` (active tab, toggles ON, focus, links, selection).
- Energy/electricity: electric cyan `--energy` `#08AEC8` (bright `#2BD4EC`) — current-flow, recent-asset emphasis, live heartbeat + constellation mark **only**.
- Load: normal `#16A34A`, surcharge `#E0820C`, critique `#DC2626`, inconnu `#94A3B8` (tuned for white).
- Voltage palette (cool neutrals, for "color by voltage" mode only) in tokens.js `VOLTAGE`.

## Layout — app shell
```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR (48px): wordmark · global search · filter chips · refresh/MAJ │
├───┬──────────────────────────────────────────────────┬───────┤
│ L │                                                  │ RIGHT │
│ E │                  MAP (hero, full-bleed)          │ INSPEC│
│ F │                  floating legend bottom-left     │ TOR   │
│ T │                                                  │ (slide│
│RAIL                                                  │  -in) │
├───┴──────────────────────────────────────────────────┴───────┤
│ BOTTOM DOCK (collapsible): Tableau de bord — KPI strip · charts · alerts │
└──────────────────────────────────────────────────────────────┘
```
- **Top bar:** SOMELEC wordmark + "Centre de conduite réseau"; global search (asset code / poste); global filter chips (niveau tension, statut, classe); "Actualisé il y a …" + refresh.
- **Left rail** (collapsible 56↔260): layer toggles (Postes, Transformateurs, Lignes, Points de service, Supports), "Colorer par: Charge | Tension", Heatmap des surcharges toggle, basemap switch, legend.
- **Map:** hero. Click → inspector. Hover → tooltip. Floating zoom + scale.
- **Right inspector** (360, slide-in): asset header (code, type, classe badge), **radial load gauge**, stats grid (capacité, charge, taux, n° points), relations (poste/transfo amont), actions (zoom, centrer).
- **Bottom dock** (collapsible, ~280): KPI strip + charts + alerts tabs.

## Components (build in web/src/ui/, one file each, token-driven, no inline hex)
`Panel`, `Button` (variants: primary=accent, ghost, subtle, icon), `Badge` (load-state + neutral),
`Stat` (label caps + mono value + delta), `Gauge` (radial load %, SVG), `Table` (compact, sortable, hover row),
`Chip`/`FilterChip` (toggle), `Toggle`/`Switch`, `Select`, `SearchInput`, `Tabs`, `Tooltip`,
`Drawer` (right slide-in), `Dock` (bottom collapsible), `Legend`, `Spinner`, `EmptyState`, `Toast`.
Rule: a "card" is only used for an interactive container; otherwise use sections/dividers.

## Motion (gsap + CSS; respect prefers-reduced-motion)
- UI transitions 120–180ms `--ease-out`. Drawer/dock slide 280ms. Map flyTo ~800ms.
- View switches: map fades; full-screen views fade + rise (`--dur-slower`, `--ease-out-expo`).
- KPI numbers **count up** on load/refresh (~600ms); the radial gauge sweeps with `expo.out`.
- **Critique signature:** map critique markers are a **radar-ping ring**; alert rows + the gauge
  pulse/breathe (1.6s, low amplitude). The line current-flow glows and ant-marches (~11fps).
- Chart series animate in on mount. Hover micro-lift on interactive rows/buttons. No gratuitous motion.

## Bold pass — signature moments (ADR 0008)
Boldness is concentrated in the energy-cyan "live network" motif, not spread across the palette.
- **Map command-center framing:** a live electric hairline along the top edge + a soft focus
  vignette (both inert); floating chrome (alerts, legend, coordbar, capture, trace, tooltip) uses a
  translucent **HUD** treatment (`--bg-float` + `backdrop-filter`, `--shadow-float`). Glass is used
  here **only** — never as a default surface.
- **Live heartbeat:** top-bar "En direct" pulse (`.live-dot`, energy) + last-update time.
- **Instrument KPIs:** display-size hero numeral; full-tile load tint on Critique/Surcharge readouts.
- **Gauge:** surcharge/critique **threshold ticks** + a critical glow.
- **Loading = booting:** dashboard + assets table use layout-mirroring **skeletons** (`.skel`), not spinners.
- Glow/elevation tokens: `--glow-energy`, `--glow-critique`, `--shadow-float`. Display type: `--fs-3xl`.

## Feature backlog (bounded "all functionalities")
**Backend (api):** vector tiles for all layers (poste, transfo, ligne, point_service, support);
`/api/stats` (counts by type + by classe + network health %); `/api/histogramme` (full-fleet load bins);
`/api/assets` (filter: type, classe, niveau_tension, statut, q; sort; pagination); `/api/alertes` (surcharge+critique);
`/api/asset/:type/:id` (generalize: transfo + ligne, return geom lng/lat + relations); `/api/search?q=`.
**Seed:** ~6–8 postes, ~30 transfos, lignes network, ~250 points_service (clustered), supports; varied load mix.
**Map:** all layers toggle, color-by load/voltage, heatmap of surcharges, point clustering, filters, search/fly,
inspector, hover tooltip, legend, basemap switch (dark vector).
**Dashboard:** KPI strip (total, critique, surcharge, % sain, charge totale, n° postes), charts
(full-fleet load histogram, top-N overloaded bar, assets by type, load by poste), alerts panel
(sortable, click→fly+inspect), asset table (filter/sort/paginate).
**Polish:** gsap animations + review-animations audit; webapp-testing QA.

## Acceptance for the redesign
Screenshot test passes (looks like a real ops console, not AI slop); critique assets pulse and are
findable in <2s; every color traces to a role; no indigo; map is the hero; French UI throughout.
