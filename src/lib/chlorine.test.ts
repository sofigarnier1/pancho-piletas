import { describe, expect, it } from 'vitest';
import { CHLORINE_PICKER, CHLORINE_TYPES, formatChlorine, isChlorineType, isValidChlorineAmount, stepChlorine } from './chlorine';
import { addDays, formatDateAR, isIsoDate } from './dates';

describe('cloro por unidad (mismos topes que la base)', () => {
  it.each([
    ['liquido', 0.01, true], ['liquido', 2.5, true], ['liquido', 500, true], ['liquido', 500.01, false], ['liquido', 0, false],
    ['granulado', 1, true], ['granulado', 300, true], ['granulado', 50_000, true], ['granulado', 0.5, false], ['granulado', 50_001, false],
    ['pastilla', 0.5, true], ['pastilla', 1.5, true], ['pastilla', 100, true], ['pastilla', 0.3, false], ['pastilla', 100.5, false],
    ['pastilla', -1, false], ['liquido', Number.NaN, false], ['granulado', Infinity, false],
  ] as const)('%s %s → %s', (type, amount, ok) => {
    expect(isValidChlorineAmount(type, amount)).toBe(ok);
  });

  it('reconoce solo los tres tipos', () => {
    expect(['liquido', 'granulado', 'pastilla'].every(isChlorineType)).toBe(true);
    expect(['combo', '', null, 'Liquido'].some(isChlorineType)).toBe(false);
  });

  it('muestra el cloro con su unidad, o solo el tipo si no hay cantidad', () => {
    expect(formatChlorine('liquido', 2.5)).toBe('Líquido · 2,5 L');
    expect(formatChlorine('granulado', '300.00')).toBe('Granulado · 300 g');
    expect(formatChlorine('pastilla', 1.5)).toBe('Pastillas · 1,5');
    expect(formatChlorine('pastilla', null)).toBe('Pastillas');
    expect(formatChlorine(null, 3)).toBeNull();
  });
});

describe('fechas YYYY-MM-DD', () => {
  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-11-04', -7)).toBe('2026-10-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('valida fechas reales', () => {
    expect(isIsoDate('2026-11-04')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('04/11/2026')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it('formatea en español de Argentina sin depender del huso del servidor', () => {
    expect(formatDateAR('2026-11-04')).toBe('Miércoles, 4 de noviembre');
  });
});

describe('selector de cloro (− / + y valores rápidos)', () => {
  it('los valores rápidos y cada toque caen en el paso de la unidad', () => {
    for (const type of CHLORINE_TYPES) {
      for (const v of CHLORINE_PICKER[type].rapidos) expect(isValidChlorineAmount(type, v)).toBe(true);
      expect(isValidChlorineAmount(type, CHLORINE_PICKER[type].delta)).toBe(true);
    }
  });

  it('+ suma un toque desde vacío o desde la cantidad actual', () => {
    expect(stepChlorine('liquido', null, 1)).toBe(0.5);
    expect(stepChlorine('liquido', 2, 1)).toBe(2.5);
    expect(stepChlorine('granulado', 300, 1)).toBe(350);
    expect(stepChlorine('pastilla', 1.5, 1)).toBe(2);
  });

  it('− resta y nunca baja de 0', () => {
    expect(stepChlorine('granulado', 50, -1)).toBe(0);
    expect(stepChlorine('granulado', 0, -1)).toBe(0);
    expect(stepChlorine('pastilla', null, -1)).toBe(0);
  });

  it('una cantidad escrita a mano se redondea al paso del botón con el primer toque', () => {
    expect(stepChlorine('liquido', 2.3, 1)).toBe(2.5);
    expect(stepChlorine('liquido', 2.3, -1)).toBe(2);
    expect(stepChlorine('granulado', 320, 1)).toBe(350);
  });

  it('no pasa el tope de la unidad', () => {
    expect(stepChlorine('liquido', 500, 1)).toBe(500);
    expect(stepChlorine('pastilla', 100, 1)).toBe(100);
  });
});
