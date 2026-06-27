# 0001 — PostGIS comme source de vérité unique, QGIS comme éditeur

Status: Accepted

## Context
SOMELEC dispose d'une équipe SIG qui édite le réseau électrique sous QGIS. Le projet
ajoute un client web (carte + tableau de bord) sur les mêmes données. Il faut une seule
représentation faisant autorité du réseau, partagée par les deux clients.

## Problem
Où stocker le réseau et comment éviter une divergence entre l'édition QGIS et la lecture web ?

## Options considered
- **A — PostGIS comme base unique**, éditée par QGIS et lue par le web.
- **B — Base applicative séparée** (ex. exports/imports périodiques depuis QGIS).
- **C — Stockage fichier** (Shapefile/GeoPackage) versionné, sans SGBD.

## Decision
Option A : une base **PostgreSQL/PostGIS** unique. QGIS édite nativement les tables ;
le web lit les mêmes tables et les vues de charge.

## Why
- Une seule source de vérité : aucune synchronisation ni risque de divergence.
- QGIS édite PostGIS nativement (transactions, verrouillage, index spatial GIST).
- PostGIS fournit l'index spatial et les fonctions (`ST_AsMVT`, `ST_Transform`) dont
  dépendent les tuiles et les vues de charge.
- Les fichiers (option C) ne supportent ni l'accès concurrent ni les vues SQL.

## Consequences
- PostGIS devient une dépendance obligatoire (déjà imposée par les tuiles et QGIS).
- Les modifications QGIS sont visibles côté web après rafraîchissement (vues non
  matérialisées au pilote).
- L'authentification/les rôles multi-utilisateurs restent hors périmètre (futur).
