# SIG SOMELEC — Détection de surcharge réseau · Design Spec

**Date:** 2026-06-27
**Status:** Approved (brainstorming decisions locked)
**Pilot:** Nouakchott

## 1. Purpose

Give SOMELEC a web dashboard + web map over their electrical network (PostGIS) that makes
**overloaded lines and transformers ("surcharge / excès") visually pop out as hotspots**, so
operators and planners can decide where to reinforce the grid. The same PostGIS database is
edited natively in QGIS by the GIS team — one source of truth, two clients (QGIS + web).

## 2. Locked decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Load source | **Static SQL heuristic** | No telemetry needed; one set of SQL views; upgradable to pandapower/SCADA later without schema rewrite. |
| Schema | **Simplified MCD** (7 tables) | Fast pilot for Nouakchott; full MCD (nœuds/départs) deferred. |
| Stack | **PERN** (PostgreSQL/PostGIS · Express · React · Node) | MERN with Postgres swapped for Mongo. PostGIS is mandatory (QGIS editing, spatial index, SQL load views). |
| Tiles | **Express `ST_AsMVT()`** | No Rust, no separate tile server. One Node service serves tiles + API. |
| Map | **MapLibre GL JS** | Data-driven styling makes thresholded overloads "pop out". |

## 3. Scope

**In scope (pilot):**
- PostGIS schema for the 7 simplified-MCD tables + reference/params tables.
- Static load-% computation via SQL views for transformers and (attributed) lines.
- Express service: MVT vector tiles + dashboard JSON API.
- React app: interactive map (color/glow by load, "overloaded only" filter) + dashboard (KPIs, top-10, histogram).
- QGIS connection doc + styled `.qgz` project on the same DB.
- Seed data for Nouakchott including one deliberately overloaded transformer (acceptance fixture).

**Out of scope (future):**
- Real load-flow (pandapower), SCADA/AMI live feeds, full-MCD topology/connectivity tracing, authentication/multi-user roles, mobile app, historical time-series.

## 4. Data model (simplified MCD, 7 tables)

Tables (all geometry SRID **32628**, GIST-indexed): `niveau_tension`, `poste`, `transformateur`,
`ligne`, `support`, `abonne`, `point_service`. Chain: `POSTE → TRANSFORMATEUR → POINT_SERVICE → ABONNE`.

**Schema additions (non-breaking, this spec):**
1. `ligne.transfo_id` — **nullable** FK → `transformateur`. Attributes a line to the equipment it
   feeds so it inherits downstream load. Lines left NULL render as "load unknown" (grey). No existing
   row breaks (nullable). *Recorded in ADR 0004.*
2. `parametre` (key/value) — tunable coefficients: `cos_phi` (0.90), `facteur_foisonnement` (0.60),
   `seuil_alerte` (0.80), `seuil_critique` (1.00). Editable without redeploy.
3. `ampacite_cable` (section_mm2, type_pose) → `capacite_a` — rated conductor ampacity lookup.

## 5. Load heuristic (core business logic)

All coefficients read from `parametre`. Classification: `critique` if `taux_charge ≥ seuil_critique`,
`surcharge` if `≥ seuil_alerte`, else `normal`. Lines with no attribution → `inconnu`.

**Transformer** (`v_charge_transformateur`):
```
charge_kva  = Σ(point_service.puiss_souscrite_kw of its points) × facteur_foisonnement / cos_phi
taux_charge = charge_kva / transformateur.puissance_kva
```

**Line** (`v_charge_ligne`), only when `ligne.transfo_id` is set:
```
U_kv        = numeric(niveau_tension.valeur)            -- e.g. '33 kV' → 33
capacite_a  = ampacite_cable(section_mm2, type_pose)
charge_a    = (charge_kva of attributed transfo) / (sqrt(3) × U_kv × cos_phi)
taux_charge = charge_a / capacite_a
```

Views are plain `VIEW`s at pilot scale. If slow, convert to `MATERIALIZED VIEW` + `REFRESH`
(documented, but YAGNI until measured).

## 6. Architecture & data flow

```
QGIS (edit) ─┐
             ├─► PostgreSQL/PostGIS ─► SQL views (taux_charge, classe) ─┬─► Express GET /tiles/:layer/:z/:x/:y.pbf  (ST_AsMVT) ─► MapLibre map
(future SCADA)┘                                                        └─► Express GET /api/{kpi,top-surcharges,asset} ─► React dashboard
```

**Components (one responsibility each):**
- `db/` — SQL migrations (idempotent, ordered), seed, views. No app logic.
- `api/src/db.js` — single `pg` Pool. `api/src/tiles.js` — MVT route. `api/src/api.js` — aggregate routes. `api/src/server.js` — Express wiring. Split by responsibility, not layer.
- `web/src/map/` — MapLibre setup + load-based style expressions + legend + filter.
- `web/src/dashboard/` — KPI cards, top-10 table, histogram.
- `web/src/api.js` — fetch wrapper for the Express API.

## 7. Error handling

- **DB layer:** `pg` Pool with connection error logging; queries parameterized (no string-built SQL) — security by default.
- **Tile route:** invalid `z/x/y` or unknown `:layer` → `400`; empty tile → `204`; DB error → `500` + logged, never leaks SQL.
- **API route:** validate path params; unknown asset → `404`; DB error → `500` JSON `{error}`.
- **Web:** map source error → non-blocking toast + grey layer; API fetch failure → dashboard shows "données indisponibles", map still usable.
- **Heuristic edge cases:** `puissance_kva = 0` or NULL → `taux_charge = NULL`, classe `inconnu` (no divide-by-zero); transformer with zero points → `taux_charge = 0`, classe `normal`.

## 8. Testing strategy

- **SQL views (data tests):** seed known inputs, assert exact `taux_charge`/`classe`. The trap transformer (subscribed load > capacity) must come out `critique`. Divide-by-zero guard test.
- **Express tiles:** request a known tile → `200`, `Content-Type: application/x-protobuf`, non-empty body; bad params → `400`.
- **Express API:** `/api/top-surcharges` includes the trap transformer first; `/api/kpi` counts match a direct SQL count.
- **Web:** the trap transformer renders red and is in the top-10 table; "overloaded only" filter hides `normal` assets. (Playwright via webapp-testing.)
- **End-to-end acceptance:** the trap fixture is visible as a hotspot across the whole chain — SQL → tile → red on map → top of dashboard.

## 9. ADRs to record (docs/decisions/)

1. `0001` PostGIS single source of truth + QGIS as editor.
2. `0002` Express `ST_AsMVT` tiles (PERN, no Rust) over Martin/GeoServer.
3. `0003` Static SQL heuristic vs load-flow — evolution path to pandapower.
4. `0004` Nullable `ligne.transfo_id` for line load attribution.

## 10. Future evolution (non-breaking paths)

- Swap heuristic → **pandapower** load-flow (full-MCD topology already supports it).
- Add `mesure` time-series table fed by SCADA/AMI → real-time hotspots.
- Migrate to full MCD (nœuds, départs, organes) for connectivity tracing.
- AuthN/Z (roles: viewer/planner/admin).
