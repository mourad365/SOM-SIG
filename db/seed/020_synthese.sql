BEGIN;

-- Synthèse déterministe du réseau MT + couche commerciale, ancrée sur la géométrie
-- réelle chargée en 010 (ADR 0007, volet hybride). Aucun random() : tout dérive des
-- identifiants (modulo), de generate_series et de jointures spatiales PostGIS.
-- Chaîne câblée par plus-proche-voisin (<->) : local→poteau→ligne_bt→transformateur,
-- et transformateur→poste_source→source.

-- ============================================================================
-- 1) SOURCES (2) — ancrées aux coins de l'emprise réelle des poteaux
-- ============================================================================
WITH e AS (SELECT ST_Extent(geom) g FROM poteau_electrique)
INSERT INTO source_electrique (nom_source, type_source, puissance_mw, geom)
SELECT * FROM (
  SELECT 'Centrale Nord de Nouakchott', 'centrale', 180.0,
         ST_SetSRID(ST_MakePoint(ST_XMin(g), ST_YMax(g)), 32628) FROM e
  UNION ALL
  SELECT 'Interconnexion Réseau National', 'reseau_national', 225.0,
         ST_SetSRID(ST_MakePoint(ST_XMax(g), ST_YMin(g)), 32628) FROM e
) s;

-- ============================================================================
-- 2) POSTES SOURCE (3) — centroïdes de 3 clusters K-means des poteaux
-- ============================================================================
INSERT INTO poste_source (nom_poste, tension_entree, tension_sortie, capacite_mva, statut, date_mise_service, geom)
SELECT 'Poste Source ' || chr(65 + k), '33 kV', '15 kV', 40,
       'actif', DATE '2014-01-01' + (k * 137), ST_Centroid(ST_Collect(geom))
FROM (SELECT ST_ClusterKMeans(geom, 3) OVER () AS k, geom FROM poteau_electrique) c
GROUP BY k;

-- chaque poste rattaché à la source la plus proche
UPDATE poste_source ps
SET id_source = (SELECT s.id_source FROM source_electrique s ORDER BY s.geom <-> ps.geom LIMIT 1);

-- ============================================================================
-- 3) DÉPARTS MT (1 par poste source)
-- ============================================================================
INSERT INTO depart_mt (nom_depart, tension_kv, etat, id_poste_source)
SELECT 'Départ ' || ps.nom_poste, 15, 'normal', ps.id_poste_source
FROM poste_source ps;

-- ============================================================================
-- 4) TRANSFORMATEURS — centroïdes de 100 clusters K-means des poteaux
--    (100 → ~50 locaux/transfo : charge typique au milieu de l'échelle kVA,
--     évite les saturations forcées par plafond d'échelle)
-- ============================================================================
-- sens (ADR 0010 #3) : majorité MT/BT (abaisseur, distribution) ; ~1/17 BT/MT (élévateur,
-- injection / auto-production des sites raccordés en MT).
INSERT INTO transformateur (code_transformateur, tension_entree, tension_sortie, etat, statut, sens, geom)
SELECT 'TR-' || lpad((k + 1)::text, 4, '0'), '15 kV', '0.4 kV',
       'bon', 'actif',
       CASE WHEN (k + 1) % 17 = 0 THEN 'BT/MT' ELSE 'MT/BT' END,
       ST_Centroid(ST_Collect(geom))
FROM (SELECT ST_ClusterKMeans(geom, 100) OVER () AS k, geom FROM poteau_electrique) c
GROUP BY k;

-- ============================================================================
-- 5) LIGNES MT (1 par transformateur : poste source le plus proche → transfo)
-- ============================================================================
INSERT INTO ligne_mt (code_ligne_mt, type_ligne, tension_kv, longueur_km, etat, id_depart, date_mise_service, geom)
SELECT 'LMT-' || lpad(t.id_transformateur::text, 4, '0'), 'aerien', 15,
       round((ST_Distance(ps.geom, t.geom) / 1000.0)::numeric, 2), 'normal',
       d.id_depart, DATE '2015-06-01' + (t.id_transformateur * 11 % 2500),
       ST_Multi(ST_MakeLine(ps.geom, t.geom))
FROM transformateur t
CROSS JOIN LATERAL (SELECT ps.* FROM poste_source ps ORDER BY ps.geom <-> t.geom LIMIT 1) ps
CROSS JOIN LATERAL (SELECT d.id_depart FROM depart_mt d WHERE d.id_poste_source = ps.id_poste_source ORDER BY d.id_depart LIMIT 1) d;

