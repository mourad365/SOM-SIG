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
