# SIG SOMELEC — Plan d'implémentation (pilote Nouakchott)

**Objectif** : un dashboard web + carte web qui montrent le réseau électrique de la SOMELEC
et font **ressortir les lignes/transformateurs en surcharge** (points chauds), pour appuyer
la décision. Source de vérité unique : **PostgreSQL/PostGIS**, éditable nativement dans **QGIS**.

**Décisions validées**
- Source de charge : **heuristique SQL statique** (somme des puissances souscrites en aval vs capacité nominale). Pas de télémétrie au démarrage ; remplaçable plus tard par pandapower ou SCADA sans refonte.
- Schéma : **MCD simplifié** (7 tables).
- Livrable courant : ce plan, à valider avant tout code.

---

## 0. Architecture cible — stack PERN (MERN avec PostgreSQL au lieu de Mongo)

> **Note stack** : le « M » de MERN = MongoDB, **incompatible ici** : PostGIS (= PostgreSQL) est
> obligatoire pour l'index spatial, les colonnes `geom`, les vues SQL de charge, et surtout
> **l'édition native dans QGIS** (QGIS ne peut pas éditer MongoDB). On garde donc **E/R/N en
> JavaScript** et PostgreSQL comme base = **stack PERN**. Aucun composant Rust.

```
QGIS (édition) ─┐
                ├─► PostgreSQL + PostGIS ─► vues SQL "taux_charge" ─┬─► Express : tuiles MVT (ST_AsMVT) ─► MapLibre GL (carte web)
(SCADA/AMI plus tard) ┘                                            └─► Express : API REST (KPI, top-10) ─► Dashboard React
```

- **Base** : PostgreSQL 16 + PostGIS, SRID **32628** (déjà prévu dans le MCD).
- **Calcul de charge** : vues SQL (pas de moteur externe au pilote).
- **Tuiles** : générées **dans Express via `ST_AsMVT()`** (fonction native PostGIS) — pas de serveur de tuiles séparé, **pas de Rust**. Une route `/tiles/:couche/:z/:x/:y.pbf` = une requête SQL.
- **API** : **Node/Express + node-postgres (`pg`)** — tuiles + agrégats dashboard (top-10, compteurs, KPI).
- **Carte** : **MapLibre GL JS** — style data-driven : couleur/épaisseur selon `taux_charge`, les surcharges "ressortent".
- **Dashboard** : **React** (carte + cartes KPI + tableaux + graphes).
- **QGIS** : client d'édition sur la même base ; projet `.qgz` stylé avec les mêmes seuils ; QGIS Server (WMS) optionnel.
- **Conteneurisation** : `docker-compose` (postgres, api Express, web React). Un seul service Node sert tuiles + API.

Monorepo proposé :
```
/db      migrations SQL + données d'exemple + vues
/api     Node/Express (agrégats dashboard)
/web     React + MapLibre (carte + dashboard)
/qgis    projet .qgz + styles
/docs    décisions (ADR)
docker-compose.yml
```

---

## ⚠️ Point dur à trancher : la charge des LIGNES

Dans le MCD **simplifié**, `LIGNE` n'a **aucune FK** vers un transformateur/poste/départ — elle
n'est donc pas reliée électriquement à une charge. Conséquences :

- **Transformateurs** : la charge statique est calculable directement (`POINT_SERVICE.transfo_id`).
  → on additionne les `puiss_souscrite_kw` en aval. **Fiable.**
- **Lignes** : impossible d'attribuer une charge sans topologie.

**Solution minimale retenue** (enhancement non-cassant) : ajouter sur `LIGNE` une FK **nullable**
`transfo_id` (ou `poste_id`) = "cette ligne alimente / part de cet équipement". Les lignes
renseignées héritent de la charge aval ; les autres sont affichées "capacité connue, charge inconnue"
(gris). Aucune ligne existante n'est cassée (colonne nullable). À documenter en ADR.

> Alternative si vous préférez ne pas toucher au schéma : importer un courant mesuré/estimé par ligne
> dans une colonne `courant_a`. À décider en Phase 1.

---

## Heuristique de charge (cœur métier)

Paramètres configurables dans une table `parametre` (modifiables sans redéploiement) :
- `cos_phi` (facteur de puissance, déf. 0.90) — conversion kW ↔ kVA.
- `facteur_foisonnement` (déf. 0.60) — toutes les charges souscrites ne sont pas simultanées.
- `seuil_alerte` (déf. 0.80) et `seuil_critique` (déf. 1.00) — seuils de `taux_charge`.

**Transformateur** :
```
charge_kva = Σ(puiss_souscrite_kw aval) × facteur_foisonnement / cos_phi
taux_charge = charge_kva / puissance_kva
classe = critique si ≥ seuil_critique, surcharge si ≥ seuil_alerte, sinon normal
```

