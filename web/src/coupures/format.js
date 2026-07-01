// Helpers de formatage & libellés FR partagés par les écrans « coupures ». Purs, sans I/O.

export const frInt = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(Math.round(Number(n))));
export const fr1 = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Number(n)));
export const fr2 = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n)));

export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// Durée en heures → « 2 h 05 » / « 45 min ».
export function fmtDuree(h) {
  if (h == null || !Number.isFinite(Number(h))) return '—';
  const totalMin = Math.round(Number(h) * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return hh > 0 ? `${hh} h ${String(mm).padStart(2, '0')}` : `${mm} min`;
}

// Énergie : kWh sous 1 MWh, sinon MWh.
export function fmtEnergie(kwh) {
  if (kwh == null) return '—';
  const v = Number(kwh);
  return v >= 1000 ? `${fr1(v / 1000)} MWh` : `${frInt(v)} kWh`;
}

export const TYPE_LABEL = { programmee: 'Programmée', incident: 'Incident' };
export const CAUSE_LABEL = {
  maintenance: 'Maintenance', delestage: 'Délestage', defaut: 'Défaut',
  intemperie: 'Intempérie', inconnu: 'Inconnu',
};
export const STATUT_LABEL = { planifiee: 'Planifiée', active: 'Active', resolue: 'Résolue' };
export const ACTIF_LABEL = { poste: 'Poste source', transfo: 'Transformateur', ligne: 'Ligne BT' };

export const TYPE_OPTIONS = [
  { value: 'incident', label: 'Incident (panne)' },
  { value: 'programmee', label: 'Coupure programmée' },
];
export const CAUSE_OPTIONS = Object.entries(CAUSE_LABEL).map(([value, label]) => ({ value, label }));

// Date → valeur d'un <input type="datetime-local"> (heure locale, sans secondes).
export function toLocalInput(date = new Date()) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
