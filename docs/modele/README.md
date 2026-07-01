# Modèle de données SIG SOMELEC — documentation

Documentation du modèle de données après les corrections de topologie (ADR 0007 + ADR 0010),
plus le registre des coupures (ADR 0009). Tous les diagrammes sont en **Mermaid** : ils se
rendent directement dans GitHub, GitLab et VS Code (extension *Markdown Preview Mermaid*).

## Sommaire

| Fichier | Contenu |
|---|---|
| [01-mcd.md](01-mcd.md) | **MCD** — Modèle Conceptuel de Données (MERISE) : entités, associations, cardinalités |
| [02-mld-mrd.md](02-mld-mrd.md) | **MLD / MRD** — Modèle Logique / Relationnel : tables, clés primaires & étrangères |
| [03-mpd.md](03-mpd.md) | **MPD** — Modèle Physique : types PostgreSQL/PostGIS, SRID, index, contraintes, vues |
| [04-diagrammes-sequence.md](04-diagrammes-sequence.md) | **Diagrammes de séquence** des flux clés (tuiles, traçabilité, charge, coupures, what-if) |
| [05-visualisations.md](05-visualisations.md) | **Visualisations recommandées** : architecture, graphe réseau, états des coupures, lignée des données |

## Source de vérité

Le modèle est défini par le code (le présent document le **décrit**, il ne le remplace pas) :

- Schéma : [`db/migrations/001_schema.sql`](../../db/migrations/001_schema.sql)
- Référence/paramètres : [`db/migrations/002_reference.sql`](../../db/migrations/002_reference.sql)
- Vues de charge : [`db/migrations/003_views.sql`](../../db/migrations/003_views.sql)
- Index traçabilité : [`db/migrations/004_topologie.sql`](../../db/migrations/004_topologie.sql)
- Coupures (ADR 0009) : [`db/migrations/005_coupures.sql`](../../db/migrations/005_coupures.sql)
- Corrections topologie (ADR 0010) : [`db/migrations/006_topologie_corrections.sql`](../../db/migrations/006_topologie_corrections.sql)

## Décisions d'architecture liées

- **ADR 0007** — modèle MERISE source→client + données réelles (hybride réel/synthétique)
- **ADR 0009** — registre des coupures & cockpit fiabilité
- **ADR 0010** — corrections de topologie (graphe MT/BT, multi-alimentation, clients MT)

## Convention réel / synthétique

Le jeu de données est **hybride** : la géométrie (lignes BT, poteaux, parcelles) vient du
terrain (`Données.zip`) ; le réseau MT, les transformateurs et la couche commerciale sont
**synthétisés** de façon déterministe. Voir [05-visualisations.md](05-visualisations.md#lignée-des-données).
