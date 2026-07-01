# MPD — Modèle Physique de Données (PostgreSQL 16 / PostGIS 3.4)

Niveau **physique** : types SGBD réels, géométrie PostGIS, contraintes, index, vues.
SGBD : `postgis/postgis:16-3.4`. Toute la géométrie est en **EPSG:32628** (UTM‑28N Nouakchott).
Source : `db/migrations/00{1..6}_*.sql`.

## Tables — colonnes physiques

### Réseau (amont → aval)

| Table | Colonne | Type | Contraintes |
|---|---|---|---|
| **source_electrique** | id_source | `serial` | PK |
| | nom_source | `text` | NOT NULL |
| | type_source | `text` | |
| | puissance_mw | `numeric` | |
| | geom | `geometry(Point,32628)` | GiST |
| **poste_source** | id_poste_source | `serial` | PK |
| | tension_entree / tension_sortie | `text` | ex. `'33 kV'` / `'15 kV'` |
| | capacite_mva | `numeric` | |
| | id_source | `int` | FK → source_electrique |
| | date_mise_service | `date` | |
| | statut | `text` | |
| | geom | `geometry(Point,32628)` | GiST |
| **depart_mt** | id_depart | `serial` | PK |
| | tension_kv, longueur_km | `numeric` | |
| | etat | `text` | |
| | id_poste_source | `int` | FK → poste_source |
| | geom | `geometry(MultiLineString,32628)` | GiST |
| **ligne_mt** | id_ligne_mt | `serial` | PK |
| | code_ligne_mt | `text` | UNIQUE NOT NULL |
| | type_ligne, etat | `text` | |
| | tension_kv, longueur_km | `numeric` | |
| | id_depart | `int` | FK → depart_mt |
| | date_mise_service | `date` | |
| | geom | `geometry(MultiLineString,32628)` | GiST |
| **transformateur** | id_transformateur | `serial` | PK |
| | code_transformateur | `text` | UNIQUE NOT NULL |
| | puissance_kva | `numeric` | |
| | tension_entree / tension_sortie | `text` | |
| | **sens** | `text` | `'MT/BT'` \| `'BT/MT'` (ADR 0010) |
| | etat, statut | `text` | |
| | id_ligne_mt | `int` | FK → ligne_mt |
| | date_mise_service | `date` | |
| | geom | `geometry(Point,32628)` | GiST |
| **ligne_bt** *(géom réelle)* | id_ligne_bt | `serial` | PK |
| | code_ligne_bt | `text` | UNIQUE NOT NULL |
| | type_ligne, etat | `text` | |
| | tension_v, longueur_m | `numeric` | |
| | id_transformateur | `int` | FK → transformateur (**principal**) |
| | date_mise_service | `date` | |
| | geom | `geometry(MultiLineString,32628)` | GiST |
| **poteau_electrique** *(géom réelle)* | id_poteau | `serial` | PK |
| | code_poteau | `text` | UNIQUE NOT NULL |
| | type_poteau, materiau, etat | `text` | |
| | hauteur_m | `numeric` | |
| | **phases** | `text` | `'mono'` \| `'tri'` (ADR 0010) |
| | id_ligne_bt | `int` | FK → ligne_bt |
| | geom | `geometry(Point,32628)` | GiST |
| **branchement** | id_branchement | `serial` | PK |
| | code_branchement | `text` | UNIQUE NOT NULL |
| | type_branchement, etat | `text` | |
| | longueur_m | `numeric` | |
| | date_branchement | `date` | |
| | id_poteau | `int` | FK → poteau_electrique (nullable) |
| | **id_ligne_mt** | `int` | FK → ligne_mt (nullable, ADR 0010) |
| | geom | `geometry(MultiLineString,32628)` | GiST |
| | — | `CHECK` | `id_poteau IS NOT NULL OR id_ligne_mt IS NOT NULL` |

### Clientèle & territoire