**Ligne** (si attribuée à un équipement, sinon `inconnu`) :
```
capacite_a = ampacité(section_mm2, type_pose)   -- table de correspondance
charge_a   = charge_kva_attribuée / (√3 × U_kV × cos_phi)
taux_charge = charge_a / capacite_a
```
`U_kV` vient de `NIVEAU_TENSION.valeur`. Table d'ampacité (section × aérien/souterrain) à seeder
depuis les normes câble — valeurs provisoires au pilote, à affiner avec la SOMELEC.

---

## Phases

### Phase 1 — Base de données (PostGIS)
1. `docker-compose` + image postgis ; migration `001_schema.sql` : 7 tables du MCD simplifié, géométries SRID 32628, index **GIST** sur chaque `geom`.
2. FK nullable `transfo_id` sur `LIGNE` (attribution de charge).
3. Tables de référence : `parametre`, `ampacite_cable`, seed `NIVEAU_TENSION`.
4. Jeu de données d'exemple Nouakchott (quelques postes/transfos/points/lignes), **dont un transfo volontairement en surcharge** pour la recette.
- **Vérif** : `\dt` montre 7 tables + ref ; `SELECT ST_SRID(geom)` = 32628 ; données chargées.

### Phase 2 — Vues de charge (heuristique)
1. `v_charge_transformateur` (taux_charge, classe, charge_kva, géométrie).
2. `v_charge_ligne` (taux_charge/classe ou `inconnu`, géométrie).
3. Classification via `parametre`. Vues simples au pilote (matérialisées + refresh si lenteur).
- **Vérif** : test SQL — entrées connues → `taux_charge` attendu ; le transfo piégé sort en `critique`.

### Phase 3 — Tuiles + API (un seul service Express)
1. Route tuiles **`GET /tiles/:couche/:z/:x/:y.pbf`** : génère le MVT via **`ST_AsMVT()`** depuis `v_charge_transformateur` / `v_charge_ligne` (geom reprojetée 3857 + taux_charge + classe + libellés). Cache HTTP + `pg` pool.
2. API agrégats : `GET /api/kpi` (compteurs par classe), `GET /api/top-surcharges` (top-10), `GET /api/asset/:type/:id`.
- **Vérif** : `/tiles/transfo/12/x/y.pbf` renvoie du MVT non vide ; `/api/top-surcharges` liste le transfo piégé.

### Phase 4 — Carte web (MapLibre)
1. Fond de carte libre + couches vectorielles depuis Martin.
2. Style data-driven : lignes/cercles **vert→ambre→rouge** selon `taux_charge` ; surcharges élargies/halo pour "ressortir" ; gris pour `inconnu`.
3. Filtre "surcharge/critique uniquement" ; popup au clic (détails + taux). Légende.
- **Vérif** : le transfo piégé est rouge et visible ; le filtre masque les normaux.

### Phase 5 — Dashboard
1. Cartes KPI (nb en surcharge/critique, % réseau sain, total équipements).
2. Tableau **Top-10 surcharges** (clic → zoom carte).
3. Graphes : histogramme de `taux_charge`, charge par poste/wilaya.
- **Vérif** : KPI cohérents avec le SQL ; clic top-10 recadre la carte.

### Phase 6 — Intégration QGIS
1. Doc connexion QGIS → même PostGIS (lecture/édition native).
2. Projet `.qgz` stylé sur les mêmes seuils ; QGIS Server (WMS) optionnel pour une carto identique côté web.
- **Vérif** : édition d'un attribut dans QGIS → après refresh, reflété sur la carte web.

### Phase 7 — Recette & tests
- Données piégées (transfo surchargé) traversent toute la chaîne : SQL → tuile → carte rouge → dashboard top-10.
- Tests des vues SQL (entrées→sorties). README de démarrage `docker-compose up`.

---

## Décisions à consigner (ADR dans /docs/decisions)
1. PostGIS comme source unique + QGIS éditeur (vs SIG propriétaire).
2. Tuiles via Express `ST_AsMVT()` (stack PERN, pas de Rust) plutôt que Martin/GeoServer.
3. Heuristique SQL statique vs load-flow (pandapower) — chemin d'évolution.
4. FK nullable `transfo_id` sur `LIGNE` pour l'attribution de charge.

## Évolutions futures (hors pilote)
- Remplacer l'heuristique par **pandapower** (load-flow réel) — la topologie du MCD complet s'y prête.
- Brancher SCADA/compteurs AMI → table `mesure` time-series → points chauds temps réel.
- Passer au **MCD complet** (nœuds, départs, organes) pour le traçage de connectivité.
```
```
