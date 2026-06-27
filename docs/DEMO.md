# Démo — Jumeau numérique du réseau SOMELEC (pilote Nouakchott)

> Scénario de présentation (~6 min) pour décideurs SOMELEC / bailleurs. Chaque acte
> a un **effet visuel** et une **valeur métier** chiffrée. Toutes les données réseau de
> distribution sont synthétiques ; les **postes et centrales sont réels** (OSM /
> Open Infrastructure Map). L'intelligence ne nécessite aucune télémétrie (cf. ADR 0003/0005).

## Mise en contexte (30 s)
« Voici le réseau électrique de Nouakchott. Les centrales et postes que vous voyez sont
**réels** — Centrale Hybride 180 MW, Arafat 37 MW, Wharf 36 MW, les centrales solaires de
Toujounine et Sheikh Zayed, le parc éolien. Aujourd'hui SOMELEC a une carte. Nous allons
la transformer en **outil de décision**. »

---

## Acte 1 — Traçabilité : « qui perd le courant ? » (1 min)
**Geste** : cliquer un poste → l'arbre aval s'illumine, le compteur monte :
**« 3 847 clients affectés · 2 ainsi transformateurs · 318 kVA »**.

**Discours** : « En un clic, on sait exactement qui dépend de cet ouvrage. Pour une coupure
programmée, une panne ou une maintenance, on identifie l'impact client **avant** d'agir —
plus besoin de croiser des plans papier. »

**Valeur** : planification des coupures, réponse aux pannes, communication client ciblée.

---

## Acte 2 — Bac à sable « what-if » : « qu'est-ce qui répare ? » (1 min 30)
**Geste** : le transformateur **TR-TRAP** est en rouge (surcharge 146 %). Activer le bac à
sable → glisser un nouveau transformateur à côté → réaffecter ~30 clients →
**TR-TRAP passe rouge → vert en direct**.

**Discours** : « On simule un renforcement **avant de dépenser un ouguiya**. On voit
immédiatement l'effet sur la charge. C'est le dimensionnement d'investissement, sur la carte,
en temps réel — sans toucher à la base de production. »

**Valeur** : aide au CAPEX, dimensionnement/positionnement d'ouvrage, scénarios « et si ».

---

## Acte 3 — Pertes non techniques : « où l'énergie disparaît ? » (1 min 30)
**Geste** : activer la couche **« Zones suspectes »** → 3 zones rouges apparaissent, étiquetées
**« ~4,2 M MAD/an à risque »**. Ouvrir le panneau top-suspects.

**Discours** : « Sans compteur intelligent, on **infère** les pertes : là où la consommation
déclarée est anormalement faible pour la densité de clients et le calibre du poste, il y a un
signal — fraude ou perte technique. Pour une compagnie africaine, les pertes non techniques
pèsent 20–40 % de l'énergie. Cette couche **oriente les tournées d'inspection** vers les zones
qui rapportent. » *(Heuristique assumée, à confirmer terrain.)*

**Valeur** : récupération de recettes — **c'est la couche qui rentabilise le système**.

---

## Acte 4 — Prévision : « où ça saturera ? » (1 min)
**Geste** : tirer le **curseur temporel** de 2026 → 2028. Des transformateurs virent
progressivement à l'ambre puis au rouge en franchissant 80 % puis 100 %. Lecture :
**« Mois 18 : 11 transformateurs critiques »**.

**Discours** : « À croissance de demande constante (~7 %/an), voici **où et quand** le réseau
cassera. C'est le plan d'investissement triennal — sur une carte, priorisé par échéance. »

**Valeur** : planification pluriannuelle, priorisation du budget de renforcement.

---

## Clôture (30 s)
« Quatre couches — tracer, simuler, détecter, anticiper — toutes construites **sans SCADA ni
compteurs intelligents**, à partir du seul modèle réseau. Quand SOMELEC ajoutera de la mesure,
le jumeau s'affine ; mais la valeur décisionnelle est **déjà là, aujourd'hui**. »

---

## Aide-mémoire technique (pour l'opérateur de la démo)
| Acte | Déclencheur | Endpoint / module |
|---|---|---|
| 1 Traçabilité | clic poste → « Tracer l'impact » | `GET /api/trace/poste/:id?direction=down` |
| 2 What-if | LeftRail → bac à sable | `web/src/sim/load.js` (client, 0 écriture DB) |
| 3 Pertes | LeftRail → « Zones suspectes » | `GET /api/pertes` |
| 4 Prévision | curseur temporel | `GET /api/prevision?horizon=24&g=0.07` |

Pré-requis : `docker compose up -d db`, seed enrichi appliqué, `cd api && npm start`,
`cd web && npm run dev`. Vérifier `som-sig-db-1` *healthy* sur le port 5433.
