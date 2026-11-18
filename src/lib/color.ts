/**
 * Colores accesibles para los niveles de cliente. El color de cada nivel lo elige marketing
 * (cualquier hex), así que el texto que se dibuja sobre él, o con él, tiene que calcularse.
 */
const parseHex = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** Relación de contraste WCAG entre dos colores hex (1 a 21). */
export const contrastRatio = (a: string, b: string): number => {
  const ca = parseHex(a), cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Blanco u oscuro, el que mejor se lee sobre un fondo del color indicado. */
export const readableTextOn = (bg: string): '#FFFFFF' | '#1F2937' =>
  contrastRatio('#FFFFFF', bg) >= contrastRatio('#1F2937', bg) ? '#FFFFFF' : '#1F2937';

/**
 * Oscurece el color hasta que se pueda leer como texto sobre `bg` (4,5:1, el mínimo AA).
 * Si el color ya se lee bien, lo devuelve igual.
 */
export const textColorOn = (color: string, bg = '#FFFFFF', min = 4.5): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  let current = rgb;
  for (let i = 0; i < 40 && contrastRatio(toHex(current), bg) < min; i++) {
    current = current.map((v) => Math.max(0, Math.round(v * 0.92))) as [number, number, number];
  }
  return toHex(current);
};

const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Fondo de referencia para texto sobre las tarjetas teñidas con el color del nivel (conservador: más oscuro que el tinte real). */
export const TINT_BG = '#EEEEEE';
