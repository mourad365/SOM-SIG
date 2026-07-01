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






# Migration poteaux (normalisation + colonne fonction_poteau)
docker exec -i postgis-container psql -U sigmr -d sig_somelec -v ON_ERROR_STOP=1 < db/migrations/004_poteau_types.sql

# Migration lignes (colonne type_pose)
docker exec -i postgis-container psql -U sigmr -d sig_somelec -v ON_ERROR_STOP=1 < db/migrations/005_ligne_type_pose.sql

# Recharger la vue v_charge_ligne (modifiée pour type_pose)
docker exec postgis-container psql -U sigmr -d sig_somelec -c "DROP VIEW IF EXISTS v_charge_ligne CASCADE;"
docker exec -i postgis-container psql -U sigmr -d sig_somelec -v ON_ERROR_STOP=1 < db/migrations/003_views.sql


# Migration 006 — Colonnes lot/ilot sur local + table document_juridique
docker exec -i postgis-container psql -U sigmr -d sig_somelec -v ON_ERROR_STOP=1 < db/migrations/006_parcelle_documents.sql
 
# Peupler lot/ilot depuis l'adresse (si stg_parcelle n'existe plus)
docker exec postgis-container psql -U sigmr -d sig_somelec -c "
UPDATE \"local\" SET lot = split_part(adresse, ' / ', 1) WHERE lot IS NULL AND adresse IS NOT NULL;
UPDATE \"local\" SET ilot = split_part(adresse, ' / ', 2) WHERE ilot IS NULL AND adresse IS NOT NULL;
"

