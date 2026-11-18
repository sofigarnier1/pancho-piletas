import { describe, expect, it } from 'vitest';
import { securityHeaders } from './security-headers';

const header = (key: string) => securityHeaders.find((h) => h.key === key)?.value;

describe('cabeceras de seguridad', () => {
  it('no se puede embeber la web en un iframe ajeno', () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('el navegador no adivina tipos de archivo', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
  });

  it('limita el referer y los permisos del navegador', () => {
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Permissions-Policy')).toContain('camera=()');
  });

  it('la política de contenido no rompe los scripts de Next (no define script-src)', () => {
    expect(header('Content-Security-Policy')).not.toContain('script-src');
  });

  it('no repite cabeceras', () => {
    const keys = securityHeaders.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
