import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentYearMonthAR, longDateAR, startOfMonthISOAR, todayInArgentina } from './dates';

// Argentina = UTC-3 todo el año (sin horario de verano). El servidor corre en UTC (TZ=UTC en vitest.config).
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('todayInArgentina', () => {
  it('a las 21:00 de Argentina todavía es el mismo día (00:00 UTC del siguiente)', () => {
    at('2026-10-01T00:00:00Z'); // 21:00 del 30/09 en Argentina
    expect(todayInArgentina()).toBe('2026-09-30');
  });

  it('en el borde exacto: 02:59:59 UTC sigue siendo ayer, 03:00:00 UTC ya es hoy', () => {
    at('2026-10-01T02:59:59Z');
    expect(todayInArgentina()).toBe('2026-09-30');
    at('2026-10-01T03:00:00Z');
    expect(todayInArgentina()).toBe('2026-10-01');
  });

  it('una corrida de la tarde da el día correcto', () => {
    at('2026-06-15T18:00:00Z');
    expect(todayInArgentina()).toBe('2026-06-15');
  });

  it('cruza el año: 01/01 02:00 UTC todavía es 31/12 en Argentina', () => {
    at('2027-01-01T02:00:00Z');
    expect(todayInArgentina()).toBe('2026-12-31');
  });

  it('29 de febrero en año bisiesto', () => {
    at('2028-02-29T12:00:00Z');
    expect(todayInArgentina()).toBe('2028-02-29');
  });

  it('formato YYYY-MM-DD', () => {
    at('2026-03-05T15:00:00Z');
    expect(todayInArgentina()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('currentYearMonthAR', () => {
  it('antes de las 03:00 UTC del día 1 todavía es el mes anterior', () => {
    at('2026-10-01T02:59:00Z');
    expect(currentYearMonthAR()).toEqual({ year: 2026, month: 9 });
    at('2026-10-01T03:00:00Z');
    expect(currentYearMonthAR()).toEqual({ year: 2026, month: 10 });
  });

  it('cruza el año', () => {
    at('2027-01-01T01:00:00Z');
    expect(currentYearMonthAR()).toEqual({ year: 2026, month: 12 });
  });
});

describe('startOfMonthISOAR', () => {
  it('es el primer instante del mes en hora argentina (UTC-3)', () => {
    at('2026-09-30T12:00:00Z');
    expect(startOfMonthISOAR()).toBe('2026-09-01T00:00:00-03:00');
    expect(new Date(startOfMonthISOAR()).toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('el mes se determina con la fecha argentina, no la UTC', () => {
    at('2026-10-01T01:00:00Z'); // en Argentina todavía es septiembre
    expect(startOfMonthISOAR()).toBe('2026-09-01T00:00:00-03:00');
  });

  it('rellena con cero los meses de un dígito', () => {
    at('2026-03-15T12:00:00Z');
    expect(startOfMonthISOAR()).toBe('2026-03-01T00:00:00-03:00');
  });
});

describe('longDateAR', () => {
  it('solo la primera letra en mayúscula (no "30 De Septiembre")', () => {
    at('2026-09-30T15:00:00Z');
    const text = longDateAR();
    expect(text.charAt(0)).toBe(text.charAt(0).toUpperCase());
    expect(text).toContain('30 de septiembre');
    expect(text).not.toContain(' De ');
  });

  it('usa el día argentino aunque en UTC ya sea el siguiente', () => {
    at('2026-10-01T01:00:00Z');
    expect(longDateAR()).toContain('30 de septiembre');
  });

  it('acepta opciones y las respeta', () => {
    at('2026-09-30T15:00:00Z');
    expect(longDateAR({ year: 'numeric', month: 'long', day: 'numeric' })).toContain('2026');
  });
});
