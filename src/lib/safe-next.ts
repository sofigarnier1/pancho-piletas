/**
 * Solo se aceptan rutas internas: empiezan con una única "/" y no contienen
 * "//", "\", "@" ni caracteres de control. Evita open redirect
 * (ej. next=@sitio-malo.com, next=//sitio-malo.com, next=/\sitio-malo.com).
 */
export const safeNextPath = (raw: string | null | undefined): string => {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (/[\\@\u0000-\u001f]/.test(raw)) return '/';
  return raw;
};
