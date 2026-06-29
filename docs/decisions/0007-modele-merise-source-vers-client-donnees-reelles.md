# 0007 — Modèle MERISE source→client + données réelles (terrain SOMELEC)

Status: Accepted

Supersedes the data layer of ADR 0003/0004/0005 (schéma 7 tables, distribution synthétique).
Les couches d'intelligence d'ADR 0005 (traçabilité, what-if, pertes, prévision) restent valides :
elles dérivent du nouveau modèle de la même manière.

## Context
Le schéma initial (`poste, transformateur, ligne, support, abonne, point_service`) modélisait
le réseau comme un ensemble d'**actifs physiques** à plat, alimenté par un seed **entièrement
fictif** (ADR 0005 : « la distribution MT/BT reste synthétique »). Le métier SOMELEC a fourni
(1) un **MCD complet** traçant la chaîne `SOURCE → POSTE_SOURCE → DÉPART_MT → LIGNE_MT →
TRANSFORMATEUR → LIGNE_BT → POTEAU → BRANCHEMENT → LOCAL → COMPTEUR → CLIENT`, et (2) des
**données terrain réelles** (`Données.zip` : 10 shapefiles — lignes BT, poteaux, parcelles
cadastrales de Nouakchott).

## Problem
Migrer la base vers le MCD métier, charger les données réelles disponibles, et garder
l'application (API, tuiles MVT, carte, dashboard) fonctionnelle de bout en bout — sachant que
les données réelles ne couvrent **que** la géométrie BT (lignes, poteaux) et les parcelles ;
le réseau MT, les transformateurs et toute la couche commerciale (compteurs/clients) n'ont
aucune source réelle.

## Options considered
- **A — Réécrire le schéma au MCD + vues de compatibilité.** Les tables de base deviennent le
  MCD fidèle ; une fine couche de vues (`v_charge_transformateur`, `v_charge_ligne`, + vues
  d'adossement des tuiles) réexpose le **vocabulaire de colonnes** attendu par le front
  (`transfo_id, code_actif, classe, taux_charge, niveau_tension, date_mise_service…`). Le
  contrat d'intégration (déjà « les vues/endpoints » en ADR 0005) absorbe le renommage.
- **B — Big-bang : renommer partout** (tables + API + tuiles + tout le JS carte). Fidèle mais
  large surface de churn et de régressions sur du code carte stable (animations, capture PNG).
- **C — Ajouter le MCD à côté de l'ancien schéma.** Double source de vérité — viole DRY.

## Decision
**Option A.** 

1. **Schéma MCD (tables de base).** 12 entités + 2 tables de jonction, géométrie en **SRID 32628**
   (UTM-28N, inchangé). `LOCAL` **remplace** `MAISON` : un `local` est un bâtiment qui possède
   **plusieurs** compteurs (`local 1,N → compteur`), et les liens commerciaux sont **N:N** —
   `client_local` (un client a plusieurs locaux, un local plusieurs clients) et `client_compteur`
   (un client a plusieurs compteurs). `BRANCHEMENT 1:1 LOCAL`.
2. **Données réelles (hybride).** Les géométries réelles sont chargées telles quelles :
   `ligne_bt` (Ligne1–4), `poteau_electrique` (Poteaux1–3 + Poteaux_ecl1–2), `local`/`quartier`
   (parcelles « Plan de la zone » → `LOT`/`LOTISSEMENT`). Le reste (sources, postes source,
   départs, lignes MT, **transformateurs**, branchements, compteurs, clients) est **synthétisé
   de façon déterministe dans PostGIS**, ancré sur la géométrie réelle (clustering des poteaux
   par grille, FK câblées par plus-proche-voisin `<->`), de sorte que l'analyse de charge/
   surcharge garde du sens sur des emprises réelles.
3. **Normalisation CRS.** Les shapefiles arrivent en 3 systèmes (EPSG:4326 ; EPSG:32629 « UTM-29N »
   mal étiqueté mais cohérent ; EPSG:32628 pour les parcelles). Tous sont reprojetés en 32628 via
   `ST_Transform` au chargement.
4. **Contrat de compatibilité.** Les vues d'analyse et d'adossement des tuiles conservent les noms
   de colonnes hérités → `Map.jsx`/`style.js` (le gros du JS carte) restent inchangés ; seuls
   `tiles.js` (relations/colonnes) et quelques requêtes `api.js` (stats/search/détail) sont adaptés.

## Why
- **Fidèle au métier** : les tables de base *sont* le MCD ; rien n'est caché.
- **Minimal-Code / non destructif côté front** : le vocabulaire des tuiles est le point de
  couplage ; le figer dans des vues évite de toucher au code d'animation/capture éprouvé.
- **PostGIS fait la géo** : le parseur Node ne fait qu'extraire la géométrie (binaire→WKT) ;
  reprojection, clustering et jointures spatiales se font en SQL déterministe (pas de `random()`),
  cohérent avec ADR 0003 (heuristique statique reproductible).
- **La charge survit** : `local.puissance_demandee` agrège vers le transformateur via la chaîne
  poteau→ligne_bt→transfo ; la formule (cos φ, foisonnement, seuils) d'ADR 0003 est conservée.

## Consequences
- `geom` et `date_mise_service` sont ajoutés (nullable) aux entités spatiales/temporelles bien
  que hors liste d'attributs du MCD : un SIG exige la géométrie, et la mise en évidence
  « infrastructure récente » de l'UI exige la date. Additif, documenté ici.
- La couche commerciale et le réseau MT restent **synthétiques** (aucune donnée réelle fournie) —
  à étiqueter comme tels ; remplaçables sans changer le schéma quand SOMELEC livrera le réel.
- `local` est un mot-clé SQL : la table est nommée `local` et **toujours citée** `"local"` en DDL/SQL.
- `ampacite_cable` (capacité par section) devient orphelin (les lignes du MCD n'ont pas de section) :
  la charge de ligne **hérite** désormais de la classe du transformateur qui l'alimente (ADR 0004,
  esprit conservé) ; la table de capacité par section est retirée.
- Reconstruction de la base = volume jetable : `docker compose down -v && up --build`.
</content>
</invoke>
