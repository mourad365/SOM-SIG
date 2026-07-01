BEGIN;

-- SIG SOMELEC — Registre des coupures & fiabilité (ADR 0009).
-- Table ADDITIVE : ne touche ni aux 12 tables MCD (ADR 0007) ni aux vues de charge.
-- Une coupure est un objet métier persistant — programmée (maintenance/délestage) ou
-- subie (panne) — dont l'IMPACT est FIGÉ à la déclaration (snapshot via topology.trace()).
-- Les indices SAIDI/SAIFI/CAIDI/ENS se calculent à la volée sur ce registre.

CREATE TABLE coupure (
  id_coupure        serial PRIMARY KEY,
  type              text NOT NULL CHECK (type IN ('programmee','incident')),
  statut            text NOT NULL CHECK (statut IN ('planifiee','active','resolue')),
  actif_type        text NOT NULL CHECK (actif_type IN ('poste','transfo','ligne')),
  actif_id          int  NOT NULL,
  code_actif        text,                         -- libellé figé (PS-/TR-/code BT) pour l'avis
  cause             text CHECK (cause IN ('maintenance','delestage','defaut','intemperie','inconnu')),
  debut             timestamptz NOT NULL,
  fin               timestamptz,                  -- NULL = en cours
  clients_affectes  int     NOT NULL DEFAULT 0,   -- snapshot trace().summary.clients
  charge_kva        numeric NOT NULL DEFAULT 0,   -- snapshot trace().summary.charge_kva
  ens_kwh           numeric NOT NULL DEFAULT 0,   -- charge_kva × cos_phi × durée_h (0 si en cours)
  source            text NOT NULL DEFAULT 'reel' CHECK (source IN ('reel','simule')),
  commentaire       text,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupure_fin_apres_debut CHECK (fin IS NULL OR fin >= debut)
);

-- Index pour le journal (filtres statut/type/source) et le cockpit (fenêtre temporelle).
CREATE INDEX coupure_statut_ix ON coupure (statut);
CREATE INDEX coupure_type_ix   ON coupure (type);
CREATE INDEX coupure_source_ix ON coupure (source);
CREATE INDEX coupure_debut_ix  ON coupure (debut);
CREATE INDEX coupure_actif_ix  ON coupure (actif_type, actif_id);

COMMIT;