UPDATE transformateur t
SET id_ligne_mt = l.id_ligne_mt
FROM ligne_mt l
WHERE l.code_ligne_mt = 'LMT-' || lpad(t.id_transformateur::text, 4, '0');

-- ============================================================================
-- 6) RATTACHEMENTS RÉELS par plus-proche-voisin
-- ============================================================================
-- ligne_bt → transformateur le plus proche ; longueur dérivée de la géométrie réelle
UPDATE ligne_bt b
SET id_transformateur = (SELECT t.id_transformateur FROM transformateur t ORDER BY t.geom <-> b.geom LIMIT 1),
    tension_v = 400,
    etat = 'normal',
    date_mise_service = DATE '2017-01-01' + (b.id_ligne_bt * 17 % 2200),
    longueur_m = round(ST_Length(b.geom)::numeric, 1);

-- poteau → ligne_bt la plus proche ; phases (ADR 0010 #5) : tri pour l'éclairage public
-- et ~1/3 des supports, mono sinon.
UPDATE poteau_electrique p
SET id_ligne_bt = (SELECT b.id_ligne_bt FROM ligne_bt b ORDER BY b.geom <-> p.geom LIMIT 1),
    materiau = (ARRAY['beton', 'metal', 'bois'])[1 + (p.id_poteau % 3)],
    hauteur_m = COALESCE(p.hauteur_m, 8 + (p.id_poteau % 4)),
    phases = CASE WHEN p.type_poteau LIKE '%EC%' OR p.id_poteau % 3 = 0 THEN 'tri' ELSE 'mono' END,
    etat = 'bon';

-- ============================================================================
-- 6b) MULTI-ALIMENTATION BT (ADR 0010 #2) — jonction N:N alimentation_bt.
--   Alimentation PRINCIPALE = ligne_bt.id_transformateur (plus proche). Pour ~1/4 des
--   lignes BT (les plus chargées en pratique), on ajoute un 2ᵉ transfo (2ᵉ plus proche).
-- ============================================================================
INSERT INTO alimentation_bt (id_ligne_bt, id_transformateur)
SELECT id_ligne_bt, id_transformateur FROM ligne_bt WHERE id_transformateur IS NOT NULL;

INSERT INTO alimentation_bt (id_ligne_bt, id_transformateur)
SELECT b.id_ligne_bt, t2.id_transformateur
FROM ligne_bt b
CROSS JOIN LATERAL (
  SELECT t.id_transformateur FROM transformateur t
  ORDER BY t.geom <-> b.geom OFFSET 1 LIMIT 1
) t2
WHERE b.id_ligne_bt % 4 = 0 AND t2.id_transformateur <> b.id_transformateur
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7) QUARTIERS (dissolution des parcelles par lotissement)
-- ============================================================================
INSERT INTO quartier (nom_quartier, geom, superficie, population)
SELECT 'Lotissement ' || lotissement,
       ST_Multi(ST_UnaryUnion(ST_Collect(geom))),
       round(SUM(ST_Area(geom))::numeric, 0),
       round(SUM(ST_Area(geom))::numeric / 25)::int            -- ~25 m²/hab (heuristique)
FROM stg_parcelle
WHERE lotissement IS NOT NULL AND lotissement <> ''
GROUP BY lotissement;

-- ============================================================================
-- 8) LOCAUX (1 par parcelle réelle) ; type & demande déterministes
-- ============================================================================
INSERT INTO "local" (code_local, adresse, type_batiment, puissance_demandee, id_quartier, geom)
SELECT 'LOC-' || lpad(rn::text, 5, '0'),
       NULLIF(trim(both ' /' FROM (COALESCE(lot, '') || ' / ' || COALESCE(ilot, ''))), ''),
       bt,
       CASE bt WHEN 'residentiel' THEN 4 WHEN 'commercial' THEN 18
               WHEN 'administratif' THEN 25 ELSE 10 END
         + (rn % 5),                                            -- petite variation déterministe
       q.id_quartier,
       p.geom
FROM (
  SELECT geom, lot, ilot, lotissement,
         row_number() OVER (ORDER BY lotissement, ilot, lot) AS rn,
         (ARRAY['residentiel','residentiel','residentiel','residentiel',
                'commercial','commercial','administratif','mixte'])[1 + ((row_number() OVER (ORDER BY lotissement, ilot, lot)) % 8)] AS bt
  FROM stg_parcelle
) p
LEFT JOIN quartier q ON q.nom_quartier = 'Lotissement ' || p.lotissement;

