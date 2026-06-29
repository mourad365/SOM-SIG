FROM postgis/postgis:16-3.4
# Migrations + seed run in lexical order on first init.
COPY migrations/ /docker-entrypoint-initdb.d/
# Seed files are flattened into the top-level init dir with a zzz- prefix so the
# postgres entrypoint runs them (it ignores subdirectories) and only after migrations.
# 010 = géométrie terrain réelle (généré depuis Données.zip) ; 020 = synthèse PostGIS.
COPY seed/010_real_geometry.sql /docker-entrypoint-initdb.d/zzz-010_real_geometry.sql
COPY seed/020_synthese.sql       /docker-entrypoint-initdb.d/zzz-020_synthese.sql
