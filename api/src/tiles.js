import { Router } from 'express';
import { query } from './db.js';

// Whitelisted layers -> source relation (view or base table) + exposed columns.
// `geomCol` defaults to 'geom'; any whitelisted point/line relation works the same way.
// Schéma MCD (ADR 0007) adossé au vocabulaire de tuiles hérité via alias, pour que le
// code carte (Map.jsx/style.js) reste inchangé : la clé de couche est le contrat.
const LAYERS = {
  transfo:       { rel: 'v_charge_transformateur', cols: 'transfo_id, code_actif, taux_charge, classe, puissance_kva, niveau_tension, date_mise_service::text AS date_mise_service' },
  ligne:         { rel: 'v_charge_ligne',          cols: 'ligne_id, code_actif, taux_charge, classe, niveau_tension, section_mm2, date_mise_service::text AS date_mise_service' },
  poste:         { rel: 'poste_source',            cols: "id_poste_source AS poste_id, ('PS-' || id_poste_source) AS code_poste, nom_poste AS nom, 'source' AS type_poste, statut, date_mise_service::text AS date_mise_service" },
  point_service: { rel: 'compteur',                cols: 'id_compteur AS point_id, numero_compteur AS num_compteur, statut, type_compteur, date_installation::text AS date_mise_service' },
  support:       { rel: 'poteau_electrique',       cols: 'id_poteau AS support_id, code_poteau AS code_actif, type_poteau AS type_support, etat' },
};

export const tilesRouter = Router();

tilesRouter.get('/:layer/:z/:x/:y.pbf', async (req, res) => {
  const layer = LAYERS[req.params.layer];
  if (!layer) return res.status(400).json({ error: 'unknown layer' });
  const geomCol = layer.geomCol || 'geom';

  const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
  if (![z, x, y].every(Number.isInteger)) return res.status(400).json({ error: 'bad tile coords' });

  // Reproject 32628 -> 3857 web-mercator tile envelope; cols/rel come only from the
  // server-side whitelist above (never user input), tile coords + layer name are bound.
  const sql = `
    WITH bounds AS (SELECT ST_TileEnvelope($1,$2,$3) AS env),
    mvt AS (
      SELECT ${layer.cols},
             ST_AsMVTGeom(ST_Transform(t.${geomCol}, 3857), bounds.env, 4096, 64, true) AS geom
      FROM ${layer.rel} t, bounds
      WHERE t.${geomCol} IS NOT NULL
        AND ST_Intersects(ST_Transform(t.${geomCol}, 3857), bounds.env)
    )
    SELECT ST_AsMVT(mvt, $4, 4096, 'geom') AS tile FROM mvt WHERE geom IS NOT NULL;`;
  try {
    const { rows } = await query(sql, [z, x, y, req.params.layer]);
    const tile = rows[0] && rows[0].tile;
    if (!tile || tile.length === 0) return res.status(204).end();
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.send(tile);
  } catch (err) {
    console.error('tile error', err);
    res.status(500).json({ error: 'tile generation failed' });
  }
});
