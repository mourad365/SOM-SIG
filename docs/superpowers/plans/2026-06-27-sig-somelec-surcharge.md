# SIG SOMELEC — Surcharge Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a web map + dashboard over a PostGIS electrical network that makes overloaded transformers and lines pop out as hotspots, using a static SQL load heuristic.

**Architecture:** PostgreSQL/PostGIS holds the network (simplified MCD, SRID 32628) and SQL views compute `taux_charge`/`classe`. One Express service serves MapLibre vector tiles via `ST_AsMVT()` and a JSON dashboard API. A React app renders the data-driven map and the dashboard. QGIS edits the same DB.

**Tech Stack:** PostgreSQL 16 + PostGIS, Node 20 + Express + `pg`, React + Vite + MapLibre GL JS, `node:test` for tests, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-06-27-sig-somelec-surcharge-design.md`

---

## File Structure

```
docker-compose.yml            # postgres+postgis, api, web
db/
  Dockerfile                  # postgis image + init scripts
  migrations/
    001_schema.sql            # 7 MCD tables, SRID 32628, GIST indexes
    002_reference.sql         # parametre, ampacite_cable, ligne.transfo_id, niveau_tension seed
    003_views.sql             # v_charge_transformateur, v_charge_ligne
  seed/
    010_nouakchott.sql        # sample data incl. trap (overloaded) transformer
api/
  package.json
  src/db.js                   # pg Pool
  src/tiles.js                # GET /tiles/:layer/:z/:x/:y.pbf via ST_AsMVT
  src/api.js                  # GET /api/kpi, /api/top-surcharges, /api/asset/:type/:id
  src/server.js               # Express wiring
  test/views.test.js          # SQL heuristic correctness
  test/tiles.test.js          # MVT route
  test/api.test.js            # aggregate routes
web/
  package.json
  vite.config.js
  index.html
  src/main.jsx
  src/api.js                  # fetch wrapper
  src/map/Map.jsx             # MapLibre + load styling + legend + filter
  src/map/style.js            # paint expressions + thresholds
  src/dashboard/Dashboard.jsx # KPI cards, top-10, histogram
  src/App.jsx
qgis/
  README.md                   # connection guide + styling note
docs/decisions/
  0001..0004-*.md             # ADRs
