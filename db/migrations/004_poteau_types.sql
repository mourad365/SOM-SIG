-- Normalisation des types de poteaux (ADR 0011).
-- Nettoie type_poteau en 5 valeurs canoniques et ajoute une colonne
-- fonction_poteau dérivée pour faciliter le filtrage carte.
BEGIN;

-- 1. Normaliser type_poteau : 'BT EC' → 'BT_EC', 'EC_Sol' → 'EC_SOLAIRE', etc.
UPDATE poteau_electrique SET type_poteau = 'BT_EC'   WHERE type_poteau = 'BT EC';
UPDATE poteau_electrique SET type_poteau = 'EC_SOLAIRE' WHERE type_poteau = 'EC_Sol';
UPDATE poteau_electrique SET type_poteau = 'EC_RESEAU'  WHERE type_poteau = 'EC_Reseau';

-- 2. Ajouter fonction_poteau : catégorie fonctionnelle (support | eclairage_public | eclairage_solaire | mixte)
ALTER TABLE poteau_electrique ADD COLUMN IF NOT EXISTS fonction_poteau text;

UPDATE poteau_electrique SET fonction_poteau = CASE
  WHEN type_poteau = 'BT'          THEN 'support'
  WHEN type_poteau = 'EC'          THEN 'eclairage_public'
  WHEN type_poteau = 'EC_SOLAIRE'  THEN 'eclairage_solaire'
  WHEN type_poteau = 'EC_RESEAU'   THEN 'eclairage_public'
  WHEN type_poteau = 'BT_EC'       THEN 'mixte'
  ELSE 'support'
END;

-- 3. Vérification
-- Valeurs attendues : BT, EC, BT_EC, EC_SOLAIRE, EC_RESEAU

COMMIT;
