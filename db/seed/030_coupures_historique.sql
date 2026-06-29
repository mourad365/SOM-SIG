BEGIN;

-- SIG SOMELEC — Historique de coupures SIMULÉ (ADR 0009, Chantier 5).
-- DÉTERMINISTE (aucune fonction aléatoire) : alimente le cockpit fiabilité dès le jour 1.
-- Toutes ces lignes portent source='simule' et sont filtrables/étiquetables comme telles
-- (même posture que « ancrages réels + distribution synthétique », ADR 0005/0007).
-- Les vraies coupures saisies dans l'app portent source='reel'.
--
-- Impact figé comme à la déclaration : clients = compteurs en aval (chaîne MCD),
-- charge_kva = v_charge_transformateur.charge_kva, ENS = charge_kva × 0,90 × durée_h.

-- Cibles : les transformateurs les plus chargés (impact significatif).
WITH cible AS (
  SELECT t.transfo_id, t.code_actif, t.charge_kva,
         (SELECT COUNT(*)::int
            FROM ligne_bt b
            JOIN poteau_electrique pe ON pe.id_ligne_bt = b.id_ligne_bt
            JOIN branchement br       ON br.id_poteau = pe.id_poteau
            JOIN "local" l            ON l.id_branchement = br.id_branchement
            JOIN compteur c           ON c.id_local = l.id_local
           WHERE b.id_transformateur = t.transfo_id) AS clients
  FROM v_charge_transformateur t
  WHERE t.charge_kva IS NOT NULL AND t.charge_kva > 0
  ORDER BY t.charge_kva DESC
  LIMIT 6
)
INSERT INTO coupure (type, statut, actif_type, actif_id, code_actif, cause, debut, fin,
                     clients_affectes, charge_kva, ens_kwh, source, commentaire)
SELECT
  ev.type, 'resolue', 'transfo', c.transfo_id, c.code_actif, ev.cause,
  (now() - make_interval(days => ev.days_ago, hours => ev.hr))::timestamptz,
  (now() - make_interval(days => ev.days_ago, hours => ev.hr)
         + make_interval(mins => ev.duree_min))::timestamptz,
  c.clients,
  round(c.charge_kva, 1),
  round(c.charge_kva * 0.90 * (ev.duree_min / 60.0), 1),
  'simule', ev.note
FROM cible c
CROSS JOIN (VALUES
  (335, 2, 'incident',   'defaut',      75,  'Fusion fusible BT (simulé)'),
  (300, 9, 'programmee', 'maintenance', 180, 'Maintenance programmée poste (simulé)'),
  (255, 3, 'incident',   'intemperie',  140, 'Vent de sable / branche (simulé)'),
  (190, 5, 'incident',   'defaut',      55,  'Défaut connexion (simulé)'),
  (140, 8, 'programmee', 'delestage',   120, 'Délestage tournant (simulé)'),
  (95,  1, 'incident',   'defaut',      210, 'Disjonction transformateur (simulé)'),
  (45,  4, 'incident',   'intemperie',  90,  'Infiltration / pluie (simulé)')
) AS ev(days_ago, hr, type, cause, duree_min, note);

-- Un incident ACTIF (fin NULL) pour montrer l'horloge de rétablissement dès l'ouverture.
INSERT INTO coupure (type, statut, actif_type, actif_id, code_actif, cause, debut, fin,
                     clients_affectes, charge_kva, ens_kwh, source, commentaire)
SELECT 'incident', 'active', 'transfo', t.transfo_id, t.code_actif, 'defaut',
       (now() - interval '2 hours 40 minutes')::timestamptz, NULL,
       (SELECT COUNT(*)::int
          FROM ligne_bt b
          JOIN poteau_electrique pe ON pe.id_ligne_bt = b.id_ligne_bt
          JOIN branchement br       ON br.id_poteau = pe.id_poteau
          JOIN "local" l            ON l.id_branchement = br.id_branchement
          JOIN compteur c           ON c.id_local = l.id_local
         WHERE b.id_transformateur = t.transfo_id),
       round(t.charge_kva, 1), 0, 'simule', 'Incident en cours (simulé)'
FROM v_charge_transformateur t
WHERE t.charge_kva IS NOT NULL AND t.charge_kva > 0
ORDER BY t.charge_kva DESC
LIMIT 1;

COMMIT;
