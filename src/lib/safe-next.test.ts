import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it.each([
    ['/'], ['/client/dashboard'], ['/admin/clientes?x=1'], ['/admin/itinerario/2026-09-30'], ['/a#ancla'],
  ])('deja pasar la ruta interna %s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    ['@evil.com'], ['/@evil.com'], ['//evil.com'], ['///evil.com'], ['/\\evil.com'], ['\\\\evil.com'],
    ['https://evil.com'], ['http://evil.com/x'], ['javascript:alert(1)'], ['data:text/html,x'],
    ['evil.com'], ['/ok\n//evil.com'], ['/ok\r\nLocation: //evil.com'], ['/\u0000x'], ['/\tfoo'], [''],
  ])('bloquea %j', (input) => {
    expect(safeNextPath(input)).toBe('/');
  });

  it('bloquea null y undefined', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });

  it('el resultado siempre es una ruta interna segura', () => {
    const inputs = ['/x', '//x', '@x', 'x', '/\\x', 'https://x', '/ok', '/a@b', ''];
    for (const i of inputs) {
      const out = safeNextPath(i);
      expect(out.startsWith('/') && !out.startsWith('//')).toBe(true);
      expect(new URL(out, 'https://app.example').origin).toBe('https://app.example');
    }
  });
});
