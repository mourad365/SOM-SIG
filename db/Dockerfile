FROM postgis/postgis:16-3.4
# Migrations + seed run in lexical order on first init
COPY migrations/ /docker-entrypoint-initdb.d/
COPY seed/ /docker-entrypoint-initdb.d/zzz-seed/