-- ============================================================================
-- 9) BRANCHEMENTS (1:1 local, rattaché au poteau le plus proche)
-- ============================================================================
INSERT INTO branchement (code_branchement, type_branchement, longueur_m, date_branchement, etat, id_poteau, geom)
SELECT 'BR-' || lpad(l.id_local::text, 5, '0'),
       CASE WHEN l.id_local % 6 = 0 THEN 'souterrain' ELSE 'aerien' END,
       round(ST_Distance(ST_Centroid(l.geom), p.geom)::numeric, 1),
       DATE '2016-03-01' + (l.id_local * 7 % 3000), 'bon',
       p.id_poteau, ST_Multi(ST_MakeLine(ST_Centroid(l.geom), p.geom))
FROM "local" l
CROSS JOIN LATERAL (SELECT id_poteau, geom FROM poteau_electrique pp ORDER BY pp.geom <-> l.geom LIMIT 1) p;

UPDATE "local" l
SET id_branchement = b.id_branchement
FROM branchement b
WHERE b.code_branchement = 'BR-' || lpad(l.id_local::text, 5, '0');

-- ============================================================================
-- 9b) CLIENTS MT (ADR 0010 #1) — ~1/97 des locaux sont des sites industriels raccordés
--   directement en MT : branchement MT-direct (id_ligne_mt, sans poteau), forte demande.
--   Sans chemin poteau→ligne_bt, ils sont exclus de la charge de distribution BT (correct :
--   un client MT n'alourdit pas un transfo MT/BT).
-- ============================================================================
UPDATE "local" SET type_batiment = 'industriel', puissance_demandee = puissance_demandee * 10
WHERE id_local % 97 = 0;

UPDATE branchement br
SET id_poteau = NULL,
    type_branchement = 'MT',
    id_ligne_mt = (SELECT lm.id_ligne_mt FROM ligne_mt lm ORDER BY lm.geom <-> br.geom LIMIT 1)
FROM "local" l
WHERE l.id_branchement = br.id_branchement AND l.id_local % 97 = 0;

-- ============================================================================
-- 9c) POSTE → QUARTIERS (ADR 0010 #4) — jonction N:N dérivée de la chaîne
--   poste_source → transfo → alimentation_bt → ligne_bt → poteau → branchement → local.
-- ============================================================================
INSERT INTO poste_quartier (id_poste_source, id_quartier)
SELECT DISTINCT dm.id_poste_source, l.id_quartier
FROM transformateur t
JOIN ligne_mt lm          ON lm.id_ligne_mt = t.id_ligne_mt
JOIN depart_mt dm         ON dm.id_depart = lm.id_depart
JOIN alimentation_bt ab   ON ab.id_transformateur = t.id_transformateur
JOIN poteau_electrique pe ON pe.id_ligne_bt = ab.id_ligne_bt
JOIN branchement br       ON br.id_poteau = pe.id_poteau
JOIN "local" l            ON l.id_branchement = br.id_branchement
WHERE dm.id_poste_source IS NOT NULL AND l.id_quartier IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10) COMPTEURS (1..3 par local selon le type) — POSSEDER local 1,N → compteur
-- ============================================================================
INSERT INTO compteur (numero_compteur, type_compteur, date_installation, statut, id_local, geom)
SELECT 'CPT-' || lpad(l.id_local::text, 5, '0') || '-' || g,
       CASE WHEN l.type_batiment = 'residentiel' THEN 'mono' ELSE 'tri' END,
       DATE '2016-06-01' + ((l.id_local * 13 + g) % 3000),
       CASE WHEN (l.id_local + g) % 25 = 0 THEN 'suspendu' ELSE 'actif' END,
       l.id_local, ST_Centroid(l.geom)
FROM "local" l
CROSS JOIN LATERAL generate_series(1,
  CASE l.type_batiment WHEN 'residentiel' THEN 1 WHEN 'mixte' THEN 2
                       WHEN 'commercial' THEN 2 ELSE 3 END) g;

-- ============================================================================
-- 11) CLIENTS + jonctions N:N (client↔local, client↔compteur)
-- ============================================================================
-- un client « principal » par local
INSERT INTO client (nom_client, telephone, adresse)
SELECT 'Client ' || lpad(l.id_local::text, 5, '0'),
       '+2223' || lpad(((l.id_local * 7919) % 1000000)::text, 6, '0'),
       l.adresse
FROM "local" l ORDER BY l.id_local;

-- client principal ↔ son local (id_client aligné sur id_local par construction)
INSERT INTO client_local (id_client, id_local)
SELECT c.id_client, l.id_local
FROM client c JOIN "local" l ON l.id_local = (c.id_client);

