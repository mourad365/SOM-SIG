FROM postgis/postgis:16-3.4
# Migrations + seed run in lexical order on first init
COPY migrations/ /docker-entrypoint-initdb.d/
# Seed files are flattened into the top-level init dir with a zzz- prefix so the
# postgres entrypoint runs them (it ignores subdirectories) and only after migrations.
COPY seed/010_nouakchott.sql /docker-entrypoint-initdb.d/zzz-010_nouakchott.sql
