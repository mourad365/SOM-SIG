# Spec — Gestion des coupures & fiabilité (registre + cockpit)

> Statut : approuvé (brainstorming 2026-06-29). Chantier 5 du jumeau numérique.
> Public visé : **exploitation SOMELEC** (conduite réseau) + direction.
> Décision d'architecture associée : **ADR 0008** (persistance d'un registre opérationnel).

## 1. Problème & valeur

La carte sait déjà *tracer* l'impact d'un actif (`topology.js`) et *recalculer* la charge
(`sim/load.js`), mais une coupure — programmée (maintenance, délestage) ou subie (panne) —
n'existe nulle part comme **objet métier**. L'exploitation ne peut donc ni planifier une
coupure avec sa liste de clients, ni suivre un rétablissement, ni produire les **indices de
fiabilité** (SAIDI/SAIFI/CAIDI/ENS) sur lesquels une compagnie de distribution est jugée.

Cette fonctionnalité transforme la traçabilité en **boucle d'exploitation complète** :

```
déclarer → impact chiffré (clients, kVA, ENS) → suivi du rétablissement
        → indices de fiabilité → avis de coupure imprimable
```

Une face « desk d'exploitation » (déclarer + journal) ; une face « direction » (cockpit
fiabilité). Les deux lisent les **mêmes enregistrements `coupure`**.

## 2. Périmètre

**Inclus**
- Table additive `coupure` (PostGIS) : un enregistrement unifié pour coupure programmée
  *et* incident, avec **impact figé à la déclaration** (snapshot).
- Routes API : créer, lister/filtrer, clôturer une coupure ; agrégat fiabilité.
- Réutilisation de `trace()` pour calculer l'impact (aucune nouvelle logique d'impact).
- Cœur pur `fiabilite.js` (SAIDI/SAIFI/CAIDI/ENS) testé sans I/O, façon `sim/load.js`.
- Vue « Coupures » dans le shell : **Journal** (actives/programmées/résolues, horloge de
  rétablissement) + **Cockpit fiabilité** (indices + tendance + classement par poste).
- Bouton « Déclarer une coupure » dans l'Inspecteur ; surbrillance de la zone affectée des
  coupures actives sur la carte (réutilise le mécanisme feature-state de la traçabilité).
- Artefact **Avis de coupure** imprimable + export CSV de la liste clients.
- Seed déterministe d'un **historique simulé** (12 mois) pour que le cockpit ne soit pas vide.

