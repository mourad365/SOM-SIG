# Jumeau numérique SOM-SIG — feuille de route & contrat d'intégration

> Voir ADR `docs/decisions/0005-digital-twin-tracabilite.md` pour la décision.
> Ce document est le **contrat** que les trois chantiers parallèles respectent pour
> fusionner sans collision. Chacun travaille dans un worktree git isolé.

## Vision
Passer d'une **carte descriptive** (points colorés) à un **jumeau numérique décisionnel**
en quatre couches, sans télémétrie :

```
4. PRÉVISION  → « où le réseau saturera »   (axe temps)
3. PERTES     → « où l'énergie disparaît »   (axe vérité)
2. WHAT-IF    → « ce qui répare »            (axe action)
1. TRAÇABILITÉ→ « comment c'est connecté »   (fondation)
```

## Constantes partagées (source de vérité)
Issues de la table `parametre` — **ne pas diverger** :
- `cos_phi = 0.90`
- `facteur_foisonnement = 0.60`
- `seuil_alerte = 0.80`  → classe `surcharge`
- `seuil_critique = 1.00` → classe `critique`

**Formule de charge** (identique au SQL `v_charge_transformateur`) :
```
charge_kva(transfo) = Σ(point_service.puiss_souscrite_kw) × facteur_foisonnement / cos_phi
taux_charge        = charge_kva / transfo.puissance_kva           (NULL si kVA NULL/0)
classe = taux ≥ 1.00 ? 'critique' : taux ≥ 0.80 ? 'surcharge' : 'normal'  (NULL → 'inconnu')
```

**Couleurs de classe** : depuis `web/src/theme/tokens.js` (`classeColorExpr` / palette).
Ne jamais coder une couleur en dur.

**Chaîne topologique** (FK déjà existantes) :
`poste` ─< `transformateur.poste_id` ─< `point_service.transfo_id` ; `ligne.transfo_id` → transfo.

**Ancrages réels** : `db/seed/real_anchors.json` (postes/centrales SOMELEC réels OSM).

---

## Chantier 1 — Traçabilité (FONDATION) · worktree `dt-trace`
**But** : cliquer un actif → illuminer tout l'aval + compteur « N clients affectés ».

**Backend** (`api/src/`)
- Nouveau module `topology.js`. Route **`GET /api/trace/:type/:id?direction=down|up`**.
  `type` ∈ {poste, transfo, ligne}. Réponse :
  ```json
  {
    "root": {"type":"poste","id":3,"code":"P-KSAR"},
    "affected": {"postes":[3],"transfos":[12,13],"lignes":[40,41],"points":[101,102]},
    "summary": {"clients":2,"charge_kva":318.5,"transfos":2,"lignes":2}
  }
  ```
  - `poste` aval = ses transfos (poste_id), leurs points, leurs lignes.
  - `transfo` aval = ses points + ses lignes ; amont = son poste.
- Migration additive **`db/migrations/004_topologie.sql`** seulement si un index/vue aide
  (ex. index sur `transformateur.poste_id`, `point_service.transfo_id`). Pas de changement cassant.
- **Enrichissement seed** : réécrire les `poste` à partir de `real_anchors.json` (coords/noms
  réels des sous-stations & centrales), garder transfos/points synthétiques accrochés.
  Conserver le TR-TRAP critique de test.

**Frontend** (`web/src/`)
- Nouveau dossier `trace/` : `useTrace.js` (fetch + état), `TracePanel.jsx` (compteur animé GSAP).
- `Inspector.jsx` : bouton **« Tracer l'impact »** → appelle la trace, passe les ids au highlight.
- `map/Map.jsx` : surbrillance des features affectés via **feature-state** `highlighted`
  (zone réservée — voir « hotspots » plus bas). Réutiliser les sources de tuiles existantes.

**Démo** : clic poste → arbre aval s'illumine, compteur monte « 3 847 clients affectés ».

---

## Chantier 2 — Bac à sable « what-if » · worktree `dt-whatif`
**But** : glisser un transfo / réaffecter des clients → recoloration `classe` en direct.