| Table | Colonne | Type | Contraintes |
|---|---|---|---|
| **quartier** *(géom réelle)* | id_quartier | `serial` | PK |
| | nom_quartier | `text` | NOT NULL |
| | population | `int` | |
| | superficie | `numeric` | m² |
| | geom | `geometry(MultiPolygon,32628)` | GiST |
| **local** *(géom réelle)* | id_local | `serial` | PK |
| | code_local | `text` | UNIQUE NOT NULL |
| | adresse, type_batiment | `text` | |
| | puissance_demandee | `numeric` | kW (pilote la charge) |
| | id_quartier | `int` | FK → quartier |
| | id_branchement | `int` | FK → branchement, **UNIQUE** (1:1) |
| | geom | `geometry(MultiPolygon,32628)` | GiST |
| **compteur** | id_compteur | `serial` | PK |
| | numero_compteur | `text` | UNIQUE NOT NULL |
| | type_compteur, statut | `text` | |
| | date_installation | `date` | |
| | id_local | `int` | FK → local |
| | geom | `geometry(Point,32628)` | GiST |
| **client** | id_client | `serial` | PK |
| | nom_client | `text` | NOT NULL |
| | telephone, adresse | `text` | |

### Jonctions N:N

| Table | Colonnes | PK |
|---|---|---|
| **alimentation_bt** | id_ligne_bt, id_transformateur | (id_ligne_bt, id_transformateur) |
| **poste_quartier** | id_poste_source, id_quartier | (id_poste_source, id_quartier) |
| **client_local** | id_client, id_local | (id_client, id_local) |
| **client_compteur** | id_client, id_compteur | (id_client, id_compteur) |

### Référence & métier

| Table | Colonnes clés |
|---|---|
| **parametre** | cle `text` PK, valeur `numeric`, note `text` — `cos_phi=0.90`, `facteur_foisonnement=0.60`, `seuil_alerte=0.80`, `seuil_critique=1.00` |
| **coupure** | id_coupure PK · type/statut/actif_type/cause `CHECK` · debut/fin `timestamptz` · clients_affectes/charge_kva/ens_kwh (snapshot) · source · `CHECK fin>=debut` |

## Index

- **Spatiaux (GiST)** sur tous les `geom` : `*_geom_gix`.
- **Clés étrangères** (jointures de charge/traçabilité) : `poste_source_source_ix`,
  `depart_poste_ix`, `ligne_mt_depart_ix`, `transfo_ligne_mt_ix`, `ligne_bt_transfo_ix`,
  `poteau_ligne_bt_ix`, `branchement_poteau_ix`, `branchement_ligne_mt_ix`,
  `alimentation_bt_transfo_ix`, `local_quartier_ix`, `local_branchement_ix`, `compteur_local_ix`.
- **Coupures** : `coupure_statut_ix`, `coupure_type_ix`, `coupure_source_ix`, `coupure_debut_ix`,
  `coupure_actif_ix(actif_type, actif_id)`.

## Vues (contrat d'intégration — API / tuiles)

| Vue | Rôle | Colonnes de sortie clés |
|---|---|---|
| **v_charge_transformateur** | charge & classe par transfo. `charge_kva = Σ(puissance_demandee/n_alimentations) × foisonnement / cos_phi` ; classe vs seuils. Répartition égale via `alimentation_bt` (ADR 0010). | transfo_id, code_actif, poste_id, puissance_kva, charge_kva, taux_charge, classe, niveau_tension, geom, date_mise_service |
| **v_charge_ligne** | la ligne BT hérite de la classe de son transfo **principal** | ligne_id, code_actif, niveau_tension, transfo_id, taux_charge, classe, longueur_m, geom |

## Particularités physiques

- **SRID 32628** partout ; les tuiles reprojettent en 3857 (`ST_Transform`) et `ST_AsMVT`.
- Les `geom` lignes sont **MultiLineString** (les tracés terrain peuvent être multi-parties).
- `serial` = `integer` + séquence (auto-incrément).
- Pas de `ON DELETE` cascade : suppressions gérées applicativement (pilote).
- Ordre d'init (entrypoint) : migrations `001→006` puis seeds `010` (géométrie réelle) →
  `020` (synthèse) → `030` (historique coupures).
