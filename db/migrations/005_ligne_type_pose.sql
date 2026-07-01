-- Ajout du type de pose (aérien / souterrain) sur les lignes BT.
-- La majorité du réseau BT à Nouakchott est aérienne ; ~15% en souterrain
-- (principalement dans les zones denses / artères principales).
BEGIN;

ALTER TABLE ligne_bt ADD COLUMN IF NOT EXISTS type_pose text;

-- Peuplement : ~85% aérien, ~15% souterrain (déterministe par id).
UPDATE ligne_bt
SET type_pose = CASE WHEN id_ligne_bt % 7 = 0 THEN 'souterrain' ELSE 'aerien' END
WHERE type_pose IS NULL;

COMMIT;