**Cœur pur** (`web/src/sim/load.js`) — **fonction testable, zéro I/O** :
```js
export const PARAMS = { cosPhi:0.90, foisonnement:0.60, seuilAlerte:0.80, seuilCritique:1.00 };
export function computeCharge(transfos, points, params=PARAMS) { /* renvoie Map<transfoId,{charge_kva,taux,classe}> */ }
export function classeFor(taux, params=PARAMS) { /* 'normal'|'surcharge'|'critique'|'inconnu' */ }
```
Test `node --test` associé (`web/src/sim/load.test.js`) : un cas par seuil + TR-TRAP.

**UI** (`web/src/whatif/`)
- Mode « bac à sable » activable depuis `LeftRail.jsx` (toggle dédié — voir hotspots).
- Actions : ajouter un transformateur (clic carte → saisir kVA), réaffecter des
  `point_service` au transfo sélectionné, bouton **Réinitialiser**.
- Les features modifiés sont rendus via une **source GeoJSON overlay** au-dessus des tuiles
  (ne pas muter les tuiles vectorielles). Recolore avec la même expression `classe`.
- État overlay uniquement, **aucune écriture DB**.

**Démo** : glisser un transfo près de TR-TRAP, réaffecter 30 clients → TR-TRAP rouge→vert.

---

## Chantier 3 — Pertes & prévision · worktree `dt-analytics`
**But** : couche « zones suspectes » (pertes) + curseur temporel (saturation future).

**Backend** (`api/src/analytics.js`)
- **`GET /api/pertes`** — pertes non techniques par inférence spatiale.
  `ecart = (attendu − déclaré) / attendu`, `attendu ≈ n_clients × médiane(puiss_souscrite réseau)`.
  Réponse `[{transfo_id, code, ecart_pct, suspicion:'low|med|high', mad_an_estime, lng, lat}]`.
  **Étiqueter heuristique** (pas une mesure).
- **`GET /api/prevision?horizon=<mois>&g=<taux_annuel>`** (`g` défaut 0.07).
  `taux(t) = taux₀ × (1+g)^(mois/12)` ; renvoie par transfo la `classe` projetée + une
  timeline `[{mois, n_critique, n_surcharge}]`.

**Frontend** (`web/src/analytics/`)
- `LossLayer` : couche carte « Pertes / zones suspectes » (cercles gradués ou heat),
  panneau top-suspects avec MAD/an estimé. Toggle dans `LeftRail.jsx` (voir hotspots).
- `ForecastSlider` : curseur 0–36 mois recolorant la carte par `classe` projetée +
  lecture « Mois X : N critiques ». Réutiliser couleurs de classe des tokens.

**Démo** : couche pertes → 3 zones rouges « ~4,2 M MAD/an à risque » ; curseur 2026→2028,
les transfos virent à l'ambre en franchissant 80 %.

---

## Hotspots de fusion (fichiers touchés par ≥2 chantiers)
Pour limiter les conflits de merge, **entourer chaque ajout de marqueurs commentés** et
**préférer de nouveaux fichiers**. L'orchestrateur fusionne ces trois fichiers à la main :

| Fichier | Chantiers | Règle |
|---|---|---|
| `api/src/api.js` | 1, 3 | Ajouter les routes dans un bloc `// --- <chantier> routes ---` en fin de fichier. |
| `web/src/map/Map.jsx` | 1, 2 | C1 = feature-state `highlighted` ; C2 = source overlay GeoJSON. Blocs séparés et nommés. |
| `web/src/shell/LeftRail.jsx` | 2, 3 | Chaque toggle dans sa propre section commentée ; ne pas réorganiser l'existant. |

Tout le reste = **nouveaux dossiers/fichiers** (`trace/`, `sim/`, `whatif/`, `analytics/`,
`topology.js`, `analytics.js`) → aucun conflit.

## Règles communes
- Français pour toute copie UI/commentaires utilisateur.
- Réutiliser `web/src/ui/` (Badge, Panel, Gauge, Table…) avant d'inventer.
- Pas de couleur en dur : tokens uniquement.
- Chaque changement de comportement ⇒ un test (`node --test` côté api, `web/src/**/**.test.js`).
- Migrations additives, non destructives.
