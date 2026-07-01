# Visualisations recommandées

Au-delà des modèles MERISE : les schémas et écrans que je recommande pour exploiter la base.

## 1. Architecture de déploiement

```mermaid
flowchart LR
  subgraph Navigateur
    W[Web · React + MapLibre<br/>:5173]
  end
  subgraph Docker["docker compose"]
    A[API · Express<br/>:3001 — /api + /tiles]
    DB[(PostGIS 16-3.4<br/>hôte :5433 → :5432)]
  end
  CDN[(Fonds de carte<br/>CARTO / OSM / Esri)]

  W -->|REST /api/*| A
  W -->|tuiles MVT /tiles/*| A
  W -.->|tuiles raster/vecteur| CDN
  A -->|pg / SQL| DB
```

## 2. Graphe de topologie réseau (chaîne électrique)

```mermaid
flowchart TB
  SRC([SOURCE_ELECTRIQUE]) --> PS([POSTE_SOURCE])
  PS --> DEP([DEPART_MT]) --> LMT([LIGNE_MT]) --> TR([TRANSFORMATEUR])
  TR -. "N:N alimentation_bt" .-> LBT([LIGNE_BT])
  LBT --> POT([POTEAU_ELECTRIQUE]) --> BR([BRANCHEMENT]) --> LOC([LOCAL]) --> CPT([COMPTEUR])
  CLI([CLIENT]) -. "N:N" .-> LOC
  CLI -. "N:N" .-> CPT
  LMT -- "client MT (usine)" --> BR
  PS -. "N:N poste_quartier" .-> QT([QUARTIER])
  QT --> LOC

  classDef mt fill:#dbeafe,stroke:#1e40af;
  classDef bt fill:#dcfce7,stroke:#166534;
  classDef cli fill:#fef9c3,stroke:#854d0e;
  class SRC,PS,DEP,LMT,TR mt;
  class LBT,POT,BR bt;
  class LOC,CPT,CLI,QT cli;
```

## 3. Cycle de vie d'une coupure (ADR 0009)

```mermaid
stateDiagram-v2
  [*] --> planifiee : programmée (maintenance / délestage)
  [*] --> active : incident (panne)
  planifiee --> active : début atteint
  active --> resolue : rétablissement (fin)
  resolue --> [*]
  note right of active
    impact figé au snapshot :
    clients_affectes, charge_kva
  end note
```

## 4. Lignée des données — réel vs synthétique

```mermaid
flowchart LR
  ZIP[(Données.zip<br/>shapefiles terrain)]
  GEN[shp2sql.mjs → 010_real_geometry.sql]
  SYN[020_synthese.sql<br/>PostGIS déterministe]

  ZIP --> GEN
  GEN --> R1[ligne_bt · 363]
  GEN --> R2[poteau_electrique · 2185]
  GEN --> R3[local · 5085 / quartier · 15]

  SYN --> S1[source · poste · depart · ligne_mt]
  SYN --> S2[transformateur · 100]
  SYN --> S3[branchement · compteur · client]
  SYN --> S4[alimentation_bt · poste_quartier]

  R1 & R2 & R3 -. ancrage spatial .- SYN

  classDef reel fill:#dcfce7,stroke:#166534;
  classDef synth fill:#ffedd5,stroke:#9a3412;
  class R1,R2,R3 reel;
  class S1,S2,S3,S4 synth;
```

> **Vert = terrain réel** (géométrie). **Orange = synthétisé** (réseau MT, transfos, clientèle,
> connectivité). Toute l'analyse de charge/twin/coupures dérive de la couche synthétique.

## 5. Écrans & couches cartographiques recommandés

| Visualisation | Données mobilisées | État |
|---|---|---|
| **Carte de surcharge** (transfos/lignes colorés par `classe`) | v_charge_transformateur, v_charge_ligne | ✅ en place |
| **Tableau de bord fiabilité** (KPIs, histogramme, alertes) | /stats, /kpi, /histogramme, /alertes | ✅ |
| **Traçabilité amont/aval** (surbrillance d'impact) | /trace (alimentation_bt) | ✅ |
| **Cockpit coupures** (registre + SAIDI/SAIFI/CAIDI/ENS) | coupure, /fiabilite | ✅ (ADR 0009) |
| **Pertes non techniques** (zones suspectes) | /pertes (densité × calibre) | ✅ |
| **Prévision de saturation** (curseur temporel) | /prevision | ✅ |
| **Couche clients MT** (usines raccordées en MT) | branchement.id_ligne_mt, local industriel | ▶ à exposer (modèle prêt) |
| **Lignes BT multi-alimentées** (surbrillance) | alimentation_bt (90 lignes) | ▶ à exposer |
| **Couverture poste → quartiers** (emprise desservie) | poste_quartier + quartier.geom | ▶ à exposer |
| **Supports par phases** (mono/tri) | poteau_electrique.phases | ▶ à exposer |
| **Sens des transformateurs** (abaisseur/élévateur) | transformateur.sens | ▶ à exposer |

✅ = déjà dans l'app · ▶ = donnée disponible (ADR 0010), reste à afficher côté UI.

## 6. Recommandations de mise en œuvre (UI)

- **Filtres** : ajouter `sens` (MT/BT · BT/MT), `phases` (mono · tri) et un bascule
  « clients MT » dans le panneau de couches (mêmes conventions que les filtres existants).
- **Légende** : distinguer une **ligne BT multi-alimentée** (p.ex. liseré) — c'est le signal
  le plus utile pour l'exploitant (redondance / report de charge).
- **Inspecteur** : sur un transformateur, lister ses **lignes BT alimentées** et sa part de
  charge ; sur un local industriel, afficher le **raccordement MT**.
- **Carte choroplèthe** : `quartier` coloré par charge agrégée ou par poste desservant
  (via `poste_quartier`) — vue « territoire » complémentaire de la vue « actif ».
