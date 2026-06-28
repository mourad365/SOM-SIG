# Project Rules for Claude — SOM-SIG

> Global engineering rules are inherited from `~/.claude/CLAUDE.md`
> (Think Before Coding, Right-Size the Effort, Reuse > Enhance > Create,
> Minimal-Code, Non-Breaking Enhancements, Decision Documentation).
> Only add **project-specific** rules below — don't duplicate the global ones.

## Stack & conventions

SIG SOMELEC — web map + dashboard over a PostGIS electrical network (Nouakchott pilot),
highlighting overloaded transformers/lines.

- **DB:** PostgreSQL/PostGIS. Host PostGIS port is **5433** (`POSTGRES_PORT` in `.env`); the
  API talks to the `db:5432` container internally. Schema decisions in `docs/decisions/` (ADR 0001–0004).
- **API:** `api/` — Express 4, `pg`, ES modules (`"type": "module"`). Serves the React app data
  and vector tiles via `ST_AsMVT`. Run: `cd api && npm install && npm test` (uses `node --test`).
- **Web:** `web/` — React 18 + Vite + MapLibre GL. GSAP for motion, Recharts for charts,
  `lucide-react` for icons. Run: `npm run dev` (port 5173).
- **Full stack:** `docker compose up -d --build` (web 5173 · api 3001 · tiles `.../tiles/transfo/z/x/y.pbf`).
- French is the product language (UI copy, README, ADRs). Keep user-facing strings in French.

## Project-specific reuse map

- **Shared UI primitives:** `web/src/ui/` — Badge, Button, Chip, Gauge, Panel, Table, Tabs, Drawer,
  EmptyState, Spinner, etc. (barrel export in `web/src/ui/index.js`). **Reuse these before hand-rolling.**
- **Design tokens:** `web/src/theme/tokens.css` + `tokens.js` (light SOMELEC brand theme). No hard-coded colors.
- **Map:** `web/src/map/` — `Map.jsx`, `style.js` (layer styling), `coords.js`, `MapAlerts`, `MapLegend`.
- **Dashboard:** `web/src/dashboard/` — KpiStrip, Charts, AlertsPanel, AssetsTable.
- **App shell:** `web/src/shell/` — TopBar, LeftRail, Inspector.
- **Frontend API client:** `web/src/api.js`. **Backend:** `api/src/` — `api.js` (routes), `db.js` (pg pool),
  `tiles.js` (MVT), `server.js` (entry).

## Decision records

Non-trivial decisions go in `docs/decisions/NNNN-kebab-title.md` (see global rules
for the format). Check there before designing in an area; don't re-litigate.

## GitNexus

This repo can be indexed by GitNexus. If a tool reports the index is stale, run
`npx gitnexus analyze` before relying on impact/query results. Run
`gitnexus_impact` before editing shared symbols; `gitnexus_detect_changes` before committing.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **SOM-SIG** (725 symbols, 974 relationships, 17 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/SOM-SIG/context` | Codebase overview, check index freshness |
| `gitnexus://repo/SOM-SIG/clusters` | All functional areas |
| `gitnexus://repo/SOM-SIG/processes` | All execution flows |
| `gitnexus://repo/SOM-SIG/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
