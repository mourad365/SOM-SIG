BEGIN;

-- Geometry defined in lon/lat (EPSG:4326) clustered around real Nouakchott
-- (~ lon -15.97, lat 18.09) and transformed to UTM-28N (EPSG:32628) for storage.
-- Load numbers / kVA / attributions are unchanged so TR-TRAP stays 'critique'.

-- Postes
INSERT INTO poste (code_poste, nom, type_poste, tension_primaire, tension_secondaire, statut, geom) VALUES
  ('P-NKT-01', 'Poste Ksar',     'source',       'HTA33', 'HTA15', 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9700, 18.0950), 4326), 32628)),
  ('P-NKT-02', 'Poste Tevragh',  'distribution', 'HTA15', 'BT',    'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9550, 18.1050), 4326), 32628));

-- Transformateurs (one trap = under-sized vs its load)
INSERT INTO transformateur (code_actif, type_transfo, poste_id, puissance_kva, tension_primaire, tension_secondaire, etat, statut, geom) VALUES
  ('TR-NORMAL', 'distribution', 2, 630, 'HTA15', 'BT', 'bon', 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9548, 18.1052), 4326), 32628)),
  ('TR-TRAP',   'distribution', 2, 160, 'HTA15', 'BT', 'bon', 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9540, 18.1042), 4326), 32628)),
  ('TR-MID',    'distribution', 1, 400, 'HTA33', 'HTA15', 'bon', 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9698, 18.0952), 4326), 32628));

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
  ('M-1001', 1, 2, 'tri', 150, 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9538, 18.1044), 4326), 32628)),
  ('M-1002', 2, 2, 'tri', 120, 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9542, 18.1040), 4326), 32628)),
  ('M-1003', 3, 2, 'tri',  80, 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9536, 18.1046), 4326), 32628)),
  ('M-2001', 2, 1, 'mono',120, 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9550, 18.1054), 4326), 32628)),
  ('M-2002', 3, 1, 'tri',  80, 'actif', ST_Transform(ST_SetSRID(ST_MakePoint(-15.9546, 18.1050), 4326), 32628));

-- A line on HTA15, section 95, attributed to TR-TRAP so it inherits the overload.
INSERT INTO ligne (code_actif, niveau_tension, type_pose, section_mm2, longueur_m, statut, transfo_id, geom) VALUES
  ('L-NKT-01', 'HTA15', 'aerien', 95, 1450, 'actif', 2,
   ST_Transform(ST_SetSRID(ST_MakeLine(ST_MakePoint(-15.9550, 18.1050), ST_MakePoint(-15.9540, 18.1042)), 4326), 32628)),
  ('L-NKT-02', 'HTA15', 'aerien', 95, 900, 'actif', NULL,   -- unattributed -> 'inconnu'
   ST_Transform(ST_SetSRID(ST_MakeLine(ST_MakePoint(-15.9700, 18.0950), ST_MakePoint(-15.9550, 18.1050)), 4326), 32628));

COMMIT;
