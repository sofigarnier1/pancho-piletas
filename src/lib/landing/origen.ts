/** Origen de la visita (de dónde llegó a la landing). Se recuerda mientras dure la pestaña. */
const CLAVE = "landing_origen";

const limpiar = (v: string | null): string | undefined => {
  const s = (v ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  return s || undefined;
};

/** `?ref=instagram` (o `utm_source`) en el link de la bio; sin nada, "directo". */
export function detectarOrigen(search: string, guardado?: string | null): string {
  const p = new URLSearchParams(search);
  return limpiar(p.get("ref")) ?? limpiar(p.get("utm_source")) ?? limpiar(guardado ?? null) ?? "directo";
}

export const leerOrigenGuardado = (): string | null => {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
};
export const guardarOrigen = (origen: string) => {
  try {
    sessionStorage.setItem(CLAVE, origen);
  } catch {
    /* sin almacenamiento: se detecta de nuevo en cada visita */
  }
};

/** Si la visita vino de Instagram, el mensaje de WhatsApp se lo avisa a Pancho. */
export function conOrigenEnMensaje(href: string, origen: string): string {
  if (origen !== "instagram") return href;
  try {
    const url = new URL(href);
    const texto = url.searchParams.get("text") ?? "Hola Pancho";
    if (/vengo de instagram/i.test(texto)) return href;
    url.searchParams.set("text", `${texto}\n\n(Vengo de Instagram)`);
    return url.toString();
  } catch {
    return href;
  }
}
