// Analytics — Jumeau numérique, Chantier 3 : pertes non techniques & prévision de demande.
//
// ⚠️ HEURISTIQUE, PAS UNE MESURE. Aucune télémétrie (SCADA/AMI) n'est disponible
// (cf. ADR 0003/0005). Toute « intelligence » ici dérive du modèle de données seul :
//   - les PERTES sont inférées en comparant la charge *déclarée* (somme des puissances
//     souscrites) à une charge *attendue* (densité de clients × calibre médian réseau).
//     Un écart anormalement positif = soupçon de pertes non techniques (sous-déclaration,
//     fraude, branchements informels). C'est un indicateur d'enquête, pas une preuve.
//   - la PRÉVISION projette le taux de charge actuel par croissance composée annuelle ;
//     elle n'utilise aucune donnée temporelle réelle de consommation.
// Ces limites sont rappelées explicitement dans l'UI (web/src/analytics/).

import { Router } from 'express';
import { query } from './db.js';

export const analyticsRouter = Router();

// --- Hypothèses tarifaires pour valoriser l'énergie « manquante » en MAD/an. -------
// Volontairement conservatrices et documentées ici (pas de couleur/constante en dur
// ailleurs). Tarif moyen BT Mauritanie ≈ 50 MAD/kWh ; facteur de charge ≈ 0,35
// (un compteur souscrit n'appelle pas sa puissance en continu).
const TARIF_MAD_PAR_KWH = 50;
const FACTEUR_CHARGE = 0.35;
const HEURES_PAR_AN = 8760;

// Seuils de suspicion sur l'écart relatif (déclaré vs attendu).
const SEUIL_SUSPICION_MED = 0.25; // ≥25 % d'écart → 'med'
const SEUIL_SUSPICION_HIGH = 0.45; // ≥45 % d'écart → 'high'

function suspicionDe(ecartPct) {
  if (ecartPct >= SEUIL_SUSPICION_HIGH) return 'high';
  if (ecartPct >= SEUIL_SUSPICION_MED) return 'med';
  return 'low';
}

// GET /api/pertes — pertes non techniques par inférence spatiale (HEURISTIQUE).
// Schéma MCD (ADR 0007) : « client » = local (bâtiment) rattaché au transfo via la chaîne
// transfo → ligne_bt → poteau → branchement → local ; « déclaré » = Σ puissance_demandee.
// attendu_kw ≈ n_locaux_du_transfo × médiane(puissance_demandee du réseau)
// ecart_pct  = (attendu − déclaré) / attendu        (positif = sous-déclaration suspecte)
// mad_an_estime = max(0, attendu − déclaré) kW × facteur_charge × heures/an × tarif
analyticsRouter.get('/pertes', async (_req, res) => {
  try {
    const { rows } = await query(
      `WITH med AS (
         SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY puissance_demandee) AS kw
         FROM "local"
         WHERE puissance_demandee IS NOT NULL
       ),
       par_transfo AS (
         SELECT t.transfo_id,
                t.code_actif AS code,
                COUNT(l.id_local)::int AS n_clients,
                COALESCE(SUM(l.puissance_demandee), 0)::numeric AS declare_kw,
                ST_X(ST_Transform(t.geom, 4326)) AS lng,
                ST_Y(ST_Transform(t.geom, 4326)) AS lat
         FROM v_charge_transformateur t
         LEFT JOIN ligne_bt b           ON b.id_transformateur = t.transfo_id
         LEFT JOIN poteau_electrique pe ON pe.id_ligne_bt = b.id_ligne_bt
         LEFT JOIN branchement br       ON br.id_poteau = pe.id_poteau
         LEFT JOIN "local" l            ON l.id_branchement = br.id_branchement
         GROUP BY t.transfo_id, t.code_actif, t.geom
       )
       SELECT pt.transfo_id, pt.code, pt.n_clients, pt.lng, pt.lat,
              (pt.n_clients * (SELECT kw FROM med))::numeric AS attendu_kw,
              pt.declare_kw,
              GREATEST(0, pt.n_clients * (SELECT kw FROM med) - pt.declare_kw)::numeric AS manquant_kw
       FROM par_transfo pt
       WHERE pt.n_clients > 0
       ORDER BY pt.transfo_id`);

    const out = rows.map((r) => {
      const attendu = Number(r.attendu_kw);
      const declare = Number(r.declare_kw);
      const manquant = Number(r.manquant_kw);
      // attendu>0 garanti par n_clients>0 et médiane>0 ; garde-fou défensif quand même.
      const ecartPct = attendu > 0 ? (attendu - declare) / attendu : 0;
      const madAn = Math.round(manquant * FACTEUR_CHARGE * HEURES_PAR_AN * TARIF_MAD_PAR_KWH);
      return {
        transfo_id: r.transfo_id,
        code: r.code,
        n_clients: r.n_clients,
        ecart_pct: Math.round(ecartPct * 1000) / 1000,
        suspicion: suspicionDe(ecartPct),
        mad_an_estime: madAn,
        lng: r.lng,
        lat: r.lat,
      };
    })
      // Du plus suspect au moins suspect : l'enquêteur voit les pires en tête.
      .sort((a, b) => b.ecart_pct - a.ecart_pct);

    res.json(out);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'pertes failed' });
  }
});

