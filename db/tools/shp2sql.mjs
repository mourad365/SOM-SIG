// Génère db/seed/010_real_geometry.sql à partir des shapefiles terrain (Données.zip).
// Sans dépendance externe : parse .shp + .dbf en binaire et émet du SQL avec
// ST_Transform(...,32628). Le CRS source est détecté par magnitude des coordonnées
// (degrés vs UTM-28N à easting>0 vs UTM-29N mal étiqueté à easting<0). Cf. ADR 0007.
//
// Usage : node db/tools/shp2sql.mjs <dossier_Données> > db/seed/010_real_geometry.sql
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: shp2sql.mjs <dir>'); process.exit(1); }

// ---- DBF (toutes les lignes) -------------------------------------------------
function readDBF(buf) {
  const numRecords = buf.readUInt32LE(4);
  const headerSize = buf.readUInt16LE(8);
  const recordSize = buf.readUInt16LE(10);
  const fields = [];
  let off = 32;
  while (buf[off] !== 0x0d) {
    fields.push({
      name: buf.toString('ascii', off, off + 11).replace(/\0.*$/, ''),
      type: String.fromCharCode(buf[off + 11]),
      len: buf[off + 16],
    });
    off += 32;
  }
  const rows = [];
  for (let r = 0; r < numRecords; r++) {
    let p = headerSize + r * recordSize + 1; // +1 : drapeau de suppression
    const rec = {};
    for (const f of fields) { rec[f.name] = buf.toString('latin1', p, p + f.len).trim(); p += f.len; }
    rows.push(rec);
  }
  return { fields, rows };
}

// ---- SHP (géométries) --------------------------------------------------------
function readSHP(buf) {
  const fileLen = buf.readInt32BE(24) * 2; // mots de 16 bits → octets
  const shapes = [];
  let off = 100;
  while (off < fileLen) {
    const contentLen = buf.readInt32BE(off + 4) * 2;
    const recStart = off + 8;
    const type = buf.readInt32LE(recStart);
    if (type === 1) { // Point
      shapes.push({ type: 'point', x: buf.readDoubleLE(recStart + 4), y: buf.readDoubleLE(recStart + 12) });
    } else if (type === 3 || type === 5) { // PolyLine / Polygon
      const numParts = buf.readInt32LE(recStart + 36);
      const numPoints = buf.readInt32LE(recStart + 40);
      let q = recStart + 44;
      const parts = [];
      for (let i = 0; i < numParts; i++) { parts.push(buf.readInt32LE(q)); q += 4; }
      const pts = [];
      for (let i = 0; i < numPoints; i++) { pts.push([buf.readDoubleLE(q), buf.readDoubleLE(q + 8)]); q += 16; }
      const rings = [];
      for (let i = 0; i < numParts; i++) {
        rings.push(pts.slice(parts[i], i + 1 < numParts ? parts[i + 1] : numPoints));
      }
      shapes.push({ type: type === 3 ? 'line' : 'polygon', rings });
    } else {
      shapes.push({ type: 'null' });
    }
    off = recStart + contentLen;
  }
  return shapes;
}

// CRS source par magnitude des coordonnées (robuste pour ce jeu de données).
function detectSrid(x, y) {
  if (Math.abs(x) <= 400 && Math.abs(y) <= 100) return 4326;  // degrés
  if (x < 0) return 32629;                                     // UTM-29N (easting négatif)
  return 32628;                                                // UTM-28N (parcelles)
}
const fmt = (n, srid) => srid === 4326 ? n.toFixed(7) : n.toFixed(2);

function ringWKT(ring, srid, close) {
  const pts = ring.map(([x, y]) => `${fmt(x, srid)} ${fmt(y, srid)}`);
  if (close && pts.length && pts[0] !== pts[pts.length - 1]) pts.push(pts[0]);
  return `(${pts.join(',')})`;
}

function layerSrid(shapes) {
  for (const s of shapes) {
    if (s.type === 'point') return detectSrid(s.x, s.y);
    if ((s.type === 'line' || s.type === 'polygon') && s.rings[0]?.length) {
      return detectSrid(s.rings[0][0][0], s.rings[0][0][1]);
    }
  }
  return 4326;
}

const base = (f) => path.join(dir, f);
const load = (name) => ({
  shp: readSHP(fs.readFileSync(base(name + '.shp'))),
  dbf: fs.existsSync(base(name + '.dbf')) ? readDBF(fs.readFileSync(base(name + '.dbf'))) : { rows: [] },
});

// Émission par lots pour limiter la taille des INSERT.
function emitBatched(rowsSql, prefix) {
  const CHUNK = 400;
  for (let i = 0; i < rowsSql.length; i += CHUNK) {
    const slice = rowsSql.slice(i, i + CHUNK);
    process.stdout.write(prefix + '\n' + slice.join(',\n') + ';\n');
  }
}

