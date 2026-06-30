# Diagrammes de séquence — flux clés

Les cinq parcours qui exercent le modèle de données. Acteurs : **Web** (React/MapLibre),
**API** (Express), **DB** (PostGIS).

## 1. Affichage de la carte — tuiles vectorielles (MVT)

```mermaid
sequenceDiagram
    actor U as Exploitant
    participant M as MapLibre (web)
    participant T as API /tiles (tiles.js)
    participant DB as PostGIS

    U->>M: pan / zoom
    loop chaque tuile visible
        M->>T: GET /tiles/{couche}/{z}/{x}/{y}.pbf
        Note over T: couche ∈ {transfo, ligne, poste,<br/>point_service, support} (whitelist)
        T->>DB: ST_AsMVT( ST_AsMVTGeom( ST_Transform(geom,3857) ) )<br/>sur la vue / table de la couche
        DB-->>T: tuile protobuf (gzip)
        T-->>M: 200 application/x-protobuf
    end
    M->>M: rendu · couleur = classe de charge (token)
```

## 2. Traçabilité — impact amont/aval d'un actif

```mermaid
sequenceDiagram
    actor U as Exploitant
    participant M as Carte / Inspecteur
    participant A as API /trace (topology.js)
    participant DB as PostGIS

    U->>M: clic sur un actif → « Tracer l'impact »
    M->>A: GET /api/trace/{type}/{id}?direction=down
    A->>DB: actif racine (poste_source / transformateur / ligne_bt)
    A->>DB: transfos concernés (alimentation_bt — multi-alimentation)
    A->>DB: compteurs en aval (compteur→local→branchement→poteau→alimentation_bt)
    A->>DB: lignes BT alimentées + Σ charge_kva (v_charge_transformateur)
    DB-->>A: ids + agrégats
    A-->>M: { root, affected:{postes,transfos,lignes,points}, summary:{clients,charge_kva,…} }
    M->>M: surbrillance des features (feature-state « highlighted »)
```

## 3. Tableau de bord — calcul de charge & surcharges

```mermaid
sequenceDiagram
    actor U as Exploitant
    participant D as Dashboard (web)
    participant A as API (api.js)
    participant V as Vue v_charge_transformateur
    participant DB as PostGIS

    U->>D: ouvre « Tableau de bord »
    par KPIs & graphes
        D->>A: GET /api/stats
        D->>A: GET /api/kpi
        D->>A: GET /api/histogramme
        D->>A: GET /api/alertes
    end
    A->>V: SELECT classe, charge_kva, taux_charge …
    V->>DB: Σ(puissance_demandee / n_alimentations) × foisonnement / cos_phi<br/>via alimentation_bt + chaîne · classe = f(taux, seuils)
    DB-->>V: lignes
    V-->>A: agrégats par classe
    A-->>D: JSON (counts, classes, santé %, charge totale)
    D->>U: KPIs + histogramme + alertes
```

## 4. Déclaration d'une coupure (ADR 0009)

```mermaid
sequenceDiagram
    actor U as Exploitant
    participant C as Cockpit coupures (web)
    participant A as API /coupures (coupures.js)
    participant TR as topology.trace()
    participant DB as PostGIS

    U->>C: déclare une coupure (actif, type, cause, début)
    C->>A: POST /api/coupures
    A->>TR: trace(actif_type, actif_id)  %% impact figé
    TR->>DB: clients & charge en aval (chaîne MCD)
    DB-->>TR: summary { clients, charge_kva }
    TR-->>A: snapshot
    A->>DB: INSERT coupure (clients_affectes, charge_kva, ens_kwh=…)
    DB-->>A: id_coupure
    A-->>C: 201 coupure créée
    U->>C: consulte /api/fiabilite (SAIDI / SAIFI / CAIDI / ENS)
    C->>A: GET /api/fiabilite
    A->>DB: agrégats sur le registre coupure
    A-->>C: indices de fiabilité
```

## 5. Simulation « what-if » (cœur pur, côté client)

```mermaid
sequenceDiagram
    actor U as Exploitant
    participant M as Carte (overlay what-if)
    participant W as useWhatIf (état overlay)
    participant S as sim/load.js (pur)

    U->>M: active le bac à sable
    U->>M: capture un transfo / ajoute un client (kVA / kW)
    M->>W: addTransfo / addPoint (ids préfixés, AUCUNE écriture DB)
    W->>S: computeCharge(transfos, points, params)
    Note over S: rejoue la formule SQL —<br/>charge = Σ kW × foisonnement / cos_phi · taux = charge / kVA
    S-->>W: Map<transfoId, {charge, taux, classe}>
    W->>M: recoloration en direct (GeoJSON overlay)
```
