# 0002 — Tuiles vectorielles via Express `ST_AsMVT` (PERN) plutôt que Martin/GeoServer

Status: Accepted

## Context
La carte MapLibre a besoin de tuiles vectorielles (MVT) portant `taux_charge` et `classe`
pour un rendu data-driven des transformateurs et lignes. La pile cible est PERN
(PostgreSQL/PostGIS · Express · React · Node).

## Problem
Comment servir des tuiles MVT sans complexifier inutilement le déploiement du pilote ?

## Options considered
- **A — Express + `ST_AsMVT()`** : une seule route Node génère les tuiles depuis PostGIS.
- **B — Martin** (serveur de tuiles en Rust) en service séparé.
- **C — GeoServer** (Java) en service séparé.

## Decision
Option A : la génération des tuiles se fait dans Express via `ST_AsMVT()`/`ST_AsMVTGeom()`,
dans le même service qui expose l'API JSON.

## Why
- Un seul service Node sert à la fois les tuiles et l'API : moins de pièces à déployer.
- Pas de runtime supplémentaire (ni Rust ni JVM) à packager et opérer.
- `ST_AsMVT` lit directement les vues de charge, donc les tuiles portent `classe`/`taux_charge`
  sans pipeline séparé.
- Martin/GeoServer apportent des fonctions (cache, styles avancés) non requises au pilote
  (YAGNI) et augmentent la surface d'exploitation.

## Consequences
- Pas de cache de tuiles natif : acceptable à l'échelle du pilote ; si nécessaire, ajouter
  un cache HTTP ou passer à Martin sans changer le schéma.
- La charge de génération repose sur Postgres ; les vues peuvent être matérialisées si lent.
- Les requêtes de tuiles sont paramétrées (z/x/y, layer en liste blanche) — pas d'injection SQL.
