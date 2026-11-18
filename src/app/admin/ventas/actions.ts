'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';
import { cantidadValida, isChlorineType, parseCantidad, type ChlorineType } from '@/lib/cloro';

/**
 * Faltante de stock de una línea. `missing` va en la unidad de la línea (bidones, o litros/kilos/pastillas a granel);
 * `missing_chlorine`, en la unidad del depósito cuando la línea es de cloro.
 */
export type StockShortage = {
  product_name: string;
  quantity: number;
  missing: number;
  chlorine_type: ChlorineType | null;
  missing_chlorine: number | null;
};

const MAX_NOMBRE = 80;

/**
 * Venta rápida (migración 34). `modo`: 'cliente' (con cuenta) o 'mostrador' (sin cuenta, nombre opcional).
 * Líneas: product_id_i (producto del catálogo), chlorine_type_i (cloro a granel, sin producto) o ninguna de las dos
 * ("Otro (manual)"); product_name_i, quantity_i (con coma para el granel) y unit_price_i en pesos.
 */
export async function createManualSaleAction(formData: FormData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const mostrador = formData.get('modo') === 'mostrador';
  const clientId = mostrador ? null : (formData.get('client_id') as string | null);
  const walkinName = mostrador ? ((formData.get('walkin_name') as string | null) ?? '').trim() || null : null;
  const notes = (formData.get('notes') as string | null)?.trim() || null;
  const soldAtRaw = formData.get('sold_at') as string;
  // El input de fecha manda "YYYY-MM-DD": se guarda como mediodía en Argentina (UTC-3). Con medianoche UTC
  // la venta caería en el día (y el mes) anterior para quien la carga.
  const soldAtDate = soldAtRaw
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(soldAtRaw) ? `${soldAtRaw}T12:00:00-03:00` : soldAtRaw)
    : new Date();
  if (Number.isNaN(soldAtDate.getTime())) return { error: 'Fecha de venta inválida' };
  const soldAt = soldAtDate.toISOString();

  if (!mostrador && !isUuid(clientId)) return { error: 'Seleccioná un cliente' };
  if (walkinName && walkinName.length > MAX_NOMBRE) return { error: 'El nombre del comprador es demasiado largo' };

  type Item = { product_id: string | null; chlorine_type: ChlorineType | null; product_name: string; quantity: number; unit_price_cents: number };
  const items: Item[] = [];
  for (let i = 0; formData.has(`product_name_${i}`); i++) {
    const productName = ((formData.get(`product_name_${i}`) as string) ?? '').trim();
    const productIdRaw = (formData.get(`product_id_${i}`) as string) || null;
    const productId = isUuid(productIdRaw) ? productIdRaw : null;
    const typeRaw = (formData.get(`chlorine_type_${i}`) as string) || null;
    const granel = !productId && isChlorineType(typeRaw) ? typeRaw : null;
    const quantity = parseCantidad(String(formData.get(`quantity_${i}`) ?? ''));
    const unitPrice = parseFloat(formData.get(`unit_price_${i}`) as string);

    // Línea vacía (sin nombre ni cantidad): se ignora
    if (!productName && quantity === null) continue;
    if (!productName || !Number.isFinite(unitPrice) || unitPrice < 0) return { error: `Revisá la línea ${i + 1}: falta el nombre o el precio` };
    if (granel ? !cantidadValida(granel, quantity, 100_000) : !(quantity !== null && Number.isInteger(quantity) && quantity > 0 && quantity <= 100_000)) {
      return { error: granel
        ? `Revisá la línea ${i + 1}: la cantidad a granel tiene que ser mayor a 0 (por ejemplo 2,5)`
        : `Revisá la línea ${i + 1}: la cantidad tiene que ser un número entero mayor a 0` };
    }
    items.push({
      product_id: productId,
      chlorine_type: granel,
      product_name: productName,
      quantity: quantity as number,
      unit_price_cents: Math.round(unitPrice * 100),
    });
  }
  if (items.length === 0) return { error: 'Agregá al menos un producto' };

  // Venta + ítems + descuento de stock en UNA transacción (RPC): se guarda completa o no se guarda.
  // El total y el segmento (service, cloro o mostrador) los calcula la base. Si se vende más de lo que hay,
  // la venta se permite y el faltante vuelve en `shortages` para avisarle a quien la carga.
  const { data, error } = await supabase.rpc('crear_venta_manual', {
    p_client_id: clientId,
    p_notes: notes,
    p_sold_at: soldAt,
    p_items: items,
    p_walkin_name: walkinName,
  });
  if (error) return { error: error.message };

  const result = data as { sale_id: string; segment: string; shortages: Record<string, unknown>[] };
  const shortages: StockShortage[] = (result.shortages ?? []).map((s) => ({
    product_name: String(s.product_name),
    quantity: Number(s.quantity),
    missing: Number(s.missing),
    chlorine_type: isChlorineType(s.chlorine_type) ? s.chlorine_type : null,
    missing_chlorine: s.missing_chlorine == null ? null : Number(s.missing_chlorine),
  }));

  revalidatePath('/admin/ventas');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/dashboard');
  return { success: true, saleId: result.sale_id, segment: result.segment, shortages };
}
