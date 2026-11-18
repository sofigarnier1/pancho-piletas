/**
 * Cabeceras de seguridad para todas las respuestas (las aplica next.config.ts).
 *
 * - frame-ancestors / X-Frame-Options: ningún otro sitio puede embeber la web en un iframe
 *   (clickjacking sobre el login o el panel).
 * - base-uri / object-src: sin <base> ni <object> ajenos. No se define script-src a propósito:
 *   Next inyecta scripts en línea y una política estricta requiere nonces (se puede sumar después).
 * - nosniff, Referrer-Policy y Permissions-Policy: cierran lo básico de navegador.
 *
 * No incluye HSTS: lo agrega Vercel al servir por HTTPS.
 */
export const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
] as const;
