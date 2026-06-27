# 0004 — `ligne.transfo_id` nullable pour l'attribution de charge des lignes

Status: Accepted

## Context
Le MCD simplifié (7 tables) ne modélise pas la connectivité fine (nœuds, départs) qui
permettrait de tracer la charge le long du réseau. Il faut néanmoins estimer la charge des
lignes pour les colorer comme les transformateurs.

## Problem
Comment attribuer une charge à une ligne sans topologie complète, tout en restant
non destructif pour le schéma existant ?

## Options considered
- **A — Colonne `ligne.transfo_id` nullable**, FK → `transformateur` : la ligne hérite de la
  charge de l'équipement qu'elle alimente ; NULL → `inconnu`.
- **B — Topologie complète** (nœuds/départs) pour tracer la connectivité réelle.
- **C — Aucune charge de ligne** : ne styler que les transformateurs.

## Decision
Option A : ajouter `ligne.transfo_id` **nullable** avec FK vers `transformateur`. La vue
`v_charge_ligne` calcule `taux_charge` uniquement quand l'attribution existe.

## Why
- Non destructif : la colonne est nullable, aucune ligne existante ne casse.
- Permet une coloration utile des lignes au pilote sans topologie complète.
- L'état « non attribué » est explicite (`inconnu`, gris) plutôt que faussement « normal ».
- La topologie complète (option B) est hors périmètre ; l'absence de charge de ligne
  (option C) appauvrirait la carte sans raison.

## Consequences
- L'attribution est manuelle/approximative au pilote (une ligne → un transformateur).
- Les lignes NULL apparaissent en `inconnu` (gris) — signal clair de donnée manquante.
- Migration vers une vraie topologie possible plus tard sans casser la colonne existante.
