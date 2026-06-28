BEGIN;

-- Vues d'analyse de charge = CONTRAT D'INTÉGRATION (ADR 0005/0007). Elles réexposent
-- le vocabulaire de colonnes hérité (transfo_id, code_actif, taux_charge, classe,
-- niveau_tension, charge_kva, date_mise_service…) au-dessus du schéma MCD, pour que
-- l'API, les tuiles MVT et le code carte restent inchangés.

-- ===== Charge des transformateurs =====
-- charge_kva = somme(puissance_demandee des locaux rattachés via la chaîne
--   transfo→ligne_bt→poteau→branchement→local) * foisonnement / cos_phi.
CREATE OR REPLACE VIEW v_charge_transformateur AS
WITH p  AS (SELECT valeur FROM parametre WHERE cle = 'cos_phi'),
     f  AS (SELECT valeur FROM parametre WHERE cle = 'facteur_foisonnement'),
     sa AS (SELECT valeur FROM parametre WHERE cle = 'seuil_alerte'),
     sc AS (SELECT valeur FROM parametre WHERE cle = 'seuil_critique'),
     charge AS (
       SELECT t.id_transformateur,
              COALESCE(SUM(l.puissance_demandee), 0) AS kw
       FROM transformateur t
       LEFT JOIN ligne_bt b          ON b.id_transformateur = t.id_transformateur
       LEFT JOIN poteau_electrique pe ON pe.id_ligne_bt = b.id_ligne_bt
       LEFT JOIN branchement br       ON br.id_poteau = pe.id_poteau
       LEFT JOIN "local" l            ON l.id_branchement = br.id_branchement
       GROUP BY t.id_transformateur
     )
SELECT
  t.id_transformateur            AS transfo_id,
  t.code_transformateur          AS code_actif,
  dm.id_poste_source             AS poste_id,
  t.puissance_kva,
  t.statut,
  CASE t.tension_entree WHEN '33 kV' THEN 'HTA33' WHEN '15 kV' THEN 'HTA15' ELSE 'BT' END AS niveau_tension,
  (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) AS charge_kva,
  CASE WHEN t.puissance_kva IS NULL OR t.puissance_kva = 0 THEN NULL
       ELSE (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva
  END AS taux_charge,
  CASE
    WHEN t.puissance_kva IS NULL OR t.puissance_kva = 0 THEN 'inconnu'
    WHEN (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva >= (SELECT valeur FROM sc) THEN 'critique'
    WHEN (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva >= (SELECT valeur FROM sa) THEN 'surcharge'
    ELSE 'normal'
  END AS classe,
  t.geom,
  t.date_mise_service
FROM transformateur t
JOIN charge c   ON c.id_transformateur = t.id_transformateur
LEFT JOIN ligne_mt lm ON lm.id_ligne_mt = t.id_ligne_mt
LEFT JOIN depart_mt dm ON dm.id_depart = lm.id_depart;

-- ===== Charge des lignes BT (géométrie réelle) =====
-- Chaque ligne BT hérite de la classe/charge du transformateur qui la distribue
-- (esprit ADR 0004 : la ligne reflète l'état de l'équipement qui l'alimente).
CREATE OR REPLACE VIEW v_charge_ligne AS
SELECT
  b.id_ligne_bt        AS ligne_id,
  b.code_ligne_bt      AS code_actif,
  'BT'::text           AS niveau_tension,
  NULL::numeric        AS section_mm2,
  b.type_ligne         AS type_pose,
  b.id_transformateur  AS transfo_id,
  b.etat,
  ct.charge_kva,
  NULL::numeric        AS capacite_a,
  ct.taux_charge,
  COALESCE(ct.classe, 'inconnu') AS classe,
  b.longueur_m,
  b.geom,
  b.date_mise_service
FROM ligne_bt b
LEFT JOIN v_charge_transformateur ct ON ct.transfo_id = b.id_transformateur;

COMMIT;
