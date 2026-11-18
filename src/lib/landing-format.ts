import { esImagenDelProyecto } from "@/lib/landing/imagenes";

export type Testimonial = { name: string; zone?: string; text: string; rating?: number; imageUrl?: string };

/** Testimonio tal como se guarda en el CMS (lista JSON en testimonios.items). */
export type TestimonialItem = {
  id: string;
  name: string;
  zone: string;
  rating: number;
  text: string;
  image_url: string;
  visible: boolean;
  authorized: boolean;
};

export const parseTestimonialItems = (raw: string | undefined): TestimonialItem[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TestimonialItem[]) : [];
  } catch {
    return [];
  }
};

const validRating = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined);

/** Etiqueta de envío a partir del costo en centavos guardado en el CMS. */
export const buildShippingLabel = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined;
  const cost = Number(raw);
  if (Number.isNaN(cost)) return undefined;
  if (cost === 0) return "Envío gratis en Zona Norte";
  return `Envío: $${(cost / 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
};

/**
 * Testimonios de la landing. Con la lista nueva (testimonios.items) solo salen los visibles, con
 * autorización del cliente y con nombre y texto. Sin lista, se usan los 3 fijos del formato anterior.
 */
export const buildTestimonials = (content: Record<string, string>): Testimonial[] => {
  if (content["testimonios.items"] !== undefined) {
    return parseTestimonialItems(content["testimonios.items"])
      .filter((i) => i.visible && i.authorized && i.name?.trim() && i.text?.trim())
      .map((i) => ({
        name: i.name.trim(),
        zone: i.zone?.trim() || undefined,
        text: i.text.trim(),
        rating: validRating(i.rating),
        imageUrl: esImagenDelProyecto(i.image_url) ? i.image_url : undefined,
      }));
  }
  return buildLegacyTestimonials(content);
};

const buildLegacyTestimonials = (content: Record<string, string>): Testimonial[] =>
  [1, 2, 3]
    .map((index) => {
      const rating = Number(content[`testimonios.t${index}_rating`]);
      return {
        name: content[`testimonios.t${index}_name`] ?? "",
        zone: content[`testimonios.t${index}_zone`] || undefined,
        text: content[`testimonios.t${index}_text`] ?? "",
        rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
      };
    })
    .filter((t) => t.name && t.text);

/** Valor del CMS; un campo ausente o vacío (o solo espacios) usa el texto por defecto. */
export const cmsValue = (content: Record<string, string>, section: string, key: string, fallback: string): string => {
  const value = content[`${section}.${key}`];
  return value === undefined || value.trim() === '' ? fallback : value;
};

/** Condiciones de entrega y compra que se muestran en el cierre de la landing. */
export const buildCondiciones = (content: Record<string, string>): string[] => {
  const opcional = (k: string) => content[k]?.trim() || undefined;
  const shipping = buildShippingLabel(content["config.shipping_cost_cents"]);
  return [
    opcional("config.delivery_areas"), // solo si se carga en el CMS: "Envío gratis en Zona Norte" ya dice la zona
    opcional("config.delivery_days") && `Entrega ${opcional("config.delivery_days")}`,
    opcional("config.payment_methods"),
    shipping,
    opcional("config.order_minimum") && `Pedido mínimo: ${opcional("config.order_minimum")}`,
  ].filter((c): c is string => Boolean(c));
};
