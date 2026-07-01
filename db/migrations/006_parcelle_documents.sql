-- 006 : Lots/parcelles — ajout des colonnes lot/ilot sur local,
--        table document_juridique, et exposition pour la carte.
BEGIN;

-- 1. Ajouter lot + ilot sur la table local (récupérés depuis stg_parcelle).
ALTER TABLE "local" ADD COLUMN IF NOT EXISTS lot text;
ALTER TABLE "local" ADD COLUMN IF NOT EXISTS ilot text;

-- Peupler lot/ilot en jointure spatiale avec stg_parcelle (si la table staging existe encore).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stg_parcelle') THEN
    UPDATE "local" l
    SET lot = p.lot, ilot = p.ilot
    FROM stg_parcelle p
    WHERE ST_Equals(l.geom, p.geom)
      AND (l.lot IS NULL OR l.ilot IS NULL);
  END IF;
END $$;

-- 2. Table document_juridique (titre foncier, contrat, etc.) liée au local.
CREATE TABLE IF NOT EXISTS document_juridique (
  id_document   serial PRIMARY KEY,
  id_local      int NOT NULL REFERENCES "local"(id_local),
  type_document text NOT NULL,          -- 'titre_foncier' | 'contrat_location' | 'acte_vente' | 'permis_construire'
  reference     text,                   -- numéro / référence du document
  date_document date,
  statut        text DEFAULT 'valide',  -- 'valide' | 'expire' | 'en_cours' | 'conteste'
  notes         text
);

-- 3. Peupler quelques documents juridiques de manière déterministe.
--    ~60% des locaux ont un titre foncier, ~30% un contrat, ~10% un permis.
INSERT INTO document_juridique (id_local, type_document, reference, date_document, statut, notes)
SELECT l.id_local,
       CASE l.id_local % 10
         WHEN 0 THEN 'permis_construire'
         WHEN 1 THEN 'contrat_location'
         WHEN 2 THEN 'contrat_location'
         WHEN 3 THEN 'acte_vente'
         ELSE 'titre_foncier'
       END,
       CASE l.id_local % 10
         WHEN 0 THEN 'PC-' || lpad(l.id_local::text, 5, '0')
         WHEN 1 THEN 'CL-' || lpad(l.id_local::text, 5, '0')
         WHEN 2 THEN 'CL-' || lpad(l.id_local::text, 5, '0')
         WHEN 3 THEN 'AV-' || lpad(l.id_local::text, 5, '0')
         ELSE 'TF-' || lpad(l.id_local::text, 5, '0')
       END,
       (DATE '2015-01-01') + ((l.id_local * 37) % 3650),
       CASE
         WHEN l.id_local % 50 = 0 THEN 'conteste'
         WHEN l.id_local % 30 = 0 THEN 'expire'
         ELSE 'valide'
       END,
       NULL
FROM "local" l
WHERE l.id_local % 10 != 4 AND l.id_local % 10 != 5;  -- ~80% des locaux ont un document

COMMIT;
