# Connecter QGIS au SIG SOMELEC

## Connexion PostGIS
Couche → Ajouter une couche PostGIS → Nouvelle connexion :
- Hôte : `localhost` (ou IP du serveur) · Port : `5432`
- Base : `sig_somelec` · Utilisateur : `somelec`
- SSL : selon déploiement

> Note déploiement : dans cet environnement Docker, le port hôte publié est `5433`
> (un PostgreSQL natif occupe déjà `5432`). Utilisez alors `localhost:5433`.
> Le port `5432` reste valide sur un hôte où il est libre.

## Couches
- **Édition** : `poste`, `transformateur`, `ligne`, `support`, `point_service`, `abonne`
  (tables éditables nativement — modifications visibles côté web après rafraîchissement des vues).
- **Lecture seule (analyse)** : `v_charge_transformateur`, `v_charge_ligne`
  (taux_charge + classe). Styler par `classe` avec les mêmes couleurs que le web :
  normal `#1a9641`, surcharge `#fdae61`, critique `#d7191c`, inconnu `#9e9e9e`.

## SRID
Toutes les géométries sont en **EPSG:32628** (UTM 28N). QGIS le détecte automatiquement.

## Astuce
Pour une carto web identique au projet QGIS, publier le `.qgz` via **QGIS Server** (WMS)
et l'ajouter comme couche raster dans MapLibre. Optionnel — non requis pour le pilote.
