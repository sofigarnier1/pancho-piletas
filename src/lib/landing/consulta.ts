/**
 * Consulta guiada de la landing: arma el mensaje para WhatsApp a partir de lo que elige el visitante.
 * No guarda nada ni crea pedidos, ventas o visitas: el mensaje solo se abre en WhatsApp cuando la persona lo decide.
 */

export const WA_NUMBER = "5491100000000";

/** Enlace a WhatsApp del negocio, con un texto opcional ya escrito. */
export const waLink = (texto?: string): string =>
  `https://wa.me/${WA_NUMBER}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;

export type Necesidad = "cloro" | "service";

export const INTERESES = [
  "Quiero orientación",
  "Pastillas triple acción",
  "Compra de temporada",
  "Cloro granulado",
  "Combos de cloro",
  "Mantenimiento",
  "Desagote y limpieza",
  "Otra consulta",
] as const;
export type Interes = (typeof INTERESES)[number];

export const ESTADOS_AGUA = [
  "No estoy seguro/a",
  "Clara, quiero mantenerla",
  "Opaca o con suciedad",
  "Verde, necesito recuperarla",
  "La pileta está vacía",
] as const;

export const PASOS = ["Qué necesitás", "Tu pileta", "Revisar consulta"] as const;

export const LIMITES = { zona: 100, medidas: 100, notas: 500 } as const;

export type Consulta = {
  necesidad: Necesidad;
  interes: Interes;
  /** Producto puntual del catálogo, si la consulta empezó desde una tarjeta */
  producto?: string;
  zona: string;
  agua: string;
  medidas: string;
  notas: string;
};

export const consultaVacia = (): Consulta => ({
  necesidad: "cloro",
  interes: "Quiero orientación",
  zona: "",
  agua: ESTADOS_AGUA[0],
  medidas: "",
  notas: "",
});

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A partir del texto del botón que abrió la consulta, elige la necesidad y el interés. */
export function interesDesde(texto: string): { necesidad: Necesidad; interes: Interes } {
  const v = sinTildes(texto);
  if (/mantenimiento/.test(v)) return { necesidad: "service", interes: "Mantenimiento" };
  if (/desagote/.test(v)) return { necesidad: "service", interes: "Desagote y limpieza" };
  if (/service/.test(v)) return { necesidad: "service", interes: "Mantenimiento" };
  if (/granulado/.test(v)) return { necesidad: "cloro", interes: "Cloro granulado" };
  if (/combo/.test(v)) return { necesidad: "cloro", interes: "Combos de cloro" };
  if (/pastilla/.test(v)) return { necesidad: "cloro", interes: "Pastillas triple acción" };
  if (/temporada|presentaciones/.test(v)) return { necesidad: "cloro", interes: "Compra de temporada" };
  return { necesidad: "cloro", interes: "Quiero orientación" };
}

/** Opciones de "Tu consulta" según la necesidad elegida. */
export const interesesDe = (n: Necesidad): readonly Interes[] =>
  n === "service"
    ? ["Mantenimiento", "Desagote y limpieza", "Otra consulta"]
    : ["Quiero orientación", "Pastillas triple acción", "Compra de temporada", "Cloro granulado", "Combos de cloro", "Otra consulta"];

/** El interés por defecto cuando la persona cambia de necesidad. */
export const interesPorNecesidad = (n: Necesidad): Interes =>
  n === "service" ? "Mantenimiento" : "Quiero orientación";

/** El interés que corresponde al tipo de cloro de un producto del catálogo. */
export const interesDeTipo = (tipo: string): Interes =>
  ({ pastilla: "Pastillas triple acción", granulado: "Cloro granulado", combo: "Combos de cloro" } as Record<string, Interes>)[tipo] ??
  "Quiero orientación";

/** Error del paso (o null si se puede seguir). Solo la zona es obligatoria. */
export function errorDelPaso(paso: number, c: Consulta): string | null {
  if (paso === 1 && !c.zona.trim()) return "Contanos tu localidad o barrio para consultar la cobertura.";
  return null;
}

/** El mensaje que le llega a Pancho. */
export function mensajeConsulta(c: Consulta): string {
  const intro = `Hola Pancho, quiero consultar por ${c.necesidad === "service" ? "service" : "cloro"} para mi pileta.`;
  const lineas = [intro, `Me interesa: ${c.interes}.`];
  if (c.producto?.trim()) lineas.push(`Producto: ${c.producto.trim()}.`);
  lineas.push(`Mi zona: ${c.zona.trim()}.`, `Estado del agua: ${c.agua}.`);
  if (c.medidas.trim()) lineas.push(`Medidas aproximadas: ${c.medidas.trim()}.`);
  if (c.notas.trim()) lineas.push(c.notas.trim());
  return lineas.join("\n");
}

/** Precio en pesos a partir de centavos: 3500000 → "$35.000" */
export const formatoPrecio = (cents: number): string =>
  `$${(cents / 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
