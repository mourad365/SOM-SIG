-- Migration additive (non destructive) — Chantier 1 : traçabilité.
-- Portée au schéma MCD (ADR 0007). La trace amont/aval parcourt la chaîne de FK
--   poste_source → transformateur → ligne_bt → poteau → branchement → local → compteur.
-- Ces index existent déjà dans 001_schema.sql ; on les (re)pose en IF NOT EXISTS
-- pour rester ré-exécutable même sur un schéma partiel, sans rien casser.
BEGIN;

CREATE INDEX IF NOT EXISTS transfo_ligne_mt_ix   ON transformateur    (id_ligne_mt);
CREATE INDEX IF NOT EXISTS ligne_bt_transfo_ix   ON ligne_bt          (id_transformateur);
CREATE INDEX IF NOT EXISTS poteau_ligne_bt_ix    ON poteau_electrique (id_ligne_bt);
CREATE INDEX IF NOT EXISTS branchement_poteau_ix ON branchement       (id_poteau);
CREATE INDEX IF NOT EXISTS compteur_local_ix     ON compteur          (id_local);

COMMIT;