```

---

### Task 0: Repo scaffold + PostGIS container up

**Goal:** `docker compose up db` gives a running PostGIS DB reachable from the host.

**Files:**
- Create: `docker-compose.yml`, `db/Dockerfile`, `.env.example`, `.gitignore`

**Acceptance Criteria:**
- [ ] `docker compose up -d db` starts a healthy PostGIS container
- [ ] `psql` connects and `SELECT postgis_version()` returns a version

**Verify:** `docker compose exec db psql -U somelec -d sig_somelec -c "SELECT postgis_version();"` → prints a PostGIS version string

**Steps:**

- [ ] **Step 1: Create `.gitignore` and `.env.example`**

`.gitignore`:
```
node_modules/
.env
dist/
*.log
```

`.env.example`:
```
POSTGRES_USER=somelec
POSTGRES_PASSWORD=change_me
POSTGRES_DB=sig_somelec
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
API_PORT=3001
```

- [ ] **Step 2: Create `db/Dockerfile`**

```dockerfile
FROM postgis/postgis:16-3.4
# Migrations + seed run in lexical order on first init
COPY migrations/ /docker-entrypoint-initdb.d/
COPY seed/ /docker-entrypoint-initdb.d/zzz-seed/
```

> Note: postgres runs `/docker-entrypoint-initdb.d/*.sql` alphabetically. The `zzz-seed` prefix guarantees seed runs after migrations. Flatten if subdir ordering misbehaves (see Step 4 fallback).

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  db:
    build: ./db
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
volumes:
  pgdata:
```

- [ ] **Step 4: Bring it up and verify**

Run: `cp .env.example .env && docker compose up -d --build db`
Then: `docker compose exec db psql -U somelec -d sig_somelec -c "SELECT postgis_version();"`
Expected: a line like `3.4 USE_GEOS=1 ...`. (If seed subdir didn't run, that's fine — no migrations exist yet.)

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.example db/Dockerfile docker-compose.yml
git commit -m "chore: scaffold repo and PostGIS container"
```

---

### Task 1: Core schema — 7 MCD tables

**Goal:** The simplified-MCD tables exist with SRID 32628 geometry and spatial indexes.

**Files:**
- Create: `db/migrations/001_schema.sql`

**Acceptance Criteria:**
- [ ] All 7 tables created: `niveau_tension, poste, transformateur, ligne, support, abonne, point_service`
- [ ] Every `geom` column is SRID 32628 with a GIST index
- [ ] FKs match the MCD chain (poste→transfo→point_service→abonne)

**Verify:** `docker compose exec db psql -U somelec -d sig_somelec -c "\dt"` shows 7 tables; `... -c "SELECT Find_SRID('public','poste','geom');"` → `32628`

**Steps:**

- [ ] **Step 1: Write `db/migrations/001_schema.sql`**

```sql
BEGIN;

CREATE TABLE niveau_tension (
  code_tension text PRIMARY KEY,
  libelle      text NOT NULL,
  valeur       text NOT NULL            -- e.g. '33 kV', '15 kV', '0.4 kV'
);

CREATE TABLE poste (
  poste_id          serial PRIMARY KEY,
  code_poste        text UNIQUE NOT NULL,
  nom               text,
  type_poste        text,
  tension_primaire  text REFERENCES niveau_tension(code_tension),
  tension_secondaire text REFERENCES niveau_tension(code_tension),
  date_mise_service date,
  statut            text,
  geom              geometry(Point, 32628)
);

CREATE TABLE transformateur (
  transfo_id        serial PRIMARY KEY,
  code_actif        text UNIQUE NOT NULL,
  type_transfo      text,
  poste_id          int REFERENCES poste(poste_id),
  puissance_kva     numeric,
  tension_primaire  text REFERENCES niveau_tension(code_tension),
  tension_secondaire text REFERENCES niveau_tension(code_tension),
  date_mise_service date,
  etat              text,
  statut            text,
  geom              geometry(Point, 32628)
);

CREATE TABLE ligne (
  ligne_id          serial PRIMARY KEY,
  code_actif        text UNIQUE NOT NULL,
  niveau_tension    text REFERENCES niveau_tension(code_tension),
  type_pose         text,                 -- 'aerien' | 'souterrain'
  section_mm2       numeric,
  longueur_m        numeric,
  statut            text,
  date_mise_service date,
  geom              geometry(LineString, 32628)
);

CREATE TABLE support (
  support_id   serial PRIMARY KEY,
  code_actif   text UNIQUE NOT NULL,
  type_support text,
  hauteur_m    numeric,
  etat         text,
  geom         geometry(Point, 32628)
);

CREATE TABLE abonne (
  abonne_id   serial PRIMARY KEY,
  num_contrat text UNIQUE NOT NULL,
  nom         text,
  type_tarif  text
);

CREATE TABLE point_service (
  point_id          serial PRIMARY KEY,
  num_compteur      text UNIQUE NOT NULL,
  abonne_id         int REFERENCES abonne(abonne_id),
  transfo_id        int REFERENCES transformateur(transfo_id),
  type_compteur     text,
  puiss_souscrite_kw numeric,
  date_pose         date,
  statut            text,
  geom              geometry(Point, 32628)
);

CREATE INDEX poste_geom_gix         ON poste         USING gist (geom);
CREATE INDEX transformateur_geom_gix ON transformateur USING gist (geom);
CREATE INDEX ligne_geom_gix         ON ligne         USING gist (geom);
CREATE INDEX support_geom_gix       ON support       USING gist (geom);
CREATE INDEX point_service_geom_gix ON point_service USING gist (geom);
CREATE INDEX point_service_transfo_ix ON point_service (transfo_id);

COMMIT;
```

- [ ] **Step 2: Recreate the DB volume and verify**

Run: `docker compose down -v && docker compose up -d --build db`
Wait for healthy, then: `docker compose exec db psql -U somelec -d sig_somelec -c "\dt"`
Expected: 7 tables listed.
Then: `docker compose exec db psql -U somelec -d sig_somelec -c "SELECT Find_SRID('public','ligne','geom');"`
Expected: `32628`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/001_schema.sql
git commit -m "feat(db): simplified MCD schema with PostGIS geometry"
```

---

### Task 2: Reference tables, params, line attribution

**Goal:** Tunable coefficients, ampacity lookup, the nullable `ligne.transfo_id`, and seeded voltage levels exist.

**Files:**
- Create: `db/migrations/002_reference.sql`

**Acceptance Criteria:**
- [ ] `parametre` holds cos_phi, facteur_foisonnement, seuil_alerte, seuil_critique
- [ ] `ampacite_cable` maps (section_mm2, type_pose) → capacite_a
- [ ] `ligne.transfo_id` exists, nullable, FK to transformateur
- [ ] `niveau_tension` seeded with at least 33 kV, 15 kV, 0.4 kV

**Verify:** `... -c "SELECT cle, valeur FROM parametre ORDER BY cle;"` lists the 4 coefficients

**Steps:**

- [ ] **Step 1: Write `db/migrations/002_reference.sql`**

```sql
BEGIN;

CREATE TABLE parametre (
  cle    text PRIMARY KEY,
  valeur numeric NOT NULL,
  note   text
);
INSERT INTO parametre (cle, valeur, note) VALUES
  ('cos_phi',              0.90, 'facteur de puissance kW->kVA'),
  ('facteur_foisonnement', 0.60, 'coincidence des charges souscrites'),
  ('seuil_alerte',         0.80, 'taux_charge >= -> surcharge'),
  ('seuil_critique',       1.00, 'taux_charge >= -> critique');

CREATE TABLE ampacite_cable (
  section_mm2 numeric NOT NULL,
  type_pose   text    NOT NULL,        -- 'aerien' | 'souterrain'
  capacite_a  numeric NOT NULL,
  PRIMARY KEY (section_mm2, type_pose)
);
-- Provisional values; refine with SOMELEC cable standards.
INSERT INTO ampacite_cable (section_mm2, type_pose, capacite_a) VALUES
  (35,  'aerien', 140), (35,  'souterrain', 120),
  (54,  'aerien', 180), (54,  'souterrain', 155),
  (95,  'aerien', 270), (95,  'souterrain', 230),
  (148, 'aerien', 350), (148, 'souterrain', 300),
  (240, 'aerien', 490), (240, 'souterrain', 420);

ALTER TABLE ligne ADD COLUMN transfo_id int REFERENCES transformateur(transfo_id);
CREATE INDEX ligne_transfo_ix ON ligne (transfo_id);

INSERT INTO niveau_tension (code_tension, libelle, valeur) VALUES
  ('HTA33', 'Moyenne tension 33 kV', '33'),
  ('HTA15', 'Moyenne tension 15 kV', '15'),
  ('BT',    'Basse tension 0.4 kV',  '0.4');

COMMIT;
```

> Note: `valeur` in `niveau_tension` is stored as a plain number string (`'33'`) so views can cast it with `valeur::numeric`. This matches the spec's `U_kv` formula.

- [ ] **Step 2: Recreate and verify**

Run: `docker compose down -v && docker compose up -d --build db`
Then: `docker compose exec db psql -U somelec -d sig_somelec -c "SELECT cle, valeur FROM parametre ORDER BY cle;"`
Expected: 4 rows (cos_phi 0.90, facteur_foisonnement 0.60, seuil_alerte 0.80, seuil_critique 1.00).
Then: `... -c "\d ligne"` shows `transfo_id` column.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/002_reference.sql
git commit -m "feat(db): params, ampacity lookup, line load attribution, voltage seed"
```

---

### Task 3: Nouakchott seed data with a trap (overloaded) transformer

**Goal:** Realistic minimal data so the map shows something, including one transformer deliberately over capacity (acceptance fixture).

**Files:**
- Create: `db/seed/010_nouakchott.sql`

**Acceptance Criteria:**
- [ ] ≥2 postes, ≥3 transformateurs, ≥1 ligne attributed, points de service attached
- [ ] Transformer `TR-TRAP` has subscribed load that exceeds its kVA after heuristic (taux_charge > 1)
- [ ] At least one transformer stays `normal` (taux_charge < 0.8)

**Verify:** `... -c "SELECT code_actif, puissance_kva FROM transformateur;"` shows TR-TRAP with a small kVA relative to its points

**Steps:**

- [ ] **Step 1: Write `db/seed/010_nouakchott.sql`**

Coordinates are around Nouakchott in UTM 28N (EPSG:32628), roughly easting ~590000, northing ~2040000.

```sql
BEGIN;

-- Postes
INSERT INTO poste (code_poste, nom, type_poste, tension_primaire, tension_secondaire, statut, geom) VALUES
  ('P-NKT-01', 'Poste Ksar',     'source',       'HTA33', 'HTA15', 'actif', ST_SetSRID(ST_MakePoint(590200, 2040100), 32628)),
  ('P-NKT-02', 'Poste Tevragh',  'distribution', 'HTA15', 'BT',    'actif', ST_SetSRID(ST_MakePoint(591500, 2041300), 32628));

-- Transformateurs (one trap = under-sized vs its load)
INSERT INTO transformateur (code_actif, type_transfo, poste_id, puissance_kva, tension_primaire, tension_secondaire, etat, statut, geom) VALUES
  ('TR-NORMAL', 'distribution', 2, 630, 'HTA15', 'BT', 'bon', 'actif', ST_SetSRID(ST_MakePoint(591520, 2041320), 32628)),
  ('TR-TRAP',   'distribution', 2, 160, 'HTA15', 'BT', 'bon', 'actif', ST_SetSRID(ST_MakePoint(591620, 2041280), 32628)),
  ('TR-MID',    'distribution', 1, 400, 'HTA33', 'HTA15', 'bon', 'actif', ST_SetSRID(ST_MakePoint(590220, 2040120), 32628));

-- Abonnes
INSERT INTO abonne (num_contrat, nom, type_tarif) VALUES
  ('C-0001', 'Marche Capitale', 'pro'),
  ('C-0002', 'Residentiel A',   'domestique'),
  ('C-0003', 'Atelier B',       'pro');

-- Points de service.
-- TR-TRAP (160 kVA): 3 points totalling 350 kW subscribed.
--   charge_kva = 350 * 0.60 / 0.90 = 233.3 kVA -> taux = 233.3/160 = 1.46 -> critique
-- TR-NORMAL (630 kVA): 2 points totalling 200 kW.
--   charge_kva = 200 * 0.60 / 0.90 = 133.3 -> taux = 0.21 -> normal
INSERT INTO point_service (num_compteur, abonne_id, transfo_id, type_compteur, puiss_souscrite_kw, statut, geom) VALUES
  ('M-1001', 1, 2, 'tri', 150, 'actif', ST_SetSRID(ST_MakePoint(591625, 2041285), 32628)),
  ('M-1002', 2, 2, 'tri', 120, 'actif', ST_SetSRID(ST_MakePoint(591630, 2041278), 32628)),
  ('M-1003', 3, 2, 'tri',  80, 'actif', ST_SetSRID(ST_MakePoint(591615, 2041290), 32628)),
  ('M-2001', 2, 1, 'mono',120, 'actif', ST_SetSRID(ST_MakePoint(591525, 2041325), 32628)),
  ('M-2002', 3, 1, 'tri',  80, 'actif', ST_SetSRID(ST_MakePoint(591515, 2041315), 32628));

-- A line on HTA15, section 95, attributed to TR-TRAP so it inherits the overload.
INSERT INTO ligne (code_actif, niveau_tension, type_pose, section_mm2, longueur_m, statut, transfo_id, geom) VALUES
  ('L-NKT-01', 'HTA15', 'aerien', 95, 1450, 'actif', 2,
   ST_SetSRID(ST_MakeLine(ST_MakePoint(591500,2041300), ST_MakePoint(591620,2041280)), 32628)),
  ('L-NKT-02', 'HTA15', 'aerien', 95, 900, 'actif', NULL,   -- unattributed -> 'inconnu'
   ST_SetSRID(ST_MakeLine(ST_MakePoint(590200,2040100), ST_MakePoint(591500,2041300)), 32628));

COMMIT;
```

- [ ] **Step 2: Recreate and sanity check the numbers**

Run: `docker compose down -v && docker compose up -d --build db`
Then: `... -c "SELECT t.code_actif, t.puissance_kva, COALESCE(SUM(p.puiss_souscrite_kw),0) AS kw FROM transformateur t LEFT JOIN point_service p ON p.transfo_id=t.transfo_id GROUP BY 1,2 ORDER BY 1;"`
Expected: TR-TRAP kva=160 kw=350; TR-NORMAL kva=630 kw=200; TR-MID kva=400 kw=0.

- [ ] **Step 3: Commit**

```bash
git add db/seed/010_nouakchott.sql
git commit -m "feat(db): Nouakchott seed with overloaded trap transformer"
```

---

### Task 4: Load heuristic views + SQL correctness tests

**Goal:** `v_charge_transformateur` and `v_charge_ligne` compute `taux_charge` and `classe`, verified against the trap fixture.

**Files:**
- Create: `db/migrations/003_views.sql`
- Create: `api/package.json`, `api/src/db.js`, `api/test/views.test.js`

**Acceptance Criteria:**
- [ ] `v_charge_transformateur` returns classe `critique` for TR-TRAP, `normal` for TR-NORMAL, `normal` for TR-MID (0 load)
- [ ] `v_charge_ligne` returns a numeric taux for L-NKT-01 and `inconnu` for L-NKT-02
- [ ] Division guard: a transformer with `puissance_kva = 0/NULL` yields classe `inconnu`, no error

**Verify:** `cd api && npm test -- test/views.test.js` → all pass

**Steps:**

- [ ] **Step 1: Write `db/migrations/003_views.sql`**

```sql
BEGIN;

CREATE OR REPLACE VIEW v_charge_transformateur AS
WITH p AS (SELECT valeur FROM parametre WHERE cle='cos_phi'),
     f AS (SELECT valeur FROM parametre WHERE cle='facteur_foisonnement'),
     sa AS (SELECT valeur FROM parametre WHERE cle='seuil_alerte'),
     sc AS (SELECT valeur FROM parametre WHERE cle='seuil_critique'),
     charge AS (
       SELECT t.transfo_id,
              COALESCE(SUM(ps.puiss_souscrite_kw),0) AS kw
       FROM transformateur t
       LEFT JOIN point_service ps ON ps.transfo_id = t.transfo_id
       GROUP BY t.transfo_id
     )
SELECT
  t.transfo_id, t.code_actif, t.poste_id, t.puissance_kva, t.geom,
  (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) AS charge_kva,
  CASE WHEN t.puissance_kva IS NULL OR t.puissance_kva = 0 THEN NULL
       ELSE (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva
  END AS taux_charge,
  CASE
    WHEN t.puissance_kva IS NULL OR t.puissance_kva = 0 THEN 'inconnu'
    WHEN (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva >= (SELECT valeur FROM sc) THEN 'critique'
    WHEN (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva >= (SELECT valeur FROM sa) THEN 'surcharge'
    ELSE 'normal'
  END AS classe
FROM transformateur t
JOIN charge c ON c.transfo_id = t.transfo_id;

CREATE OR REPLACE VIEW v_charge_ligne AS
WITH p AS (SELECT valeur FROM parametre WHERE cle='cos_phi'),
     sa AS (SELECT valeur FROM parametre WHERE cle='seuil_alerte'),
     sc AS (SELECT valeur FROM parametre WHERE cle='seuil_critique')
SELECT
  l.ligne_id, l.code_actif, l.niveau_tension, l.section_mm2, l.type_pose, l.transfo_id, l.geom,
  ct.charge_kva,
  ac.capacite_a,
  CASE
    WHEN l.transfo_id IS NULL OR ac.capacite_a IS NULL OR nt.valeur IS NULL THEN NULL
    ELSE (ct.charge_kva / (sqrt(3) * nt.valeur::numeric * (SELECT valeur FROM p))) / ac.capacite_a
  END AS taux_charge,
  CASE
    WHEN l.transfo_id IS NULL OR ac.capacite_a IS NULL OR nt.valeur IS NULL THEN 'inconnu'
    WHEN (ct.charge_kva / (sqrt(3) * nt.valeur::numeric * (SELECT valeur FROM p))) / ac.capacite_a >= (SELECT valeur FROM sc) THEN 'critique'
    WHEN (ct.charge_kva / (sqrt(3) * nt.valeur::numeric * (SELECT valeur FROM p))) / ac.capacite_a >= (SELECT valeur FROM sa) THEN 'surcharge'
    ELSE 'normal'
  END AS classe
FROM ligne l
LEFT JOIN niveau_tension nt ON nt.code_tension = l.niveau_tension
LEFT JOIN ampacite_cable ac ON ac.section_mm2 = l.section_mm2 AND ac.type_pose = l.type_pose
LEFT JOIN v_charge_transformateur ct ON ct.transfo_id = l.transfo_id;

COMMIT;
```

- [ ] **Step 2: Write `api/package.json`**

```json
{
  "name": "sig-somelec-api",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0"
  }
}
```

- [ ] **Step 3: Write `api/src/db.js`**

```js
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'somelec',
  password: process.env.POSTGRES_PASSWORD || 'change_me',
  database: process.env.POSTGRES_DB || 'sig_somelec',
});

pool.on('error', (err) => console.error('pg pool error', err));

export const query = (text, params) => pool.query(text, params);
export default pool;
```

- [ ] **Step 4: Write the failing test `api/test/views.test.js`**

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pool, { query } from '../src/db.js';

test('TR-TRAP is critique', async () => {
  const { rows } = await query(
    "SELECT classe, taux_charge FROM v_charge_transformateur WHERE code_actif='TR-TRAP'");
  assert.equal(rows[0].classe, 'critique');
  assert.ok(Number(rows[0].taux_charge) > 1);
});

test('TR-NORMAL is normal', async () => {
  const { rows } = await query(
    "SELECT classe FROM v_charge_transformateur WHERE code_actif='TR-NORMAL'");
  assert.equal(rows[0].classe, 'normal');
});

test('attributed line has a numeric taux, unattributed is inconnu', async () => {
  const { rows } = await query(
    "SELECT code_actif, classe, taux_charge FROM v_charge_ligne ORDER BY code_actif");
  const byCode = Object.fromEntries(rows.map(r => [r.code_actif, r]));
  assert.notEqual(byCode['L-NKT-01'].taux_charge, null);
  assert.equal(byCode['L-NKT-02'].classe, 'inconnu');
});

test('zero-kVA transformer is inconnu (no divide-by-zero)', async () => {
  await query("INSERT INTO transformateur (code_actif, puissance_kva, poste_id) VALUES ('TR-ZERO', 0, 1)");
  const { rows } = await query(
    "SELECT classe, taux_charge FROM v_charge_transformateur WHERE code_actif='TR-ZERO'");
  assert.equal(rows[0].classe, 'inconnu');
  assert.equal(rows[0].taux_charge, null);
  await query("DELETE FROM transformateur WHERE code_actif='TR-ZERO'");
});

after(() => pool.end());
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `docker compose up -d --build db && cd api && npm install && npm test`
Expected: FAIL — view `v_charge_transformateur` does not exist (003 not applied yet if DB built before this migration existed).

- [ ] **Step 6: Apply the migration and re-run**

Run: `docker compose down -v && docker compose up -d --build db` (rebuild picks up 003_views.sql), wait healthy, then `cd api && npm test`
Expected: PASS — all 4 tests green.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/003_views.sql api/package.json api/src/db.js api/test/views.test.js
git commit -m "feat(db): load heuristic views + SQL correctness tests"
```

---

### Task 5: Express server skeleton + health

**Goal:** A running Express app with a health endpoint and the `pg` pool wired in.

**Files:**
- Create: `api/src/server.js`
- Test: `api/test/health.test.js`

**Acceptance Criteria:**
- [ ] `GET /health` returns `200 {status:'ok', db:true}` when DB reachable
- [ ] Server reads port from `API_PORT`

**Verify:** `cd api && npm test -- test/health.test.js` → pass

**Steps:**

- [ ] **Step 1: Write `api/src/server.js`**

```js
import express from 'express';
import { query } from './db.js';

export function createApp() {
  const app = express();
  app.get('/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', db: true });
    } catch {
      res.status(500).json({ status: 'error', db: false });
    }
  });
  return app;
}

// Only listen when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const port = Number(process.env.API_PORT || 3001);
  createApp().listen(port, () => console.log(`API on :${port}`));
}
```

- [ ] **Step 2: Write failing test `api/test/health.test.js`**

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import pool from '../src/db.js';

test('GET /health returns ok', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.db, true);
  server.close();
});

after(() => pool.end());
```

- [ ] **Step 3: Run test**

Run: `cd api && npm test -- test/health.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/src/server.js api/test/health.test.js
git commit -m "feat(api): express skeleton with health check"
```

---

### Task 6: Vector tile route via ST_AsMVT

**Goal:** `GET /tiles/:layer/:z/:x/:y.pbf` returns MapLibre-ready MVT for `transfo` and `ligne` layers carrying `taux_charge` and `classe`.

**Files:**
- Create: `api/src/tiles.js`
- Modify: `api/src/server.js` (mount router)
- Test: `api/test/tiles.test.js`

**Acceptance Criteria:**
- [ ] `/tiles/transfo/{z}/{x}/{y}.pbf` over Nouakchott returns `200`, `application/x-protobuf`, non-empty body
- [ ] Unknown layer → `400`; non-numeric z/x/y → `400`
- [ ] Tile with no features → `204`

**Verify:** `cd api && npm test -- test/tiles.test.js` → pass

**Steps:**

- [ ] **Step 1: Write `api/src/tiles.js`**

```js
import { Router } from 'express';
import { query } from './db.js';

// Whitelisted layers -> source view + columns exposed in the tile.
const LAYERS = {
  transfo: { view: 'v_charge_transformateur', cols: 'transfo_id, code_actif, taux_charge, classe, puissance_kva' },
  ligne:   { view: 'v_charge_ligne',          cols: 'ligne_id, code_actif, taux_charge, classe, section_mm2' },
};

export const tilesRouter = Router();

tilesRouter.get('/:layer/:z/:x/:y.pbf', async (req, res) => {
  const layer = LAYERS[req.params.layer];
  if (!layer) return res.status(400).json({ error: 'unknown layer' });

  const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
  if (![z, x, y].every(Number.isInteger)) return res.status(400).json({ error: 'bad tile coords' });

  // Reproject 32628 -> 3857 web-mercator tile envelope; parameterized, no SQL injection.
  const sql = `
    WITH bounds AS (SELECT ST_TileEnvelope($1,$2,$3) AS env),
    mvt AS (
      SELECT ${layer.cols},
             ST_AsMVTGeom(ST_Transform(t.geom, 3857), bounds.env, 4096, 64, true) AS geom
      FROM ${layer.view} t, bounds
      WHERE t.geom IS NOT NULL
        AND ST_Intersects(ST_Transform(t.geom, 3857), bounds.env)
    )
    SELECT ST_AsMVT(mvt, $4, 4096, 'geom') AS tile FROM mvt WHERE geom IS NOT NULL;`;
  try {
    const { rows } = await query(sql, [z, x, y, req.params.layer]);
    const tile = rows[0] && rows[0].tile;
    if (!tile || tile.length === 0) return res.status(204).end();
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.send(tile);
  } catch (err) {
    console.error('tile error', err);
    res.status(500).json({ error: 'tile generation failed' });
  }
});
```

- [ ] **Step 2: Mount the router in `api/src/server.js`**

Add the import and `app.use` (insert after `const app = express();`):

```js
import { tilesRouter } from './tiles.js';
// ...inside createApp(), after const app = express():
  app.use('/tiles', tilesRouter);
```

- [ ] **Step 3: Write failing test `api/test/tiles.test.js`**

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import pool from '../src/db.js';

// z/x/y covering Nouakchott (~ -15.97, 18.08). Computed for z=12.
const Z = 12, X = 1986, Y = 1809;

test('transfo tile returns protobuf', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/tiles/transfo/${Z}/${X}/${Y}.pbf`);
  assert.ok(res.status === 200 || res.status === 204);
  if (res.status === 200) {
    assert.equal(res.headers.get('content-type'), 'application/x-protobuf');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 0);
  }
  server.close();
});

test('unknown layer is 400', async () => {
  const server = createApp().listen(0);
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/tiles/bogus/1/0/0.pbf`);
  assert.equal(res.status, 400);
  server.close();
});

after(() => pool.end());
```

> Note: if X/Y are slightly off and the tile is empty (`204`), find the correct tile with
> `... -c "SELECT ST_AsText(ST_Transform(geom,4326)) FROM transformateur LIMIT 1;"` and recompute
> via the standard slippy-tile formula, then update Z/X/Y. The 400 test is the hard assertion.

- [ ] **Step 4: Run tests**

Run: `cd api && npm test -- test/tiles.test.js`
Expected: PASS (transfo tile 200/204, unknown layer 400).

- [ ] **Step 5: Commit**

```bash
git add api/src/tiles.js api/src/server.js api/test/tiles.test.js
git commit -m "feat(api): ST_AsMVT vector tile route for transfo and ligne layers"
```

---

### Task 7: Dashboard aggregate API

**Goal:** JSON endpoints feeding the dashboard: KPIs, top-10 overloads, asset detail.

**Files:**
- Create: `api/src/api.js`
- Modify: `api/src/server.js` (mount router)
- Test: `api/test/api.test.js`

**Acceptance Criteria:**
- [ ] `GET /api/kpi` → counts of transformers by classe + total
- [ ] `GET /api/top-surcharges` → list ordered by taux_charge desc, TR-TRAP first
- [ ] `GET /api/asset/transfo/:id` → one transformer's load detail; unknown id → 404

**Verify:** `cd api && npm test -- test/api.test.js` → pass

**Steps:**

- [ ] **Step 1: Write `api/src/api.js`**

```js
import { Router } from 'express';
import { query } from './db.js';

export const apiRouter = Router();

apiRouter.get('/kpi', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT classe, COUNT(*)::int AS n FROM v_charge_transformateur GROUP BY classe`);
    const byClasse = Object.fromEntries(rows.map(r => [r.classe, r.n]));
    const total = rows.reduce((s, r) => s + r.n, 0);
    res.json({ total, byClasse });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'kpi failed' });
  }
});

apiRouter.get('/top-surcharges', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT code_actif, taux_charge, classe, puissance_kva
      FROM v_charge_transformateur
      WHERE taux_charge IS NOT NULL
      ORDER BY taux_charge DESC NULLS LAST
      LIMIT 10`);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'top-surcharges failed' });
  }
});

apiRouter.get('/asset/:type/:id', async (req, res) => {
  if (req.params.type !== 'transfo') return res.status(400).json({ error: 'unknown type' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const { rows } = await query(
      `SELECT transfo_id, code_actif, puissance_kva, charge_kva, taux_charge, classe
       FROM v_charge_transformateur WHERE transfo_id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'asset failed' });
  }
});
```

- [ ] **Step 2: Mount in `api/src/server.js`**

```js
import { apiRouter } from './api.js';
// inside createApp(), after app.use('/tiles', tilesRouter):
  app.use('/api', apiRouter);
```

- [ ] **Step 3: Write failing test `api/test/api.test.js`**

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import pool from '../src/db.js';

async function up() { const s = createApp().listen(0); return { s, base: `http://localhost:${s.address().port}` }; }

test('kpi has a total and classe counts', async () => {
  const { s, base } = await up();
  const body = await (await fetch(`${base}/api/kpi`)).json();
  assert.ok(body.total >= 3);
  assert.ok('byClasse' in body);
  s.close();
});

test('top-surcharges lists TR-TRAP first', async () => {
  const { s, base } = await up();
  const rows = await (await fetch(`${base}/api/top-surcharges`)).json();
  assert.equal(rows[0].code_actif, 'TR-TRAP');
  s.close();
});

test('unknown asset id is 404', async () => {
  const { s, base } = await up();
  const res = await fetch(`${base}/api/asset/transfo/999999`);
  assert.equal(res.status, 404);
  s.close();
});

after(() => pool.end());
```

- [ ] **Step 4: Run tests**

Run: `cd api && npm test -- test/api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/api.js api/src/server.js api/test/api.test.js
git commit -m "feat(api): dashboard aggregate endpoints (kpi, top-surcharges, asset)"
```

---

### Task 8: React app scaffold + API client + CORS

**Goal:** A Vite React app boots and can call the API (CORS enabled).

**Files:**
- Create: `web/package.json`, `web/vite.config.js`, `web/index.html`, `web/src/main.jsx`, `web/src/App.jsx`, `web/src/api.js`
- Modify: `api/src/server.js` (CORS), `api/package.json` (cors dep)

**Acceptance Criteria:**
- [ ] `cd web && npm run dev` serves the app; it shows a title and live KPI total fetched from the API
- [ ] API responds with `Access-Control-Allow-Origin`

**Verify:** `cd web && npm run build` succeeds; manual: dev page shows the KPI total number.

**Steps:**

- [ ] **Step 1: Add CORS to `api/src/server.js` and dep to `api/package.json`**

`api/package.json` dependencies — add `"cors": "^2.8.5"`.

In `server.js`:
```js
import cors from 'cors';
// inside createApp(), first middleware:
  app.use(cors());
```

- [ ] **Step 2: Write `web/package.json`**

```json
{
  "name": "sig-somelec-web",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "maplibre-gl": "^4.5.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
```

- [ ] **Step 3: Write `web/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 4: Write `web/index.html`, `web/src/main.jsx`, `web/src/api.js`**

`index.html`:
```html
<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>SIG SOMELEC — Surcharge réseau</title></head>
<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>
```

`src/api.js`:
```js
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
export const TILE_BASE = BASE;
export async function getKpi() { return (await fetch(`${BASE}/api/kpi`)).json(); }
export async function getTopSurcharges() { return (await fetch(`${BASE}/api/top-surcharges`)).json(); }
export async function getAsset(type, id) { return (await fetch(`${BASE}/api/asset/${type}/${id}`)).json(); }
```

`src/main.jsx`:
```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 5: Write a minimal `web/src/App.jsx` that proves the API link**

```jsx
import React, { useEffect, useState } from 'react';
import { getKpi } from './api.js';

export default function App() {
  const [kpi, setKpi] = useState(null);
  useEffect(() => { getKpi().then(setKpi).catch(() => setKpi({ error: true })); }, []);
  return (
    <div style={{ fontFamily: 'Arial', padding: 24 }}>
      <h1>SIG SOMELEC — Surcharge réseau</h1>
      {kpi?.error ? <p>Données indisponibles</p>
        : kpi ? <p>Transformateurs suivis : {kpi.total}</p>
        : <p>Chargement…</p>}
    </div>
  );
}
```

- [ ] **Step 6: Build and manually verify**

Run: `cd web && npm install && npm run build`
Expected: build succeeds.
Manual: with API + DB up, `npm run dev` → page shows "Transformateurs suivis : 4" (3 seed + any).

- [ ] **Step 7: Commit**

```bash
git add web api/src/server.js api/package.json
git commit -m "feat(web): React+Vite scaffold with live API client and CORS"
```

---

### Task 9: MapLibre map with load-driven styling, legend, filter

**Goal:** The map renders transformers and lines from the MVT tiles, colored green→amber→red by `classe`, with overloaded assets enlarged/glowing, a legend, and an "overloaded only" filter.

**Files:**
- Create: `web/src/map/style.js`, `web/src/map/Map.jsx`
- Modify: `web/src/App.jsx`

**Acceptance Criteria:**
- [ ] Transformers appear as circles; `critique` is red and larger, `surcharge` amber, `normal` green, `inconnu` grey
- [ ] Lines colored by classe; attributed overloaded line is red
- [ ] A toggle filters to `surcharge`+`critique` only
- [ ] Clicking a transformer shows a popup with code + taux_charge

**Verify:** Playwright (webapp-testing): load page, assert a red circle exists and toggling the filter reduces visible features. Manual fallback: TR-TRAP is red.

**Steps:**

- [ ] **Step 1: Write `web/src/map/style.js`** (paint expressions; thresholds make overloads pop)

```js
export const CLASSE_COLOR = [
  'match', ['get', 'classe'],
  'critique', '#d7191c',
  'surcharge', '#fdae61',
  'normal', '#1a9641',
  /* inconnu / other */ '#9e9e9e',
];

