import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './safe-url';

describe('safeHttpUrl', () => {
  it('acepta http y https', () => {
    expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHttpUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('recorta espacios alrededor', () => {
    expect(safeHttpUrl('  https://example.com/  ')).toBe('https://example.com/');
  });

  it.each([
    ['javascript:alert(1)'], ['JAVASCRIPT:alert(1)'], [' javascript:alert(1)'], ['data:text/html,<script>1</script>'],
    ['vbscript:x'], ['file:///etc/passwd'], ['ftp://example.com'], ['//example.com'],
    ['example.com'], ['/ruta/relativa'], ['not a url'], [''], ['   '],
  ])('rechaza %j', (input) => {
    expect(safeHttpUrl(input)).toBeUndefined();
  });

  it('rechaza null y undefined', () => {
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });
});
