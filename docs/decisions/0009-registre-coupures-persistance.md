# 0009 — Registre des coupures : persistance opérationnelle & indices de fiabilité

Status: Accepted

## Context
Le jumeau numérique (ADR 0005) sait tracer l'impact d'un actif et simuler la charge, mais
tout est **lecture seule** : le bac à sable what-if est explicitement « zéro écriture DB ».
Or l'exploitation SOMELEC a besoin de gérer des **coupures** — programmées (maintenance,
délestage) et subies (pannes) — comme des objets métier persistants : planifier une coupure
avec sa liste de clients, suivre un rétablissement dans le temps, et produire les **indices
de fiabilité** (SAIDI/SAIFI/CAIDI/ENS) qui mesurent une compagnie de distribution. Ces
indices n'ont de sens que **cumulés sur une période** : ils exigent un historique persistant.

## Problem
Comment doter le pilote d'un registre de coupures et d'un cockpit de fiabilité — sans
télémétrie (ADR 0003/0005), sans casser le modèle MCD (ADR 0007), et alors que les
fonctionnalités existantes n'écrivent jamais en base ?

## Options considered
- **A — Table additive `coupure` persistée en PostGIS**, impact figé à la déclaration
  (snapshot via `trace()`), indices calculés à la volée, historique de démonstration seedé
  et étiqueté `source='simule'`. Écritures DB assumées (POST/PATCH).
- **B — Registre côté client (overlay/session)**, comme le what-if. Rejeté : les indices
  exigent un cumul persistant ; un registre qui s'évapore au rechargement n'a aucune valeur
  d'exploitation, et l'Avis de coupure ne serait pas reproductible.
- **C — Attendre un SI exploitation/GMAO dédié.** Rejeté : repousse toute la valeur ;
  le modèle réseau existant suffit déjà à produire impact et indices.

## Decision
Option A. Un enregistrement unifié `coupure` (programmée *ou* incident, distingués par
`type` et un `fin` nullable), avec :

1. **Snapshot de l'impact.** `clients_affectes`, `charge_kva`, `ens_kwh` sont figés à la
   déclaration depuis `trace()`. Le réseau peut évoluer ; la coupure conserve son impact
   d'origine → Avis reproductible, indices stables.
2. **Indices calculés à la volée** sur le registre (`GET /api/fiabilite`) : SAIDI, SAIFI,
   CAIDI, ENS, avec `ENS = Σ charge_kva × cos_phi × durée_h` (cos_phi depuis `parametre`).
3. **Programmées rapportées séparément des incidents** dans les indices (convention métier).
4. **Colonne `source` (`reel`|`simule`)** : un historique déterministe seedé alimente le
   cockpit dès le jour 1, toujours étiqueté « dont N simulés » et filtrable. Même posture que
   « ancrages réels + distribution synthétique » (ADR 0005/0007).

## Why
- **Persistance indispensable** : sans cumul, pas d'indices ni de suivi de rétablissement.
- **Non destructif** : table *additive* ; aucune modification des 12 tables MCD ni des vues.
- **Réutilise l'existant** : impact via `trace()` (ADR 0005), constantes via `parametre`,
  couleurs via les tokens — aucune logique d'impact dupliquée.
- **Honnête** : le synthétique est étiqueté `simule` et séparable du réel, jamais maquillé.
- **Rupture délibérée** avec le « no-write » du what-if : un registre opérationnel *doit*
  écrire ; le what-if reste, lui, sans écriture (natures différentes, pas de contradiction).

## Consequences
- Le pilote écrit désormais en base (POST/PATCH `coupure`). Pas d'authentification/rôles à
  ce stade (le reste de l'app n'en a pas) — à prévoir avant un déploiement multi-utilisateurs.
- SAIDI/SAIFI/CAIDI/ENS dépendent de la qualité de saisie des coupures et de l'historique
  `simule` pour la démo ; les valeurs réelles se construisent à l'usage.
- `N = count(compteur)` sert de dénominateur clients (cohérent avec l'impact de `trace()`).
- Migration `005_coupures.sql` + seed `030_coupures_historique.sql` (image db, préfixe
  `zzz-030`, après `zzz-020_synthese`). Détail d'implémentation :
  `docs/superpowers/specs/2026-06-29-gestion-coupures-fiabilite-design.md`.