// --- Prévision de demande -----------------------------------------------------------
const HORIZON_MAX_MOIS = 36;
const G_MIN = 0;
const G_MAX = 0.5; // garde-fou : 50 %/an est déjà extrême.
const G_DEFAUT = 0.07;

// Projection composée du taux de charge : taux(t) = taux₀ × (1+g)^(mois/12).
// Pure (testée) — réutilisée par l'endpoint et par les tests.
export function projeterTaux(taux0, g, mois) {
  if (taux0 == null || !Number.isFinite(Number(taux0))) return null;
  return Number(taux0) * Math.pow(1 + g, mois / 12);
}

// Classe à partir d'un taux projeté (mêmes seuils que v_charge_transformateur :
// seuil_alerte=0.80 → surcharge, seuil_critique=1.00 → critique).
export function classePourTaux(taux, seuilAlerte = 0.8, seuilCritique = 1.0) {
  if (taux == null) return 'inconnu';
  if (taux >= seuilCritique) return 'critique';
  if (taux >= seuilAlerte) return 'surcharge';
  return 'normal';
}

function clampHorizon(v) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, HORIZON_MAX_MOIS);
}

function clampG(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return G_DEFAUT;
  return Math.min(Math.max(n, G_MIN), G_MAX);
}

// GET /api/prevision?horizon=<mois>&g=<taux_annuel> — saturation future (HEURISTIQUE).
// Renvoie : { horizon, g, taux_seuils, transfos:[{transfo_id,code,taux0,taux_projete,
//             classe_actuelle,classe_projetee,lng,lat}], timeline:[{mois,n_critique,n_surcharge}] }
analyticsRouter.get('/prevision', async (req, res) => {
  const horizon = clampHorizon(req.query.horizon);
  const g = clampG(req.query.g ?? G_DEFAUT);

  try {
    // taux₀ et les seuils viennent de la vue existante (source de vérité partagée).
    const [{ rows: transfos }, { rows: seuils }] = await Promise.all([
      query(
        `SELECT transfo_id, code_actif AS code, taux_charge AS taux0,
                ST_X(ST_Transform(geom, 4326)) AS lng,
                ST_Y(ST_Transform(geom, 4326)) AS lat
         FROM v_charge_transformateur
         WHERE taux_charge IS NOT NULL`),
      query(
        `SELECT
           (SELECT valeur FROM parametre WHERE cle='seuil_alerte')  AS seuil_alerte,
           (SELECT valeur FROM parametre WHERE cle='seuil_critique') AS seuil_critique`),
    ]);

    const seuilAlerte = Number(seuils[0]?.seuil_alerte ?? 0.8);
    const seuilCritique = Number(seuils[0]?.seuil_critique ?? 1.0);

    const projetes = transfos.map((t) => {
      const taux0 = Number(t.taux0);
      const tauxProjete = projeterTaux(taux0, g, horizon);
      return {
        transfo_id: t.transfo_id,
        code: t.code,
        taux0: Math.round(taux0 * 1000) / 1000,
        taux_projete: Math.round(tauxProjete * 1000) / 1000,
        classe_actuelle: classePourTaux(taux0, seuilAlerte, seuilCritique),
        classe_projetee: classePourTaux(tauxProjete, seuilAlerte, seuilCritique),
        lng: t.lng,
        lat: t.lat,
      };
    });

    // Timeline mensuelle : combien de critiques / surcharges à chaque mois jusqu'à l'horizon.
    const timeline = [];
    for (let mois = 0; mois <= horizon; mois++) {
      let nCritique = 0;
      let nSurcharge = 0;
      for (const t of transfos) {
        const cl = classePourTaux(projeterTaux(Number(t.taux0), g, mois), seuilAlerte, seuilCritique);
        if (cl === 'critique') nCritique++;
        else if (cl === 'surcharge') nSurcharge++;
      }
      timeline.push({ mois, n_critique: nCritique, n_surcharge: nSurcharge });
    }

    res.json({
      horizon,
      g,
      taux_seuils: { surcharge: seuilAlerte, critique: seuilCritique },
      transfos: projetes,
      timeline,
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'prevision failed' });
  }
});
