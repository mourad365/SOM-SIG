BEGIN;

-- Paramètres de l'heuristique de charge statique (ADR 0003, conservée par ADR 0007).
--   charge_kva = somme(puissance_demandee des locaux) * foisonnement / cos_phi
--   taux_charge = charge_kva / transformateur.puissance_kva
CREATE TABLE parametre (
  cle    text PRIMARY KEY,
  valeur numeric NOT NULL,
  note   text
);
INSERT INTO parametre (cle, valeur, note) VALUES
  ('cos_phi',              0.90, 'facteur de puissance kW->kVA'),
  ('facteur_foisonnement', 0.60, 'coincidence des charges demandées'),
  ('seuil_alerte',         0.80, 'taux_charge >= -> surcharge'),
  ('seuil_critique',       1.00, 'taux_charge >= -> critique');

COMMIT;