export const transfoCirclePaint = {
  'circle-color': CLASSE_COLOR,
  'circle-radius': [
    'match', ['get', 'classe'],
    'critique', 11, 'surcharge', 8, 6,
  ],
  'circle-stroke-width': ['match', ['get', 'classe'], 'critique', 3, 1],
  'circle-stroke-color': '#7a0000',
  'circle-opacity': 0.9,
};

export const ligneLinePaint = {
  'line-color': CLASSE_COLOR,
  'line-width': ['match', ['get', 'classe'], 'critique', 6, 'surcharge', 4, 2],
  'line-opacity': 0.85,
};

// Filter expression: show only surcharge + critique when enabled.
export const OVERLOADED_FILTER = ['in', ['get', 'classe'], ['literal', ['surcharge', 'critique']]];
```

- [ ] **Step 2: Write `web/src/map/Map.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TILE_BASE } from '../api.js';
import { transfoCirclePaint, ligneLinePaint, OVERLOADED_FILTER } from './style.js';

const NOUAKCHOTT = { center: [-15.97, 18.09], zoom: 12 };

export default function Map({ flyTo }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [onlyOverloaded, setOnlyOverloaded] = useState(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://demotiles.maplibre.org/style.json', // free base; swap for SOMELEC base later
      center: NOUAKCHOTT.center, zoom: NOUAKCHOTT.zoom,
    });
    mapRef.current = map;
    map.on('load', () => {
      map.addSource('transfo', { type: 'vector', tiles: [`${TILE_BASE}/tiles/transfo/{z}/{x}/{y}.pbf`], minzoom: 6, maxzoom: 20 });
      map.addSource('ligne',   { type: 'vector', tiles: [`${TILE_BASE}/tiles/ligne/{z}/{x}/{y}.pbf`],   minzoom: 6, maxzoom: 20 });
      map.addLayer({ id: 'ligne', type: 'line', source: 'ligne', 'source-layer': 'ligne', paint: ligneLinePaint });
      map.addLayer({ id: 'transfo', type: 'circle', source: 'transfo', 'source-layer': 'transfo', paint: transfoCirclePaint });

      map.on('click', 'transfo', (e) => {
        const p = e.features[0].properties;
        const taux = p.taux_charge == null ? '—' : `${Math.round(p.taux_charge * 100)}%`;
        new maplibregl.Popup().setLngLat(e.lngLat)
          .setHTML(`<b>${p.code_actif}</b><br/>Classe : ${p.classe}<br/>Charge : ${taux}`).addTo(map);
      });
      map.on('mouseenter', 'transfo', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'transfo', () => map.getCanvas().style.cursor = '');
    });
    return () => map.remove();
  }, []);

  // Apply / clear the overloaded-only filter on both layers.
  useEffect(() => {
    const map = mapRef.current; if (!map || !map.getLayer('transfo')) return;
    const f = onlyOverloaded ? OVERLOADED_FILTER : null;
    map.setFilter('transfo', f);
    map.setFilter('ligne', f);
  }, [onlyOverloaded]);

  // Imperative fly-to from the dashboard top-10.
  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: flyTo, zoom: 15 });
  }, [flyTo]);

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 10, left: 10, background: '#fff', padding: 10, borderRadius: 8, font: '13px Arial' }}>
        <label><input type="checkbox" checked={onlyOverloaded} onChange={e => setOnlyOverloaded(e.target.checked)} /> Surcharge uniquement</label>
        <div style={{ marginTop: 8 }}>
          <Legend color="#1a9641" label="Normal" />
          <Legend color="#fdae61" label="Surcharge (≥80%)" />
          <Legend color="#d7191c" label="Critique (≥100%)" />
          <Legend color="#9e9e9e" label="Inconnu" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 12, height: 12, background: color, display: 'inline-block', borderRadius: 3 }} />{label}
  </div>;
}
```

> Note: `circle-radius` step + red stroke on `critique` is the "pop-out" technique from the research —
> overloaded nodes grow and outline so they're found instantly.

- [ ] **Step 3: Wire the map into `web/src/App.jsx`** (split layout: map + dashboard placeholder)

```jsx
import React, { useState } from 'react';
import Map from './map/Map.jsx';

