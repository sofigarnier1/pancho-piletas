import { describe, expect, it } from 'vitest';
import { formatPesos, parsePriceCents, precioVigente, type PriceRow } from './precios';

describe('parsePriceCents', () => {
  it.each([
    ['12500', 1_250_000], ['12.500', 1_250_000], ['12.500,50', 1_250_050], ['12500,5', 1_250_050],
    ['12500.5', 1_250_050], ['$ 1.000.000', 100_000_000], ['0', 0], [' 300 ', 30_000], ['1.234.567,89', 123_456_789],
  ])('%j → %i centavos', (txt, cents) => expect(parsePriceCents(txt)).toBe(cents));

  it.each([[''], ['abc'], ['-5'], ['12,345'], ['1.2.3,4,5'], ['100000001'], [null], [undefined]])('%j no es un precio', (txt) =>
    expect(parsePriceCents(txt as string)).toBeNull());
});

describe('formatPesos', () => {
  it('sin decimales si es entero; con dos si no', () => {
    expect(formatPesos(1_250_000)).toBe('$ 12.500');
    expect(formatPesos(1_250_050)).toBe('$ 12.500,50');
    expect(formatPesos(0)).toBe('$ 0');
  });
});

describe('precioVigente', () => {
  const rows: PriceRow[] = [
    { id: 'a', kind: 'service', price_cents: 100, valid_from: '2026-01-01' },
    { id: 'b', kind: 'service', price_cents: 200, valid_from: '2026-06-01' },
    { id: 'c', kind: 'desagote', price_cents: 900, valid_from: '2026-03-01' },
  ];
  it('rige el más nuevo que no pasa del día', () => {
    expect(precioVigente(rows, 'service', '2026-05-31')?.id).toBe('a');
    expect(precioVigente(rows, 'service', '2026-06-01')?.id).toBe('b');
    expect(precioVigente(rows, 'service', '2027-01-01')?.id).toBe('b');
  });
  it('antes del primero, o sin precios de ese tipo, no hay', () => {
    expect(precioVigente(rows, 'service', '2025-12-31')).toBeNull();
    expect(precioVigente(rows, 'cloro_pastilla', '2026-06-01')).toBeNull();
  });
});
