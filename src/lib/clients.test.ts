import { describe, expect, it } from 'vitest';
import { embedOne, nextClientNumber, normalizeName, parseClientNumber, poolTitle, sameNameClients } from './clients';

describe('normalizeName / sameNameClients', () => {
  it('compara sin mayúsculas, acentos ni espacios de más', () => {
    expect(normalizeName('  José   GARCÍA ')).toBe('jose garcia');
  });

  it('encuentra los clientes con el mismo nombre', () => {
    const list = [{ full_name: 'Juan García', n: 1 }, { full_name: 'juan garcia', n: 2 }, { full_name: 'Juana García', n: 3 }];
    expect(sameNameClients('JUAN GARCIA', list).map((c) => c.n)).toEqual([1, 2]);
  });

  it('un nombre vacío no coincide con nadie', () => {
    expect(sameNameClients('   ', [{ full_name: '' }])).toEqual([]);
  });
});

describe('parseClientNumber', () => {
  it('vacío es null', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseClientNumber(v)).toBeNull();
  });

  it('acepta enteros positivos', () => {
    expect(parseClientNumber(' 101 ')).toBe(101);
  });

  it('rechaza cero, negativos, decimales, letras y números enormes', () => {
    for (const v of ['0', '-3', '1.5', '12a', '99999999999']) expect(parseClientNumber(v), v).toBe('invalid');
  });
});

describe('nextClientNumber', () => {
  it('sugiere el más alto + 1, o 1 si no hay ninguno', () => {
    expect(nextClientNumber([3, null, 12, 7])).toBe(13);
    expect(nextClientNumber([])).toBe(1);
  });
});

describe('poolTitle', () => {
  it('alias, si no dirección, si no "Pileta sin dirección"', () => {
    expect(poolTitle({ nickname: 'Casa', address: 'Calle 1' })).toBe('Casa');
    expect(poolTitle({ nickname: ' ', address: 'Calle 1' })).toBe('Calle 1');
    expect(poolTitle({ nickname: null, address: null })).toBe('Pileta sin dirección');
    expect(poolTitle(null)).toBe('Pileta sin dirección');
  });
});

describe('embedOne', () => {
  it('acepta objeto, lista o nada', () => {
    expect(embedOne({ a: 1 })).toEqual({ a: 1 });
    expect(embedOne([{ a: 2 }])).toEqual({ a: 2 });
    expect(embedOne([])).toBeNull();
    expect(embedOne(null)).toBeNull();
  });
});
