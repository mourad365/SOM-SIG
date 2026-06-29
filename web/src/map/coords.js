// Coordinate formatting + parsing for the map readout and coordinate search.
// Input is always WGS84 lng/lat (what MapLibre hands us). Outputs:
//   dd  — decimal degrees with English cardinals (N/S/E/W)
//   dms — degrees-minutes-seconds with English cardinals
//   utm — UTM zone (auto from longitude), easting/northing in metres
//   mgrs — Military Grid Reference System (built on UTM)
// Hand-rolled (Snyder formulas) so we add no projection dependency.

export const COORD_FORMATS = [
  { value: 'dd', label: 'Degrés décimaux' },
  { value: 'dms', label: 'Degrés-min-sec' },
  { value: 'utm', label: 'UTM' },
  { value: 'mgrs', label: 'MGRS' },
];

// ---- WGS84 ellipsoid constants ----
const A = 6378137.0;              // semi-major axis (m)
const F = 1 / 298.257223563;     // flattening
const K0 = 0.9996;               // UTM scale factor
const E2 = F * (2 - F);          // first eccentricity squared
const EP2 = E2 / (1 - E2);       // second eccentricity squared

// ---- Decimal degrees ----
export function formatDD(lng, lat, digits = 5) {
  const latC = lat >= 0 ? 'N' : 'S';
  const lngC = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}° ${latC}, ${Math.abs(lng).toFixed(digits)}° ${lngC}`;
}

// ---- Degrees / minutes / seconds ----
function toDMS(value, cardinals) {
  const card = value >= 0 ? cardinals[0] : cardinals[1];
  let v = Math.abs(value);
  const d = Math.floor(v);
  v = (v - d) * 60;
  const m = Math.floor(v);
  const s = (v - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"${card}`;
}

export function formatDMS(lng, lat) {
  return `${toDMS(lat, ['N', 'S'])} ${toDMS(lng, ['E', 'W'])}`;
}

// ---- UTM forward (WGS84 lat/lon -> zone, easting, northing) ----
export function toUTM(lng, lat) {
  const zone = Math.floor((lng + 180) / 6) + 1;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180; // central meridian (rad)
  const rlat = lat * Math.PI / 180;
  const rlon = lng * Math.PI / 180;

  const N = A / Math.sqrt(1 - E2 * Math.sin(rlat) ** 2);
  const T = Math.tan(rlat) ** 2;
  const C = EP2 * Math.cos(rlat) ** 2;
  const Acoef = Math.cos(rlat) * (rlon - lon0);
  const M = A * (
    (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256) * rlat
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 * E2 * E2 / 1024) * Math.sin(2 * rlat)
    + (15 * E2 * E2 / 256 + 45 * E2 * E2 * E2 / 1024) * Math.sin(4 * rlat)
    - (35 * E2 * E2 * E2 / 3072) * Math.sin(6 * rlat)
  );

  let easting = K0 * N * (
    Acoef + (1 - T + C) * Acoef ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Acoef ** 5 / 120
  ) + 500000;
  let northing = K0 * (M + N * Math.tan(rlat) * (
    Acoef * Acoef / 2 + (5 - T + 9 * C + 4 * C * C) * Acoef ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Acoef ** 6 / 720
  ));
  if (lat < 0) northing += 10000000;
  return { zone, hemisphere: lat >= 0 ? 'N' : 'S', easting, northing, lat };
}

export function formatUTM(lng, lat) {
  const u = toUTM(lng, lat);
  return `${u.zone}${u.hemisphere} ${Math.round(u.easting)}E ${Math.round(u.northing)}N`;
}

// ---- MGRS (faithful port of the classic mgrs forward algorithm) ----
const LETTER = { A: 65, I: 73, O: 79, V: 86, Z: 90 };
const SET_ORIGIN_COLUMN = 'AJSAJS';
const SET_ORIGIN_ROW = 'AFAFAF';

function get100kID(easting, northing, zone) {
  const set = ((zone - 1) % 6) + 1;
  const col = Math.floor(easting / 100000);
  const row = Math.floor(northing / 100000) % 20;
  return letter100k(col, row, set);
}

