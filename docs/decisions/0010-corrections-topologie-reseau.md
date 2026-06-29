# 0010 — Corrections de topologie réseau (graphe MT/BT, multi-alimentation)

Status: Accepted

Affine le MCD d'ADR 0007 d'après les retours métier SOMELEC. Pragmatique (« noyau »
maintenant) ; deux raffinements explicitement différés (cf. Consequences).

## Context
Le modèle d'ADR 0007 traite le réseau comme un **arbre** strict source→client (chaque
relation 1,N). Le métier a corrigé plusieurs points : le réseau réel est un **graphe**.

1. Les **lignes MT ont des clients** (les usines achètent en MT, sans passer par un
   poste de distribution MT/BT).
2. Une **ligne BT peut être alimentée par plusieurs transformateurs** (selon la charge).
3. Les transformateurs existent dans **les deux sens** : MT/BT (abaisseur, distribution)
   et BT/MT (élévateur, injection/auto-production).
4. Un **poste alimente plusieurs rues / quartiers** (plusieurs locaux).
5. Les **supports portent des phases** (mono/triphasé) et plusieurs lignes y passent.

## Problem
Intégrer ces corrections sans casser le contrat de vues (ADR 0007), le jumeau numérique
(ADR 0005) ni le registre des coupures (ADR 0009), et de façon incrémentale.

## Decision
**Noyau pragmatique**, migration additive `006_topologie_corrections.sql` :

- **Sens du transformateur** : colonne `transformateur.sens` ∈ {'MT/BT','BT/MT'} (#3).
- **Phases du support** : colonne `poteau_electrique.phases` ∈ {'mono','tri'} (#5, attribut).
- **Client MT** : `branchement.id_ligne_mt` (nullable) — un branchement est BT (via un
  support) **ou** MT-direct (référence `ligne_mt`) ; `CHECK` qu'au moins l'un des deux
  rattachements existe. Les locaux industriels se raccordent ainsi en MT (#1).
- **Multi-alimentation BT** : table de jonction `alimentation_bt(id_ligne_bt,
  id_transformateur)` — N:N (#2). `ligne_bt.id_transformateur` est conservé comme
  **alimentation principale** (rétro-compat : `v_charge_ligne`, `/pertes`). La charge d'un
  transformateur **répartit à parts égales** la demande de chaque ligne BT entre ses
  alimentations (`puissance_demandee / nb_feeders`).
- **Poste → quartiers** : jonction `poste_quartier(id_poste_source, id_quartier)` — N:N (#4),
  dérivée de la chaîne au seed.

`v_charge_transformateur` est redéfinie (mêmes colonnes de sortie → aucun impact aval) pour
agréger la charge via `alimentation_bt` avec répartition égale ; le dimensionnement (seed
`020`) utilise la **même** formule pour rester cohérent. La traçabilité (`topology.js`)
parcourt désormais la jonction (toutes les alimentations d'une ligne, toutes les lignes d'un
transfo).

## Why
- **Fidèle au terrain** sans big-bang : N:N là où le métier l'exige, attributs simples ailleurs.
- **Contrat préservé** : colonnes de vues et formes d'API inchangées → carte, dashboard,
  twin et coupures continuent de fonctionner.
- **Répartition égale** : choix le plus simple et symétrique pour une charge bien définie
  sur les lignes multi-alimentées (pas de poids arbitraire au pilote).
- **Client MT hors charge distribution** : un client MT n'a pas de chemin
  `poteau→ligne_bt`, donc il n'alourdit pas un transfo de distribution — physiquement correct.

## Consequences
- **Différé** (raffinements non bloquants) : (a) une **entité `rue`** entre quartier et
  local — on se contente de `poste_quartier` ; (b) la **N:N support↔ligne** complète — un
  support reste rattaché à une `ligne_bt` principale (`id_ligne_bt`) plus les phases.
- La **charge des lignes MT** (clients industriels) n'est pas encore agrégée dans une vue
  dédiée ; les clients MT sont modélisés et semés, leur charge MT est un suivi ultérieur.
- L'UI ne surface pas encore `sens`/`phases`/multi-alimentation/clients MT (laissé au
  travail UI en cours) ; backend-only pour cette passe.
</content>
