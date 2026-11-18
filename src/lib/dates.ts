// El negocio opera en Argentina. Los servidores (Vercel) corren en UTC, así que
// calcular "hoy" con new Date().toISOString() da el día siguiente después de las 21 h.
const TZ = 'America/Argentina/Buenos_Aires';

/** Fecha de hoy en Argentina, formato YYYY-MM-DD. */
export const todayInArgentina = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** Año y mes (1-12) actuales en Argentina. */
export const currentYearMonthAR = (): { year: number; month: number } => {
  const [year, month] = todayInArgentina().split('-').map(Number);
  return { year, month };
};

/** Primer instante del mes actual en Argentina, en ISO (UTC-3 fijo: sin horario de verano). */
export const startOfMonthISOAR = (): string => {
  const { year, month } = currentYearMonthAR();
  return `${year}-${String(month).padStart(2, '0')}-01T00:00:00-03:00`;
};

/** Suma (o resta) días a una fecha YYYY-MM-DD, sin depender del huso del servidor. */
export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** true si el texto es una fecha YYYY-MM-DD real. */
export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** "miércoles, 30 de septiembre" para una fecha YYYY-MM-DD, con la primera letra en mayúscula. */
export const formatDateAR = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string => {
  const text = new Date(`${date}T12:00:00-03:00`).toLocaleDateString('es-AR', { ...opts, timeZone: TZ });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** "miércoles, 30 de septiembre" con solo la primera letra en mayúscula. */
export const longDateAR = (opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string => {
  const text = new Date().toLocaleDateString('es-AR', { ...opts, timeZone: TZ });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