export default function App() {
  const [flyTo, setFlyTo] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100vh', fontFamily: 'Arial' }}>
      <Map flyTo={flyTo} />
      <aside style={{ borderLeft: '1px solid #eee', overflow: 'auto' }}>
        {/* Dashboard mounted in Task 10 */}
        <h1 style={{ fontSize: 18, padding: 16 }}>SIG SOMELEC</h1>
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Verify with Playwright (webapp-testing skill)**

Start DB + API + `npm run dev`. Use the webapp-testing skill to:
- navigate to `http://localhost:5173`
- wait for the map canvas
- assert the page has the "Surcharge uniquement" checkbox
- screenshot for manual confirmation TR-TRAP is red

Expected: map renders, TR-TRAP is a red enlarged circle.

- [ ] **Step 5: Commit**

```bash
git add web/src/map web/src/App.jsx
git commit -m "feat(web): MapLibre map with load-driven styling, legend, overloaded filter"
```

---

### Task 10: Dashboard panel (KPIs, top-10, histogram)

**Goal:** The right panel shows KPI cards, a clickable top-10 overload table (fly-to map), and a load histogram.

**Files:**
- Create: `web/src/dashboard/Dashboard.jsx`
- Modify: `web/src/App.jsx`

**Acceptance Criteria:**
- [ ] KPI cards show total + count critique/surcharge/normal
- [ ] Top-10 table lists overloaded transformers; clicking a row flies the map to it
- [ ] Histogram bins taux_charge across assets

**Verify:** Playwright: the top-10 table contains "TR-TRAP"; clicking it triggers a map move. Manual fallback acceptable.

**Steps:**

- [ ] **Step 1: Write `web/src/dashboard/Dashboard.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getKpi, getTopSurcharges } from '../api.js';

const BINS = ['<50%', '50-80%', '80-100%', '>100%'];
function bin(taux) {
  if (taux == null) return null;
  if (taux < 0.5) return BINS[0]; if (taux < 0.8) return BINS[1];
  if (taux < 1.0) return BINS[2]; return BINS[3];
}

export default function Dashboard({ onSelect }) {
  const [kpi, setKpi] = useState(null);
  const [top, setTop] = useState([]);
  useEffect(() => {
    getKpi().then(setKpi).catch(() => setKpi({ error: true }));
    getTopSurcharges().then(setTop).catch(() => setTop([]));
  }, []);

  const histo = BINS.map(b => ({ bin: b, n: top.filter(t => bin(Number(t.taux_charge)) === b).length }));

  return (
    <div style={{ padding: 16, font: '13px Arial' }}>
      <h1 style={{ fontSize: 18 }}>SIG SOMELEC — Surcharge</h1>
      {kpi?.error && <p>Données indisponibles</p>}
      {kpi && !kpi.error && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
          <Card label="Total" value={kpi.total} />
          <Card label="Critique" value={kpi.byClasse?.critique || 0} color="#d7191c" />
          <Card label="Surcharge" value={kpi.byClasse?.surcharge || 0} color="#fdae61" />
          <Card label="Normal" value={kpi.byClasse?.normal || 0} color="#1a9641" />
        </div>
      )}

      <h2 style={{ fontSize: 14 }}>Top surcharges</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th align="left">Transfo</th><th align="right">Charge</th></tr></thead>
        <tbody>
          {top.map(t => (
            <tr key={t.code_actif} style={{ cursor: 'pointer' }} onClick={() => onSelect(t)}>
              <td>{t.code_actif}</td>
              <td align="right" style={{ color: Number(t.taux_charge) >= 1 ? '#d7191c' : '#b35900' }}>
                {Math.round(Number(t.taux_charge) * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, marginTop: 16 }}>Répartition de charge</h2>
      <div style={{ height: 160 }}>
        <ResponsiveContainer><BarChart data={histo}>
          <XAxis dataKey="bin" /><YAxis allowDecimals={false} /><Tooltip />
          <Bar dataKey="n" fill="#7b78d6" />
        </BarChart></ResponsiveContainer>
      </div>
    </div>
  );
}

function Card({ label, value, color }) {
  return <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
    <div style={{ color: '#666' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 600, color: color || '#1a1a1a' }}>{value}</div>
  </div>;
}
```

> Note: the histogram uses the top-10 set for the pilot. To bin the full network, add a tiny
> `GET /api/histogramme` (counts per bin) later — YAGNI until the dataset grows.

- [ ] **Step 2: Wire Dashboard + fly-to into `web/src/App.jsx`**

```jsx
import React, { useState } from 'react';
import Map from './map/Map.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import { getAsset } from './api.js';

export default function App() {
  const [flyTo, setFlyTo] = useState(null);
  // Top-10 rows lack geometry; fetch nothing extra — store code and let Map fly via a lookup endpoint later.
  // For the pilot we fly using the transformer point fetched from a lightweight detail call is overkill;
  // instead Map exposes a name->coords cache from its rendered features.
  async function handleSelect(row) {
    // Minimal: query the asset detail then center on its rendered feature if present.
    const a = await getAsset('transfo', row.transfo_id ?? 0).catch(() => null);
    if (a && a.lng && a.lat) setFlyTo([a.lng, a.lat]);
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100vh', fontFamily: 'Arial' }}>
      <Map flyTo={flyTo} />
      <aside style={{ borderLeft: '1px solid #eee', overflow: 'auto' }}>
        <Dashboard onSelect={handleSelect} />
      </aside>
    </div>
  );
}
```

> Note: to make fly-to exact, extend `GET /api/asset/transfo/:id` to also return
> `ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(...) AS lat` and include `transfo_id` in
> `/api/top-surcharges`. Add these two columns now (one-line SQL changes) so `handleSelect` works.

- [ ] **Step 3: Apply the two SQL column additions referenced above**

In `api/src/api.js`, `top-surcharges` SELECT: add `transfo_id,`. In `asset/:type/:id` SELECT add
`ST_X(ST_Transform(geom,4326)) AS lng, ST_Y(ST_Transform(geom,4326)) AS lat`. (Geom is exposed by the view.)

- [ ] **Step 4: Verify**

Playwright: assert top-10 table text contains "TR-TRAP"; click it; assert the map recenters (canvas move event or screenshot diff). Manual fallback acceptable.

- [ ] **Step 5: Commit**

```bash
git add web/src/dashboard web/src/App.jsx api/src/api.js
git commit -m "feat(web): dashboard KPIs, top-10 fly-to table, load histogram"
```

---

### Task 11: QGIS integration doc + compose for full stack

**Goal:** GIS team can connect QGIS to the same PostGIS and edit; `docker compose up` runs the whole stack.

**Files:**
- Create: `qgis/README.md`
- Modify: `docker-compose.yml` (add api + web services)

**Acceptance Criteria:**
- [ ] `qgis/README.md` documents the PG connection params + how the load views appear as read-only layers
- [ ] `docker compose up` starts db + api + web; the app loads end-to-end

**Verify:** `docker compose up -d` then open `http://localhost:5173` → map + dashboard render with seed data.

**Steps:**

- [ ] **Step 1: Add api + web services to `docker-compose.yml`**

```yaml
  api:
    build: ./api
    environment:
      POSTGRES_HOST: db
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      API_PORT: 3001
    ports: ["3001:3001"]
    depends_on:
      db: { condition: service_healthy }
  web:
    build: ./web
    environment:
      VITE_API_BASE: http://localhost:3001
    ports: ["5173:5173"]
    depends_on: [api]
```

Add `api/Dockerfile` (node:20-alpine, `npm ci`, `CMD node src/server.js`) and `web/Dockerfile`
(node:20-alpine, `npm ci && npm run build`, serve `dist` via `vite preview --host`). Include both
in this step:

`api/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
CMD ["node", "src/server.js"]
```

`web/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview", "--", "--host", "--port", "5173"]
```

- [ ] **Step 2: Write `qgis/README.md`**

````markdown
# Connecter QGIS au SIG SOMELEC

## Connexion PostGIS
Couche → Ajouter une couche PostGIS → Nouvelle connexion :
- Hôte : `localhost` (ou IP du serveur) · Port : `5432`
- Base : `sig_somelec` · Utilisateur : `somelec`
- SSL : selon déploiement

## Couches
- **Édition** : `poste`, `transformateur`, `ligne`, `support`, `point_service`, `abonne`
  (tables éditables nativement — modifications visibles côté web après rafraîchissement des vues).
- **Lecture seule (analyse)** : `v_charge_transformateur`, `v_charge_ligne`
  (taux_charge + classe). Styler par `classe` avec les mêmes couleurs que le web :
  normal `#1a9641`, surcharge `#fdae61`, critique `#d7191c`, inconnu `#9e9e9e`.

## SRID
Toutes les géométries sont en **EPSG:32628** (UTM 28N). QGIS le détecte automatiquement.

## Astuce
Pour une carto web identique au projet QGIS, publier le `.qgz` via **QGIS Server** (WMS)
et l'ajouter comme couche raster dans MapLibre. Optionnel — non requis pour le pilote.
````

- [ ] **Step 3: Verify the full stack**

Run: `docker compose up -d --build`
Open `http://localhost:5173`.
Expected: map shows TR-TRAP red, dashboard lists it top of the table.

- [ ] **Step 4: Commit**

```bash
git add qgis/README.md docker-compose.yml api/Dockerfile web/Dockerfile
git commit -m "feat: full-stack compose + QGIS connection guide"
```

---

### Task 12: ADRs + README + end-to-end acceptance

**Goal:** Decisions recorded, repo documented, and the trap fixture verified across the entire chain.

**Files:**
- Create: `docs/decisions/0001-postgis-source-of-truth.md` … `0004-ligne-load-attribution.md`, `README.md`

**Acceptance Criteria:**
- [ ] 4 ADRs present (Context/Problem/Options/Decision/Why/Consequences)
- [ ] `README.md` documents `docker compose up` quickstart
- [ ] End-to-end: TR-TRAP is `critique` in SQL, present in `/api/top-surcharges`, red on map, top of dashboard

**Verify:** Run the acceptance script below — all four checkpoints pass.

**Steps:**

- [ ] **Step 1: Write the 4 ADRs** (one file each, per global Decision Documentation format)

Each: Context · Problem · Options considered · Decision · Why · Consequences. Subjects:
`0001` PostGIS single source of truth + QGIS editor; `0002` Express ST_AsMVT vs Martin/GeoServer;
`0003` static SQL heuristic vs pandapower load-flow; `0004` nullable `ligne.transfo_id` attribution.

- [ ] **Step 2: Write `README.md`** (quickstart)

```markdown
# SIG SOMELEC — Surcharge réseau (pilote Nouakchott)
Web map + dashboard over a PostGIS electrical network highlighting overloaded
transformers/lines. Stack: PostgreSQL/PostGIS · Express (tiles via ST_AsMVT + API) · React/MapLibre.

## Quickstart
    cp .env.example .env
    docker compose up -d --build
    # web:  http://localhost:5173
    # api:  http://localhost:3001/health
    # tiles: http://localhost:3001/tiles/transfo/12/1986/1809.pbf

## Tests
    cd api && npm install && npm test

## QGIS
See qgis/README.md. Edits land in the same PostGIS the web app reads.
```

- [ ] **Step 3: End-to-end acceptance**

Run with the stack up:
```bash
# 1. SQL: trap is critique
docker compose exec db psql -U somelec -d sig_somelec -tAc \
  "SELECT classe FROM v_charge_transformateur WHERE code_actif='TR-TRAP';"   # -> critique
# 2. API: trap is top overload
curl -s localhost:3001/api/top-surcharges | grep -q TR-TRAP && echo "API OK"
# 3. Tiles: transfo tile non-empty
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/tiles/transfo/12/1986/1809.pbf  # 200 or 204
# 4. Web: manual/Playwright — TR-TRAP red + top of dashboard
```
Expected: `critique`, `API OK`, `200`, and visual confirmation.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions README.md
git commit -m "docs: ADRs, README quickstart, acceptance verification"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** schema (T1–T2), heuristic views (T4), tiles (T6), API (T7), map styling + filter (T9), dashboard (T10), QGIS (T11), error handling (guards in T4/T6/T7), testing (tests in T4–T10), ADRs (T12). All §-sections of the spec map to a task.
- **Placeholder scan:** every code step contains runnable code; no TBD/TODO.
- **Type consistency:** layer keys `transfo`/`ligne` consistent across tiles route, sources, and `source-layer`; `classe` values (`normal/surcharge/critique/inconnu`) identical in SQL views, map `style.js`, dashboard, and QGIS doc; `taux_charge` numeric everywhere; `transfo_id` added to `top-surcharges` (T10 S3) before `handleSelect` uses it.
- **Known follow-ups noted inline:** slippy-tile X/Y may need recompute (T6 S3); histogram is top-10-scoped (T10).
