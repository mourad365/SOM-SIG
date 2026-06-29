# 0005 — Jumeau numérique : traçabilité, simulation, pertes & prévision

Status: Accepted

## Context
Le pilote SOM-SIG affiche les actifs et leur classe de charge (heuristique statique,
ADR 0003) mais reste **descriptif** : une carte de points colorés. Les exploitants
SOMELEC ont besoin d'un outil **prescriptif** — savoir qui perd le courant si un poste
tombe, simuler un renforcement avant de le financer, repérer les pertes non techniques,
et anticiper où le réseau saturera. Aucune télémétrie SCADA/AMI n'est disponible
(contrainte ADR 0003) : l'intelligence doit venir du modèle, pas d'un flux temps réel.

## Problem
Comment transformer la carte descriptive en un **jumeau numérique** décisionnel, sans
télémétrie, sans casser le schéma à 7 tables ni l'heuristique existante, et de façon
livrable par incréments démontrables ?

## Options considered
- **A — Quatre couches d'intelligence sur le modèle existant** : (1) traçabilité
  amont/aval par jointures sur les FK existantes, (2) bac à sable « what-if » côté client
  réutilisant la formule de charge, (3) détection de pertes par inférence spatiale,
  (4) projection de demande sur l'axe temps. Aucune dépendance externe.
- **B — Moteur de load-flow (pandapower)** : précis mais exige des données réseau fines
  et une stack Python — rejeté en ADR 0003.
- **C — Attendre SCADA/AMI** : repousse toute valeur décisionnelle à une phase incertaine.

## Decision
Option A. Quatre couches construites sur le modèle et l'heuristique actuels :

1. **Traçabilité (fondation).** La chaîne `poste → transformateur (transfo.poste_id)
   → point_service (ps.transfo_id)` et l'attribution `ligne.transfo_id` existent déjà.
   Une vue/endpoint de trace agrège l'impact (clients, kVA, actifs) sans nouvelle
   topologie lourde. Migration additive `004_topologie.sql` si un index/vue aide.
2. **Simulation « what-if » (côté client, cœur pur).** Une fonction pure
   `computeCharge(transfos, points, params)` rejoue la formule SQL en JS ; le bac à sable
   superpose des modifications (ajout transfo, réaffectation clients) et recolore en direct.
   Aucune écriture DB.
3. **Pertes non techniques (inférence spatiale).** Comparaison charge déclarée vs attendue
   (densité clients × calibre) ; les écarts anormalement faibles = suspicion. Heuristique
   explicitement étiquetée, pas une mesure.
4. **Prévision de demande.** Projection `taux(t) = taux₀ × (1+g)^années` à partir de
   `date_mise_service` et d'un taux de croissance `g` paramétrable ; curseur temporel.

## Why
- **Zéro télémétrie** : cohérent avec ADR 0003 ; toute l'intelligence dérive du modèle.
- **Non destructif** : réutilise FK, vues et tokens existants ; migrations additives.
- **Démontrable par phase** : chaque couche a un « effet waouh » isolé et une valeur métier.
- **Cœur pur / coquille impérative** : la simulation est une fonction testable sans I/O.

## Consequences
- Pertes et prévision sont **heuristiques** (pas de mesure) — à étiqueter clairement en UI.
- La traçabilité reste au niveau poste→transfo→client (pas de départ/segment fin) ;
  suffisant au pilote, extensible plus tard (cf. ADR 0004 option B).
- Données réelles : les **postes/centrales réels** (OSM/Open Infrastructure Map, 225 kV)
  ancrent la géographie ; la distribution MT/BT reste synthétique (donnée SOMELEC privée).
- Le contrat d'intégration entre les quatre couches est figé dans `docs/DIGITAL-TWIN.md`.
