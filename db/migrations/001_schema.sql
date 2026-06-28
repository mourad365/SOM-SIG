BEGIN;

-- SIG SOMELEC — schéma MCD métier source→client (ADR 0007).
-- Chaîne : SOURCE → POSTE_SOURCE → DÉPART_MT → LIGNE_MT → TRANSFORMATEUR
--          → LIGNE_BT → POTEAU → BRANCHEMENT → LOCAL → COMPTEUR ↔ CLIENT.
-- Géométrie en EPSG:32628 (UTM-28N Nouakchott). `geom`/`date_mise_service` sont
-- ajoutés (nullable) aux entités où le SIG/UI l'exigent (cf. ADR 0007 Consequences).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ===== 1. SOURCE_ELECTRIQUE =====
CREATE TABLE source_electrique (
  id_source     serial PRIMARY KEY,
  nom_source    text NOT NULL,
  type_source   text,                       -- 'centrale' | 'reseau_national' | 'solaire' ...
  puissance_mw  numeric,
  geom          geometry(Point, 32628)
);

-- ===== 2. POSTE_SOURCE ===== (ALIMENTER : source 0,N → poste_source 1,1)
CREATE TABLE poste_source (
  id_poste_source serial PRIMARY KEY,
  nom_poste       text NOT NULL,
  tension_entree  text,                      -- ex. '33 kV'
  tension_sortie  text,                      -- ex. '15 kV'
  capacite_mva    numeric,
  id_source       int REFERENCES source_electrique(id_source),
  date_mise_service date,
  statut          text,
  geom            geometry(Point, 32628)
);

-- ===== 3. DEPART_MT ===== (CONTENIR : poste_source 1,N → depart 1,1)
CREATE TABLE depart_mt (
  id_depart       serial PRIMARY KEY,
  nom_depart      text NOT NULL,
  tension_kv      numeric,
  longueur_km     numeric,
  etat            text,
  id_poste_source int REFERENCES poste_source(id_poste_source),
  geom            geometry(MultiLineString, 32628)
);

-- ===== 4. LIGNE_MT ===== (POSSEDER : depart 1,N → ligne_mt 1,1)
CREATE TABLE ligne_mt (
  id_ligne_mt   serial PRIMARY KEY,
  code_ligne_mt text UNIQUE NOT NULL,
  type_ligne    text,                        -- 'aerien' | 'souterrain'
  tension_kv    numeric,
  longueur_km   numeric,
  etat          text,
  id_depart     int REFERENCES depart_mt(id_depart),
  date_mise_service date,
  geom          geometry(MultiLineString, 32628)
);

-- ===== 5. TRANSFORMATEUR ===== (ALIMENTER : ligne_mt 1,N → transfo 1,1)
CREATE TABLE transformateur (
  id_transformateur   serial PRIMARY KEY,
  code_transformateur text UNIQUE NOT NULL,
  puissance_kva       numeric,
  tension_entree      text,
  tension_sortie      text,
  etat                text,                  -- 'bon' | 'a_surveiller' | ...
  statut              text,                  -- 'actif' | 'en_projet'
  id_ligne_mt         int REFERENCES ligne_mt(id_ligne_mt),
  date_mise_service   date,
  geom                geometry(Point, 32628)
);

-- ===== 6. LIGNE_BT ===== (DISTRIBUER : transfo 1,N → ligne_bt 1,1) — GÉOMÉTRIE RÉELLE
CREATE TABLE ligne_bt (
  id_ligne_bt   serial PRIMARY KEY,
  code_ligne_bt text UNIQUE NOT NULL,
  type_ligne    text,                        -- 'BT' | 'EC' | 'BT_EC' (terrain)
  tension_v     numeric,
  longueur_m    numeric,
  etat          text,
  id_transformateur int REFERENCES transformateur(id_transformateur),
  date_mise_service date,
  geom          geometry(MultiLineString, 32628)
);

-- ===== 7. POTEAU_ELECTRIQUE ===== (SUPPORTER : ligne_bt 1,N → poteau 1,1) — RÉEL
CREATE TABLE poteau_electrique (
  id_poteau   serial PRIMARY KEY,
  code_poteau text UNIQUE NOT NULL,
  type_poteau text,                          -- 'BT' | 'EC' | 'BT_EC'
  hauteur_m   numeric,
  materiau    text,
  etat        text,
  id_ligne_bt int REFERENCES ligne_bt(id_ligne_bt),
  geom        geometry(Point, 32628)
);

-- ===== 8. BRANCHEMENT ===== (PORTER : poteau 1,N → branchement 1,1)
CREATE TABLE branchement (
  id_branchement   serial PRIMARY KEY,
  code_branchement text UNIQUE NOT NULL,
  type_branchement text,                     -- 'aerien' | 'souterrain'
  longueur_m       numeric,
  date_branchement date,
  etat             text,
  id_poteau        int REFERENCES poteau_electrique(id_poteau),
  geom             geometry(MultiLineString, 32628)
);

