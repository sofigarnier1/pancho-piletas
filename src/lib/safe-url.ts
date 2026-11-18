/**
 * Las URLs del CMS las edita marketing y se renderizan en href/src.
 * Solo se aceptan http(s); cualquier otra cosa (javascript:, data:, etc.) se descarta.
 */
export const safeHttpUrl = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};
