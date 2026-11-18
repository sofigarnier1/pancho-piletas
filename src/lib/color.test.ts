import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextOn, textColorOn, TINT_BG } from './color';

describe('contrastRatio', () => {
  it('blanco sobre negro es 21:1 y es simétrico', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
  it('el mismo color da 1:1', () => {
    expect(contrastRatio('#1B5FA8', '#1B5FA8')).toBeCloseTo(1, 5);
  });
  it('un valor inválido no rompe (1:1)', () => {
    expect(contrastRatio('rojo', '#FFFFFF')).toBe(1);
  });
});

describe('readableTextOn: texto sobre el color de fondo del nivel', () => {
  it.each([['#1B5FA8'], ['#0F3D6E'], ['#000000'], ['#7C3AED']])('fondo oscuro %s → texto blanco', (bg) => {
    expect(readableTextOn(bg)).toBe('#FFFFFF');
  });
  it.each([['#FFD700'], ['#A0A0A0'], ['#FFFFFF'], ['#CD7F32']])('fondo claro o medio %s → texto oscuro', (bg) => {
    expect(readableTextOn(bg)).toBe('#1F2937');
  });
  it('el texto elegido siempre alcanza 4,5:1 en los niveles base (Bronce, Plata, Oro)', () => {
    for (const bg of ['#CD7F32', '#A0A0A0', '#FFD700']) expect(contrastRatio(readableTextOn(bg), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('textColorOn: el color del nivel usado como texto sobre fondo claro', () => {
  it('un color que ya se lee bien se devuelve igual', () => {
    expect(textColorOn('#1B5FA8')).toBe('#1B5FA8');
  });
  it.each([['#CD7F32'], ['#FFD700'], ['#A0A0A0'], ['#4A9FD4']])('oscurece %s hasta llegar a 4,5:1', (c) => {
    const out = textColorOn(c);
    expect(contrastRatio(out, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(out).not.toBe(c);
  });
  it('conserva el tono: Bronce sigue siendo anaranjado/marrón, no gris', () => {
    const out = textColorOn('#CD7F32');
    const [r, , b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
  });
  it('un valor inválido se devuelve tal cual', () => {
    expect(textColorOn('rojo')).toBe('rojo');
  });
});

describe('texto del nivel sobre la tarjeta teñida', () => {
  it.each([['#CD7F32'], ['#A0A0A0'], ['#FFD700'], ['#4A9FD4']])('%s es legible también sobre el fondo con tinte', (c) => {
    expect(contrastRatio(textColorOn(c, TINT_BG), TINT_BG)).toBeGreaterThanOrEqual(4.5);
  });
});
