BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

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
