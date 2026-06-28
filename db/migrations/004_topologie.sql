-- Migration additive (non destructive) — Chantier 1 : traçabilité.
-- Indexe les jointures de la trace amont/aval. Les index sur
-- point_service.transfo_id (001) et ligne.transfo_id (002) existent déjà ;
-- il manque seulement transformateur.poste_id (parcours poste → transfos).
-- IF NOT EXISTS partout pour rester ré-exécutable sans casser.
BEGIN;

CREATE INDEX IF NOT EXISTS transformateur_poste_ix ON transformateur (poste_id);

-- Filets de sécurité (déjà créés par 001/002, no-op si présents) afin que la
-- trace soit performante même si ce fichier est rejoué seul sur un schéma partiel.
CREATE INDEX IF NOT EXISTS point_service_transfo_ix ON point_service (transfo_id);
CREATE INDEX IF NOT EXISTS ligne_transfo_ix ON ligne (transfo_id);

COMMIT;
