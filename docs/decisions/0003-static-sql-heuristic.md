# 0003 — Heuristique de charge en SQL statique plutôt qu'un calcul de répartition (pandapower)

Status: Accepted

## Context
L'objectif est de faire ressortir les transformateurs et lignes en surcharge. SOMELEC ne
dispose pas (au pilote) de télémétrie temps réel (SCADA/AMI). Il faut estimer la charge à
partir des puissances souscrites.

## Problem
Comment calculer un `taux_charge` exploitable sans données de mesure ni moteur de calcul
de répartition de charge ?

## Options considered
- **A — Heuristique statique en SQL** : `charge_kva = Σ(puiss_souscrite) × foisonnement / cos_phi`,
  puis `taux_charge = charge / capacité`, classée par seuils. Coefficients dans `parametre`.
- **B — Calcul de répartition (load-flow) via pandapower** sur la topologie complète.
- **C — Brancher SCADA/AMI** pour des charges mesurées en temps réel.

## Decision
Option A : des vues SQL (`v_charge_transformateur`, `v_charge_ligne`) calculent `taux_charge`
et `classe` à partir des puissances souscrites et de coefficients tunables.

## Why
- Aucune télémétrie requise : exploitable immédiatement avec les seules données du réseau.
- Logique centralisée dans des vues SQL : une seule source, lisible et testable.
- Les coefficients (`cos_phi`, `facteur_foisonnement`, seuils) sont éditables sans redéploiement.
- pandapower exige une topologie complète (nœuds/départs) hors périmètre du MCD simplifié ;
  SCADA exige une intégration matérielle absente au pilote.

## Consequences
- Estimation approximative (pas de flux de puissance réel) : suffisante pour cibler les
  renforcements, à affiner ensuite.
- Chemin d'évolution non destructif : remplacer l'heuristique par pandapower quand la
  topologie complète existera, ou ajouter une table `mesure` alimentée par SCADA/AMI —
  sans réécriture du schéma.
- Garde anti-division : `puissance_kva` NULL/0 → `taux_charge` NULL, classe `inconnu`.