-- multi-locaux : 1 client sur 20 possède aussi le local suivant (démontre le N:N)
INSERT INTO client_local (id_client, id_local)
SELECT c.id_client, l2.id_local
FROM client c
JOIN "local" l2 ON l2.id_local = c.id_client + 1
WHERE c.id_client % 20 = 0
ON CONFLICT DO NOTHING;

-- client ↔ compteurs de ses locaux
INSERT INTO client_compteur (id_client, id_compteur)
SELECT cl.id_client, cp.id_compteur
FROM client_local cl
JOIN compteur cp ON cp.id_local = cl.id_local
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11b) SOUS-DÉCLARATION (pertes non techniques) — signal pour l'analyse heuristique.
--   ~1 zone transfo sur 6 simule des branchements informels / sous-déclarés : on
--   réduit la puissance_demandee de ses locaux. Ces zones paraissent peu chargées
--   mais l'inférence /api/pertes (densité clients × calibre médian) les repère.
--   Appliqué AVANT le dimensionnement pour que la charge calculée reste cohérente.
-- ============================================================================
UPDATE "local" l
SET puissance_demandee = GREATEST(1, round(l.puissance_demandee * 0.40))
FROM branchement br
JOIN poteau_electrique pe ON pe.id_poteau = br.id_poteau
JOIN ligne_bt b           ON b.id_ligne_bt = pe.id_ligne_bt
WHERE l.id_branchement = br.id_branchement
  AND b.id_transformateur % 6 = 0;

-- ============================================================================
-- 12) DIMENSIONNEMENT DES TRANSFORMATEURS
--   charge attendue = somme(puissance_demandee des locaux rattachés) * 0.6 / 0.9
--   puissance_kva = palier standard le plus proche de charge / taux_cible ;
--   le taux cible varie par bucket (id % 10) → mélange réaliste normal/surcharge/critique.
-- ============================================================================
-- Demande répartie à parts égales entre alimentations (ADR 0010) — MÊME formule que
-- v_charge_transformateur, pour que le dimensionnement et l'affichage coïncident.
WITH nb AS (SELECT id_ligne_bt, COUNT(*)::numeric AS n_feeders FROM alimentation_bt GROUP BY id_ligne_bt),
demande AS (
  SELECT t.id_transformateur,
         COALESCE(SUM(l.puissance_demandee / nb.n_feeders), 0) AS kw
  FROM transformateur t
  LEFT JOIN alimentation_bt ab ON ab.id_transformateur = t.id_transformateur
  LEFT JOIN nb ON nb.id_ligne_bt = ab.id_ligne_bt
  LEFT JOIN poteau_electrique p ON p.id_ligne_bt = ab.id_ligne_bt
  LEFT JOIN branchement br ON br.id_poteau = p.id_poteau
  LEFT JOIN "local" l ON l.id_branchement = br.id_branchement
  GROUP BY t.id_transformateur
),
cible AS (
  SELECT id_transformateur, kw,
         (kw * 0.6 / 0.9) AS charge_kva,
         CASE id_transformateur % 10
           WHEN 0 THEN 1.12                            -- critique (~10 %)
           WHEN 1 THEN 0.95 WHEN 2 THEN 0.88           -- surcharges (~20 %)
           ELSE 0.45 + (id_transformateur % 5) * 0.05  -- normaux 0.45–0.65
         END AS taux_cible
  FROM demande
),
dimensionne AS (
  SELECT c.id_transformateur, c.charge_kva,
         (SELECT v FROM (VALUES (50),(100),(160),(250),(400),(630),(1000),(1250),(1600),(2000)) AS l(v)
          ORDER BY abs(l.v - GREATEST(c.charge_kva / NULLIF(c.taux_cible,0), 25)) LIMIT 1) AS kva
  FROM cible c
)
UPDATE transformateur t
SET puissance_kva = d.kva,
    date_mise_service = DATE '2015-01-01' + (t.id_transformateur * 29 % 3200),
    etat = CASE WHEN d.charge_kva / NULLIF(d.kva,0) >= 1.0 THEN 'a_surveiller' ELSE 'bon' END
FROM dimensionne d
WHERE d.id_transformateur = t.id_transformateur;

-- longueurs MT déjà posées ; départ : agrège la longueur de ses lignes MT
UPDATE depart_mt d
SET longueur_km = COALESCE((SELECT round(SUM(longueur_km)::numeric, 2) FROM ligne_mt l WHERE l.id_depart = d.id_depart), 0);

DROP TABLE stg_parcelle;

COMMIT;
