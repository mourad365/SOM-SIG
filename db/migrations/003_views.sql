BEGIN;

CREATE OR REPLACE VIEW v_charge_transformateur AS
WITH p AS (SELECT valeur FROM parametre WHERE cle='cos_phi'),
     f AS (SELECT valeur FROM parametre WHERE cle='facteur_foisonnement'),
     sa AS (SELECT valeur FROM parametre WHERE cle='seuil_alerte'),
     sc AS (SELECT valeur FROM parametre WHERE cle='seuil_critique'),
     charge AS (
       SELECT t.transfo_id,
              COALESCE(SUM(ps.puiss_souscrite_kw),0) AS kw
       FROM transformateur t
       LEFT JOIN point_service ps ON ps.transfo_id = t.transfo_id
       GROUP BY t.transfo_id
     )
SELECT
  t.transfo_id, t.code_actif, t.poste_id, t.puissance_kva, t.geom,
  (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) AS charge_kva,
  CASE WHEN t.puissance_kva IS NULL OR t.puissance_kva = 0 THEN NULL
       ELSE (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva
  END AS taux_charge,
  CASE
    WHEN t.puissance_kva IS NULL OR t.puissance_kva = 0 THEN 'inconnu'
    WHEN (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva >= (SELECT valeur FROM sc) THEN 'critique'
    WHEN (c.kw * (SELECT valeur FROM f) / (SELECT valeur FROM p)) / t.puissance_kva >= (SELECT valeur FROM sa) THEN 'surcharge'
    ELSE 'normal'
  END AS classe
FROM transformateur t
JOIN charge c ON c.transfo_id = t.transfo_id;

CREATE OR REPLACE VIEW v_charge_ligne AS
WITH p AS (SELECT valeur FROM parametre WHERE cle='cos_phi'),
     sa AS (SELECT valeur FROM parametre WHERE cle='seuil_alerte'),
     sc AS (SELECT valeur FROM parametre WHERE cle='seuil_critique')
SELECT
  l.ligne_id, l.code_actif, l.niveau_tension, l.section_mm2, l.type_pose, l.transfo_id, l.geom,
  ct.charge_kva,
  ac.capacite_a,
  CASE
    WHEN l.transfo_id IS NULL OR ac.capacite_a IS NULL OR nt.valeur IS NULL THEN NULL
    ELSE (ct.charge_kva / (sqrt(3) * nt.valeur::numeric * (SELECT valeur FROM p))) / ac.capacite_a
  END AS taux_charge,
  CASE
    WHEN l.transfo_id IS NULL OR ac.capacite_a IS NULL OR nt.valeur IS NULL THEN 'inconnu'
    WHEN (ct.charge_kva / (sqrt(3) * nt.valeur::numeric * (SELECT valeur FROM p))) / ac.capacite_a >= (SELECT valeur FROM sc) THEN 'critique'
    WHEN (ct.charge_kva / (sqrt(3) * nt.valeur::numeric * (SELECT valeur FROM p))) / ac.capacite_a >= (SELECT valeur FROM sa) THEN 'surcharge'
    ELSE 'normal'
  END AS classe
FROM ligne l
LEFT JOIN niveau_tension nt ON nt.code_tension = l.niveau_tension
LEFT JOIN ampacite_cable ac ON ac.section_mm2 = l.section_mm2 AND ac.type_pose = l.type_pose
LEFT JOIN v_charge_transformateur ct ON ct.transfo_id = l.transfo_id;

COMMIT;