-- ===== 9. QUARTIER ===== (issu des LOTISSEMENT des parcelles réelles)
CREATE TABLE quartier (
  id_quartier  serial PRIMARY KEY,
  nom_quartier text NOT NULL,
  population   int,
  superficie   numeric,                      -- m²
  geom         geometry(MultiPolygon, 32628)
);

-- ===== 10. LOCAL ===== (remplace MAISON ; mot-clé SQL → table citée "local")
-- ALIMENTER : branchement 1,1 → local 1,1 ; APPARTENIR : quartier 1,N → local 1,1.
-- Emprise = parcelle cadastrale réelle.
CREATE TABLE "local" (
  id_local           serial PRIMARY KEY,
  code_local         text UNIQUE NOT NULL,
  adresse            text,
  type_batiment      text,                   -- 'residentiel' | 'commercial' | 'administratif' | 'mixte'
  puissance_demandee numeric,                -- kW — pilote l'estimation de charge transfo
  id_quartier        int REFERENCES quartier(id_quartier),
  id_branchement     int UNIQUE REFERENCES branchement(id_branchement),
  geom               geometry(MultiPolygon, 32628)
);

-- ===== 11. COMPTEUR ===== (POSSEDER : local 1,N → compteur 1,1)
CREATE TABLE compteur (
  id_compteur       serial PRIMARY KEY,
  numero_compteur   text UNIQUE NOT NULL,
  type_compteur     text,                    -- 'mono' | 'tri' | 'prepaye'
  date_installation date,
  statut            text,                    -- 'actif' | 'resilie' | 'suspendu'
  id_local          int REFERENCES "local"(id_local),
  geom              geometry(Point, 32628)
);

-- ===== 12. CLIENT =====
CREATE TABLE client (
  id_client  serial PRIMARY KEY,
  nom_client text NOT NULL,
  telephone  text,
  adresse    text
);

-- ===== Jonctions N:N =====
-- UTILISER étendu : un client a plusieurs locaux, un local plusieurs clients.
CREATE TABLE client_local (
  id_client int NOT NULL REFERENCES client(id_client),
  id_local  int NOT NULL REFERENCES "local"(id_local),
  PRIMARY KEY (id_client, id_local)
);
-- UTILISER_COMPTEUR étendu : un client a plusieurs compteurs.
CREATE TABLE client_compteur (
  id_client   int NOT NULL REFERENCES client(id_client),
  id_compteur int NOT NULL REFERENCES compteur(id_compteur),
  PRIMARY KEY (id_client, id_compteur)
);

-- ===== Index spatiaux =====
CREATE INDEX source_geom_gix        ON source_electrique  USING gist (geom);
CREATE INDEX poste_source_geom_gix  ON poste_source       USING gist (geom);
CREATE INDEX depart_mt_geom_gix     ON depart_mt          USING gist (geom);
CREATE INDEX ligne_mt_geom_gix      ON ligne_mt           USING gist (geom);
CREATE INDEX transformateur_geom_gix ON transformateur    USING gist (geom);
CREATE INDEX ligne_bt_geom_gix      ON ligne_bt           USING gist (geom);
CREATE INDEX poteau_geom_gix        ON poteau_electrique  USING gist (geom);
CREATE INDEX branchement_geom_gix   ON branchement        USING gist (geom);
CREATE INDEX quartier_geom_gix      ON quartier           USING gist (geom);
CREATE INDEX local_geom_gix         ON "local"            USING gist (geom);
CREATE INDEX compteur_geom_gix      ON compteur           USING gist (geom);

-- ===== Index FK (jointures de charge/traçabilité) =====
CREATE INDEX poste_source_source_ix ON poste_source     (id_source);
CREATE INDEX depart_poste_ix        ON depart_mt        (id_poste_source);
CREATE INDEX ligne_mt_depart_ix     ON ligne_mt         (id_depart);
CREATE INDEX transfo_ligne_mt_ix    ON transformateur   (id_ligne_mt);
CREATE INDEX ligne_bt_transfo_ix    ON ligne_bt         (id_transformateur);
CREATE INDEX poteau_ligne_bt_ix     ON poteau_electrique(id_ligne_bt);
CREATE INDEX branchement_poteau_ix  ON branchement      (id_poteau);
CREATE INDEX local_quartier_ix      ON "local"          (id_quartier);
CREATE INDEX local_branchement_ix   ON "local"          (id_branchement);
CREATE INDEX compteur_local_ix      ON compteur         (id_local);

COMMIT;
