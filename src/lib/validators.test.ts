import { describe, expect, it } from 'vitest';
import { isIsoDate, isUuid } from './validators';

describe('isUuid', () => {
  it('acepta UUIDs válidos (cualquier caja)', () => {
    expect(isUuid('00000000-0000-4000-a000-000000000001')).toBe(true);
    expect(isUuid('9F0D1C2E-3B4A-4C5D-8E6F-7A8B9C0D1E2F')).toBe(true);
  });

  it.each([
    [''], ['abc'], ['00000000-0000-4000-a000-00000000000'], ['00000000-0000-4000-a000-0000000000011'],
    ['00000000000040004000000000000001'], ['g0000000-0000-4000-a000-000000000001'],
    ['00000000-0000-4000-a000-000000000001; drop table profiles'], [' 00000000-0000-4000-a000-000000000001'],
  ])('rechaza %j', (v) => {
    expect(isUuid(v)).toBe(false);
  });

  it('rechaza valores que no son texto', () => {
    for (const v of [null, undefined, 123, {}, [], true]) expect(isUuid(v)).toBe(false);
  });
});

describe('isIsoDate', () => {
  it('acepta fechas reales, incluido 29 de febrero bisiesto', () => {
    expect(isIsoDate('2026-09-30')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-12-31')).toBe(true);
  });

  it.each([
    ['2026-02-30'], ['2026-02-29'], ['2026-13-01'], ['2026-00-10'], ['2026-04-31'], ['2026-09-00'],
    ['2026-9-3'], ['26-09-30'], ['2026/09/30'], ['2026-09-30T00:00:00Z'], ['30-09-2026'], [''], ['hoy'],
  ])('rechaza %j', (v) => {
    expect(isIsoDate(v)).toBe(false);
  });

  it('rechaza valores que no son texto', () => {
    for (const v of [null, undefined, 20260930, new Date()]) expect(isIsoDate(v)).toBe(false);
  });
});
