# SIG SOMELEC — Design System: "Centre de conduite réseau"

Dark technical **operations console**, map-as-hero. This doc is the shared contract for all
implementation agents. Tokens: `web/src/theme/tokens.css` (CSS vars) + `web/src/theme/tokens.js` (JS).

## Reference lock (refero-design)
- **Primary:** dark observability console (Grafana/Datadog density) × Linear precision, map-as-hero (Electricity Maps / Felt).
- **Preserve:** deep neutral graphite canvas (NOT indigo/blue), full-bleed map with floating chrome, compact density, monospace numeric readouts, 1px borders, near-sharp radius (4–6px).
- **Role rules (hard):** green/amber/red = **load-state signal only**; cyan `#38BDF8` = **interactive only** (focus/active/links). Never repurpose.
- **Reject:** indigo/violet, cards-as-default, decorative side stripes, emoji icons, averaged pastels, fake imagery.

## Typography
- UI: **Inter**. Numeric data (KPI numbers, codes, %, coords, kVA): **JetBrains Mono**, `font-variant-numeric: tabular-nums` (use `.mono`/`.tnum`).
- Uppercase micro-labels use `.caps` (11px, 0.08em tracking, secondary color).
- Hierarchy: KPI hero (mono 28px) › panel title (20) › section (16) › base (14) › secondary (13/12) › caps label (11).

## Color (see tokens)
- Canvas `--bg-base #0B0E14`; panels `--bg-surface #131722`; raised `--bg-surface-2`.
- Text primary `#E6E9EF`, secondary `#9AA4B2`, muted `#687185`.
- Load: normal `#2BB673`, surcharge `#F5A524`, critique `#F0453A`, inconnu `#5A6473`.
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
- KPI numbers **count up** on load/refresh (~600ms).
- **Critique pulse:** map critique markers + alert rows pulse (1.6s, low amplitude) — the one memorable detail.
- Chart series animate in on mount. Hover micro-lift on interactive rows/buttons. No gratuitous motion.

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