const out = process.stdout;
out.write('-- GÉNÉRÉ par db/tools/shp2sql.mjs depuis Données.zip — NE PAS éditer à la main.\n');
out.write('-- Géométries terrain réelles (ADR 0007), reprojetées en EPSG:32628.\n');
out.write('BEGIN;\n\n');

// ===== LIGNE_BT (Ligne1–4) — géométrie réelle, FK transfo câblée en 020 =====
out.write('-- ===== Lignes BT/EC réelles =====\n');
{
  const files = ['Ligne1', 'Ligne2', 'Ligne3', 'Ligne4'];
  const rowsSql = [];
  for (const f of files) {
    const { shp, dbf } = load(f);
    const srid = layerSrid(shp);
    const defType = /ecl/i.test(f) ? 'EC' : 'BT';
    let n = 0;
    for (let i = 0; i < shp.length; i++) {
      const s = shp[i];
      if (s.type !== 'line') continue;
      n++;
      const d = dbf.rows[i] || {};
      const t = (d.Type || d.type || '').trim() || defType;
      const wkt = s.rings.length > 1
        ? `MULTILINESTRING(${s.rings.map((r) => ringWKT(r, srid, false)).join(',')})`
        : `LINESTRING${ringWKT(s.rings[0], srid, false)}`;
      const code = `LBT-${f.replace(/[^0-9]/g, '')}-${String(n).padStart(4, '0')}`;
      rowsSql.push(`  ('${code}', '${t}', ST_Multi(ST_Transform(ST_GeomFromText('${wkt}', ${srid}), 32628)))`);
    }
  }
  // ligne_bt.geom est MultiLineString (cf. schéma) → ST_Multi enveloppe les mono-parties.
  emitBatched(rowsSql, 'INSERT INTO ligne_bt (code_ligne_bt, type_ligne, geom) VALUES');
  out.write('\n');
}

// ===== POTEAU_ELECTRIQUE (Poteaux1–3, Poteaux_ecl1–2) — réel =====
out.write('-- ===== Poteaux réels =====\n');
{
  const files = ['Poteaux1', 'Poteaux2', 'Poteaux3', 'Poteaux_ecl', 'Poteaux_ecl2'];
  const rowsSql = [];
  for (const f of files) {
    const { shp, dbf } = load(f);
    const srid = layerSrid(shp);
    const defType = /ecl/i.test(f) ? 'EC' : 'BT';
    let n = 0;
    for (let i = 0; i < shp.length; i++) {
      const s = shp[i];
      if (s.type !== 'point') continue;
      n++;
      const d = dbf.rows[i] || {};
      const t = (d.Type || d.type || '').trim() || defType;
      const h = parseFloat((d.Hauteur || d.hauteur || '').replace(',', '.'));
      const haut = Number.isFinite(h) && h > 0 && h < 50 ? h : 'NULL';
      const code = `POT-${f.replace(/[^0-9A-Za-z]/g, '')}-${String(n).padStart(4, '0')}`;
      rowsSql.push(`  ('${code}', '${t}', ${haut}, ST_Transform(ST_GeomFromText('POINT(${fmt(s.x, srid)} ${fmt(s.y, srid)})', ${srid}), 32628))`);
    }
  }
  emitBatched(rowsSql, 'INSERT INTO poteau_electrique (code_poteau, type_poteau, hauteur_m, geom) VALUES');
  out.write('\n');
}

// ===== Parcelles cadastrales → table de transit (quartier/local construits en 020) =====
out.write('-- ===== Parcelles cadastrales (Plan de la zone) → transit =====\n');
out.write(`CREATE TABLE stg_parcelle (
  lot text, ilot text, lotissement text, geom geometry(MultiPolygon, 32628)
);\n`);
{
  const { shp, dbf } = load('Plan de la zone');
  const srid = layerSrid(shp);
  const rowsSql = [];
  for (let i = 0; i < shp.length; i++) {
    const s = shp[i];
    if (s.type !== 'polygon' || !s.rings.length) continue;
    const d = dbf.rows[i] || {};
    const esc = (v) => `'${String(v || '').replace(/'/g, "''").slice(0, 90)}'`;
    // Chaque anneau traité comme polygone simple (lots cadastraux mono-anneau) ;
    // ST_MakeValid + ST_CollectionExtract corrigent les rares cas dégénérés.
    const wkt = `MULTIPOLYGON(${s.rings.map((r) => `(${ringWKT(r, srid, true)})`).join(',')})`;
    rowsSql.push(`  (${esc(d.LOT)}, ${esc(d.ILOT)}, ${esc(d.LOTISSEMEN || d.LOTISSEMENT)}, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_GeomFromText('${wkt}', ${srid}), 32628)), 3)))`);
  }
  emitBatched(rowsSql, 'INSERT INTO stg_parcelle (lot, ilot, lotissement, geom) VALUES');
  out.write('\n');
}

out.write('COMMIT;\n');
