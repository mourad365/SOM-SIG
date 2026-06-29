BEGIN;

-- Corrections de topologie réseau (ADR 0010) — migration ADDITIVE.
-- Le réseau réel est un graphe, pas un arbre : multi-alimentation BT, clients MT,
-- sens du transformateur, phases des supports, poste→quartiers.

-- #3 sens du transformateur (MT/BT abaisseur · BT/MT élévateur). Défini au seed.
ALTER TABLE transformateur ADD COLUMN sens text;

-- #5 phases portées par le support (mono | tri).
ALTER TABLE poteau_electrique ADD COLUMN phases text;

-- #1 client MT : un branchement est BT (via un support) OU MT-direct (via une ligne_mt).
ALTER TABLE branchement ADD COLUMN id_ligne_mt int REFERENCES ligne_mt(id_ligne_mt);
ALTER TABLE branchement ADD CONSTRAINT branchement_rattachement_chk
  CHECK (id_poteau IS NOT NULL OR id_ligne_mt IS NOT NULL);
CREATE INDEX branchement_ligne_mt_ix ON branchement (id_ligne_mt);

-- #2 multi-alimentation BT (N:N). ligne_bt.id_transformateur reste l'alimentation
--    PRINCIPALE (rétro-compat v_charge_ligne / pertes) ; la jonction porte toutes les
--    alimentations (principale incluse).
CREATE TABLE alimentation_bt (
  id_ligne_bt       int NOT NULL REFERENCES ligne_bt(id_ligne_bt),
  id_transformateur int NOT NULL REFERENCES transformateur(id_transformateur),
  PRIMARY KEY (id_ligne_bt, id_transformateur)
);
CREATE INDEX alimentation_bt_transfo_ix ON alimentation_bt (id_transformateur);

-- #4 poste source → quartiers (N:N), dérivé de la chaîne au seed.
CREATE TABLE poste_quartier (
  id_poste_source int NOT NULL REFERENCES poste_source(id_poste_source),
  id_quartier     int NOT NULL REFERENCES quartier(id_quartier),
  PRIMARY KEY (id_poste_source, id_quartier)
);

-- ============================================================================
-- Redéfinition de la charge transfo : la demande de chaque ligne BT est répartie
-- À PARTS ÉGALES entre ses alimentations (puissance_demandee / nb_feeders).
-- Colonnes de sortie INCHANGÉES → contrat de vues préservé (ADR 0007/0009).
-- ============================================================================
CREATE OR REPLACE VIEW v_charge_transformateur AS
WITH p  AS (SELECT valeur FROM parametre WHERE cle = 'cos_phi'),
     f  AS (SELECT valeur FROM parametre WHERE cle = 'facteur_foisonnement'),
     sa AS (SELECT valeur FROM parametre WHERE cle = 'seuil_alerte'),
     sc AS (SELECT valeur FROM parametre WHERE cle = 'seuil_critique'),
     nb AS (SELECT id_ligne_bt, COUNT(*)::numeric AS n_feeders
            FROM alimentation_bt GROUP BY id_ligne_bt),
     charge AS (
       SELECT t.id_transformateur,
              COALESCE(SUM(l.puissance_demandee / nb.n_feeders), 0) AS kw
       FROM transformateur t
       LEFT JOIN alimentation_bt ab  ON ab.id_transformateur = t.id_transformateur
       LEFT JOIN nb                  ON nb.id_ligne_bt = ab.id_ligne_bt
       LEFT JOIN poteau_electrique pe ON pe.id_ligne_bt = ab.id_ligne_bt
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

COMMIT;