**Exclus (YAGNI)**
- Aucune télémétrie/SCADA (cohérent avec ADR 0003/0005).
- Pas de notifications push / SMS clients (le CSV/avis est l'artefact ; intégration ultérieure).
- Pas d'authentification/rôles (le reste de l'app n'en a pas ; hors périmètre).
- Pas de reconfiguration réseau / report de charge (chantier distinct).

## 3. Décisions structurantes

1. **Enregistrement unifié.** Une seule table `coupure` ; `type ∈ {programmee, incident}` et
   un `fin` nullable distinguent les cas. Pas de table séparée par type (KISS).
2. **Snapshot de l'impact.** `clients_affectes`, `charge_kva`, `ens_kwh` sont **figés à la
   déclaration** (issus de `trace()`). Le modèle réseau peut évoluer ; une coupure de mars
   doit conserver l'impact de mars. Rend l'Avis reproductible.
3. **Colonne `source` = pare-feu de crédibilité.** `'reel'` (saisi dans l'app) vs `'simule'`
   (historique seedé). Le cockpit affiche toujours « dont N simulés » et peut filtrer sur
   `reel`. Même posture que « ancrages réels + distribution synthétique ».
4. **Persistance PostGIS** (écritures DB) — rupture assumée avec la règle « no-write » du
   bac à sable what-if. Un registre qui alimente des indices dans le temps *doit* persister.
   → **ADR 0008**.
5. **Programmées ≠ subies dans les indices.** SAIDI/SAIFI/CAIDI se calculent sur les
   **incidents** ; les coupures programmées sont rapportées séparément. (Convention métier
   standard ; les confondre est le signe d'une métrique mal maîtrisée.)

## 4. Modèle de données — `db/migrations/005_coupures.sql`

Migration additive transactionnelle (`BEGIN; … COMMIT;`), même style que 001–004.

```sql
CREATE TABLE coupure (
  id_coupure        serial PRIMARY KEY,
  type              text NOT NULL CHECK (type IN ('programmee','incident')),
  statut            text NOT NULL CHECK (statut IN ('planifiee','active','resolue')),
  actif_type        text NOT NULL CHECK (actif_type IN ('poste','transfo','ligne')),
  actif_id          int  NOT NULL,
  code_actif        text,                    -- libellé figé (PS-/TR-/code ligne) pour l'avis
  cause             text CHECK (cause IN
                      ('maintenance','delestage','defaut','intemperie','inconnu')),
  debut             timestamptz NOT NULL,
  fin               timestamptz,             -- NULL = en cours
  clients_affectes  int     NOT NULL DEFAULT 0,   -- snapshot trace().summary.clients
  charge_kva        numeric NOT NULL DEFAULT 0,   -- snapshot trace().summary.charge_kva
  ens_kwh           numeric NOT NULL DEFAULT 0,   -- charge_kva × cos_phi × durée_h (0 si en cours)
  source            text NOT NULL DEFAULT 'reel' CHECK (source IN ('reel','simule')),
  commentaire       text,
  cree_le           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupure_statut_ix ON coupure (statut);
CREATE INDEX coupure_type_ix   ON coupure (type);
CREATE INDEX coupure_debut_ix  ON coupure (debut);
CREATE INDEX coupure_actif_ix  ON coupure (actif_type, actif_id);
```

Cohérence `statut` (dérivée, non stockée comme source de vérité) :
`fin IS NOT NULL → 'resolue'` ; sinon `debut > now() → 'planifiee'` ; sinon `'active'`.

## 5. Backend — `api/src/coupures.js` (nouveau router, monté sous `/api`)

Même patron que `analyticsRouter` : `Router()`, SQL **paramétré**, `try/catch` +
`console.error` + `res.status(500)`. Lecture de `cos_phi` depuis `parametre`.

| Route | Comportement | Critère de réussite (done =) |
|---|---|---|
| `POST /api/coupures` | valide le corps ; appelle `trace(actif_type, actif_id, 'down')` ; **fige** clients/charge_kva ; calcule `ens_kwh` si `fin` fourni ; dérive `statut` ; insère `source='reel'` ; renvoie l'enregistrement | `clients_affectes` == `trace().summary.clients` |
| `GET /api/coupures?statut=&type=&source=&from=&to=` | journal filtré, tri `debut DESC` | les filtres restreignent correctement |
| `PATCH /api/coupures/:id/cloturer` | corps `{fin?}` (défaut `now()`) ; recalcule `ens_kwh` depuis la durée ; `statut='resolue'` | la clôture fixe `fin`+`ens_kwh` et bascule le statut |
| `GET /api/fiabilite?from=&to=&source=` | agrège le registre → indices + timeline mensuelle + classement par poste | historique seedé → indices plausibles ; `source=reel` vide → zéros gracieux |

**Validation au bord (fail-fast)** : `type`/`actif_type`/`cause` ∈ listes ; `actif_id`
entier ; `debut` date valide ; `fin ≥ debut` si fourni → sinon `400`. `trace()` 404 → `404`.

**`GET /api/fiabilite`** renvoie :
```json
{
  "periode": {"from": "...", "to": "..."},
  "n_clients": 12450,
  "incidents": {"saidi_h": 4.2, "saifi": 1.8, "caidi_h": 2.33, "ens_kwh": 38200, "n": 14},
  "programmees": {"saidi_h": 0.9, "saifi": 0.4, "ens_kwh": 8100, "n": 6},
  "timeline": [{"mois": "2026-01", "saidi_h": 0.4, "saifi": 0.2, "ens_kwh": 3100, "n": 2}],
  "classement": [{"poste_id": 3, "code": "PS-3", "n_incidents": 5, "ens_kwh": 12000, "client_heures": 880}],
  "source_filtre": "all", "n_simule": 18
}
```

## 6. Math de fiabilité — `web/src/coupures/fiabilite.js` (cœur pur)

Façon `sim/load.js` : zéro I/O, fonctions pures, réutilisées par l'UI **et** par les tests.
Le backend calcule les mêmes formules en SQL ; ce module garantit des libellés et un
agrégat testables côté client (et sert au cockpit pour recomposer les sous-totaux).

- `N` = clients servis = `count(compteur)`.
- **SAIFI** = Σ `clients_affectes` (incidents) / N.
- **SAIDI** = Σ (`clients_affectes` × `durée_h`, incidents) / N → heures/client.
- **CAIDI** = SAIDI / SAIFI (0 si SAIFI = 0).
- **ENS** = Σ (`charge_kva` × `cos_phi` × `durée_h`) → kWh.
- `durée_h` = (`fin` − `debut`) / 3600 ; coupure active → (`now` − `debut`) (ENS s'accumule).
- N = 0 → indices `null` (affichés « — »).
- Programmées : mêmes formules, agrégat séparé.

`export const COS_PHI = 0.90;` (constante partagée, documentée, jamais en dur ailleurs).

Tests `web/src/coupures/fiabilite.test.js` (`node --test`) : un cas par formule sur un
jeu fixe à résultat connu + bornes (N=0, coupure active sans `fin`, exclusion des
programmées des indices incidents).

## 7. Frontend — `web/src/coupures/` (nouveau dossier)

Réutilise `ui/` (Drawer, Select, Table, Chip, Stat, CountUpValue, Badge, Button, EmptyState,
Spinner, Tabs), les tokens (`LOAD`, `COLOR`), Recharts et les patrons GSAP existants.
Copie 100 % en français. Aucune couleur en dur.

- **`useCoupures.js`** — hook : `list(filtre)`, `create(payload)`, `cloturer(id)`,
  `fiabilite(filtre)` ; état chargement/erreur. Appelle les wrappers de `api.js`.
- **`DeclareCoupure.jsx`** — `Drawer` ouvert depuis l'Inspecteur : `Select` type & cause,
  champ horaire (« maintenant » / fenêtre programmée), commentaire. Affiche **l'impact en
  direct** (réutilise les chiffres de `trace`) avant enregistrement. `POST` puis ferme.
- **`JournalCoupures.jsx`** — `Table` des coupures ; `FilterChip` (actives / programmées /
  résolues) ; **horloge de rétablissement** vivante sur les actives ; bouton « Clôturer ».
- **`CockpitFiabilite.jsx`** — bandeau d'indices (`Stat`+`CountUpValue` : SAIDI/SAIFI/CAIDI/
  ENS), graphe de tendance (Recharts), classement par poste (`Table`). Libellé
  « dont N simulés » + `Toggle` de filtre `source`.
- **`AvisCoupure.jsx`** — Avis de coupure imprimable (CSS `@media print`, tokens de marque) :
  en-tête, actif, fenêtre, **liste des clients affectés**, pied. Bouton export CSV.
- **`coupures.css`** — styles locaux (impression incluse).

**Intégration shell (fichiers partagés — modifs ceinturées de marqueurs `--- coupures ---`)**
- `web/src/api.js` : wrappers `getCoupures`, `createCoupure`, `cloturerCoupure`, `getFiabilite`.
- `web/src/shell/TopBar.jsx` : ajouter `{ key: 'coupures', label: 'Coupures' }` à `VIEWS`.
- `web/src/App.jsx` : état `view === 'coupures'` → `Tabs` Journal / Fiabilité ; passer
  `onDeclareCoupure` à l'Inspecteur ; coupures actives → `highlighted` sur la carte.
- `web/src/shell/Inspector.jsx` : bouton « Déclarer une coupure » à côté de « Tracer
  l'impact » (bloc `--- coupures ---`).

## 8. Données de démonstration — `db/seed/030_coupures_historique.sql`

Historique **déterministe** (aucune fonction aléatoire non semée) de ~20 coupures sur
12 mois, `source='simule'`, accroché à de vrais transfos (`SELECT … ORDER BY id LIMIT`),
mélange de causes plausibles, mélange programmées/incidents, impacts cohérents avec la
chaîne (calcul `clients_affectes`/`charge_kva` via sous-requêtes sur la topologie). Copié
dans l'image via `db/Dockerfile` en `zzz-030_…` (après `zzz-020_synthese`).

## 9. Tests & vérification

- `api/src/coupures.test.js` (`node --test`, pool DB, `after(() => pool.end())`) :
  snapshot == trace ; clôturer fixe `fin`+`ens`+statut ; `/fiabilite` sur fixture à indices
  connus ; programmées exclues des indices incidents ; N=0 gracieux.
- `web/src/coupures/fiabilite.test.js` : formules pures (cf. §6).
- **Chemin de démo** : déclarer un incident sur **TR-TRAP** → le journal le montre actif
  avec horloge → clôturer → SAIDI/ENS bougent au cockpit → imprimer l'Avis.

## 10. Réutilisation (Reuse > Enhance > Create)

| Besoin | Réutilise |
|---|---|
| Impact d'une coupure | `api/src/topology.js` → `trace()` |
| Constantes charge | `parametre` (cos_phi) ; `sim/load.js` (référence) |
| Couleurs de classe | `theme/tokens.js` (`LOAD`, `classeColorExpr`) — jamais en dur |
| Surbrillance carte | feature-state `highlighted` (traçabilité, `map/trace-highlight.js`) |
| Primitives UI | `ui/` (Drawer, Table, Chip, Stat, Tabs, Badge…) |
| Indices/cartes KPI | patron `dashboard/KpiStrip.jsx` (`Stat`+`CountUpValue`) |
| Graphes | Recharts (patron `dashboard/Charts.jsx`) |

Nouvelle surface réellement neuve : la table `coupure`, la math du cockpit, l'Avis imprimable.
```