function letter100k(column, row, set) {
  const idx = set - 1;
  const colOrigin = SET_ORIGIN_COLUMN.charCodeAt(idx);
  const rowOrigin = SET_ORIGIN_ROW.charCodeAt(idx);

  let colInt = colOrigin + column - 1;
  let rowInt = rowOrigin + row;
  let rollover = false;

  if (colInt > LETTER.Z) { colInt = colInt - LETTER.Z + LETTER.A - 1; rollover = true; }
  if (colInt === LETTER.I || (colOrigin < LETTER.I && colInt > LETTER.I)
      || ((colInt > LETTER.I || colOrigin < LETTER.I) && rollover)) colInt++;
  if (colInt === LETTER.O || (colOrigin < LETTER.O && colInt > LETTER.O)
      || ((colInt > LETTER.O || colOrigin < LETTER.O) && rollover)) {
    colInt++;
    if (colInt === LETTER.I) colInt++;
  }
  if (colInt > LETTER.Z) colInt = colInt - LETTER.Z + LETTER.A - 1;

  rollover = false;
  if (rowInt > LETTER.V) { rowInt = rowInt - LETTER.V + LETTER.A - 1; rollover = true; }
  if (rowInt === LETTER.I || (rowOrigin < LETTER.I && rowInt > LETTER.I)
      || ((rowInt > LETTER.I || rowOrigin < LETTER.I) && rollover)) rowInt++;
  if (rowInt === LETTER.O || (rowOrigin < LETTER.O && rowInt > LETTER.O)
      || ((rowInt > LETTER.O || rowOrigin < LETTER.O) && rollover)) {
    rowInt++;
    if (rowInt === LETTER.I) rowInt++;
  }
  if (rowInt > LETTER.V) rowInt = rowInt - LETTER.V + LETTER.A - 1;

  return String.fromCharCode(colInt) + String.fromCharCode(rowInt);
}

// Latitude band letter (C..X, omitting I and O), 8° bands from 80°S.
function latBand(lat) {
  if (lat >= 84) return 'X';
  if (lat < -80) return 'C';
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  return bands[Math.floor((lat + 80) / 8)];
}

export function formatMGRS(lng, lat) {
  const u = toUTM(lng, lat);
  const band = latBand(lat);
  const sq = get100kID(u.easting, u.northing, u.zone);
  const e = String(Math.floor(u.easting % 100000)).padStart(5, '0');
  const n = String(Math.floor(((u.northing % 100000) + 100000) % 100000)).padStart(5, '0');
  return `${u.zone}${band} ${sq} ${e} ${n}`;
}

// ---- Dispatch ----
export function formatCoord(format, lng, lat) {
  if (lng == null || lat == null || Number.isNaN(lng) || Number.isNaN(lat)) return '—';
  switch (format) {
    case 'dms': return formatDMS(lng, lat);
    case 'utm': return formatUTM(lng, lat);
    case 'mgrs': return formatMGRS(lng, lat);
    default: return formatDD(lng, lat);
  }
}

// ---- Parse a free-text coordinate query into { lng, lat } (for search) ----
// Accepts: "18.09, -15.97" | "-15.97 18.09" (lon/lat or lat/lon, auto-detected)
//          | DMS like "18°05'24\"N 15°58'12\"W" | "N 18.09 W 15.97".
export function parseCoord(input) {
  if (!input) return null;
  const s = input.trim();

  // DMS / cardinal form: capture numbers with optional cardinal letters.
  const dms = parseDMSPair(s);
  if (dms) return dms;

  // Plain decimal pair.
  const nums = s.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let a = parseFloat(nums[0]);
  let b = parseFloat(nums[1]);
  // Decide which is lat (|lat| <= 90). Default order lat,lng.
  let lat, lng;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) { lat = a; lng = b; }
  else if (Math.abs(b) <= 90 && Math.abs(a) <= 180) { lat = b; lng = a; }
  else return null;
  if (!inRange(lat, lng)) return null;
  return { lat, lng };
}

function parseDMSPair(s) {
  // Two DMS tokens with cardinal letters. e.g. 18°05'24"N 15°58'12.5"W
  const re = /(\d+(?:\.\d+)?)[°:\s]+(?:(\d+(?:\.\d+)?)['′:\s]+)?(?:(\d+(?:\.\d+)?)["″]?)?\s*([NSEWnsew])/g;
  const found = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    const deg = parseFloat(m[1]);
    const min = m[2] ? parseFloat(m[2]) : 0;
    const sec = m[3] ? parseFloat(m[3]) : 0;
    let val = deg + min / 60 + sec / 3600;
    const card = m[4].toUpperCase();
    if (card === 'S' || card === 'W') val = -val;
    found.push({ val, card });
  }
  if (found.length < 2) return null;
  const latTok = found.find((t) => t.card === 'N' || t.card === 'S');
  const lngTok = found.find((t) => t.card === 'E' || t.card === 'W');
  if (!latTok || !lngTok) return null;
  if (!inRange(latTok.val, lngTok.val)) return null;
  return { lat: latTok.val, lng: lngTok.val };
}

function inRange(lat, lng) {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
