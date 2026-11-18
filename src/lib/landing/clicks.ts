/** Resumen de los toques a WhatsApp de la landing (para el panel de marketing). */
export type ClickFila = { boton: string; seccion: string; origen: string };

export const NOMBRE_SECCION: Record<string, string> = {
  hero: "Portada",
  header: "Menú de arriba",
  "barra-celu": "Barra del celu",
  cloro: "Cloro",
  service: "Service",
  nosotros: "Nosotros y zonas",
  "antes-despues": "Mirá lo que hace el cloro",
  preguntas: "Preguntas frecuentes",
  contacto: "Cierre",
  otro: "Otros",
};

export const NOMBRE_ORIGEN: Record<string, string> = { directo: "Directo", instagram: "Instagram" };

export type Conteo = { clave: string; nombre: string; total: number };

const contar = (filas: ClickFila[], por: (f: ClickFila) => string, nombre: (k: string) => string): Conteo[] => {
  const m = new Map<string, number>();
  for (const f of filas) m.set(por(f), (m.get(por(f)) ?? 0) + 1);
  return [...m.entries()].map(([clave, total]) => ({ clave, nombre: nombre(clave), total })).sort((a, b) => b.total - a.total);
};

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function resumirClicks(filas: ClickFila[]) {
  return {
    total: filas.length,
    porSeccion: contar(filas, (f) => f.seccion, (k) => NOMBRE_SECCION[k] ?? capitalizar(k)),
    porBoton: contar(filas, (f) => f.boton, (k) => k).slice(0, 6),
    porOrigen: contar(filas, (f) => f.origen, (k) => NOMBRE_ORIGEN[k] ?? capitalizar(k)),
  };
}

/** Fecha (ISO) de hace 30 días: el período que muestra el panel. */
export const hace30Dias = (): string => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
