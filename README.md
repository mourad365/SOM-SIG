# SIG SOMELEC — Surcharge réseau (pilote Nouakchott)

Web map + dashboard over a PostGIS electrical network highlighting overloaded
transformers/lines. Stack: PostgreSQL/PostGIS · Express (tiles via ST_AsMVT + API) · React/MapLibre.

## Quickstart

    cp .env.example .env
    docker compose up -d --build
    # web:   http://localhost:5173
    # api:   http://localhost:3001/health
    # tiles: http://localhost:3001/tiles/transfo/12/1866/1838.pbf

> Note port : le port hôte de PostGIS est publié sur `5433` dans cet environnement
> (`POSTGRES_PORT=5433` dans `.env`), un PostgreSQL natif occupant déjà `5432`.
> Dans le réseau Docker, l'API parle au conteneur `db:5432` (port interne).

## Tests

    cd api && npm install && npm test

## QGIS

See `qgis/README.md`. Edits land in the same PostGIS the web app reads.

## Données

Le schéma suit le MCD métier source→client (ADR 0007). Les géométries terrain réelles
(lignes BT, poteaux, parcelles de `Données.zip`) sont chargées via `db/tools/shp2sql.mjs`
→ `db/seed/010_real_geometry.sql` ; le réseau MT, les transformateurs et la couche
commerciale sont synthétisés de façon déterministe par PostGIS (`db/seed/020_synthese.sql`).

## Décisions

Les choix d'architecture sont consignés dans `docs/decisions/` (ADR 0001–0007).
