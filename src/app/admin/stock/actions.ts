'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES, STAFF_ROLES } from '@/lib/auth/require-role';
import { CATEGORIAS_OTRO, cantidadValida, isChlorineType, parseCantidad } from '@/lib/cloro';

const CHLORINE_TYPES = ['pastilla', 'granulado', 'liquido', 'combo', 'otro'];
const UNITS = ['kg', 'litro', 'unidad'];

/**
 * Campos de stock del producto (migración 34): contenido de cloro (solo el dueño; con valor, el producto es una
 * presentación del depósito), categoría (solo para tipo "Otro") y aviso de stock bajo.
 * `chlorine_content` queda afuera si quien edita no es el dueño (no se toca).
 */
function camposDeStock(formData: FormData, chlorineType: string, isOwner: boolean):
  { error: string } | { chlorine_content?: number | null; category: string; low_stock_alert: number | null } {
  const out: { chlorine_content?: number | null; category: string; low_stock_alert: number | null } = {
    category: 'otros', low_stock_alert: null,
  };

  if (isOwner) {
    const raw = ((formData.get('chlorine_content') as string | null) ?? '').trim();
    if (!isChlorineType(chlorineType) || !raw) out.chlorine_content = null;
    else {
      const n = parseCantidad(raw);
      if (!cantidadValida(chlorineType, n, 100_000)) return { error: 'El contenido no es válido (por ejemplo 5 o 0,5)' };
      out.chlorine_content = n;
    }
  }

  const category = ((formData.get('category') as string | null) ?? '').trim();
  if (chlorineType === 'otro') {
    if (category && !(CATEGORIAS_OTRO as string[]).includes(category)) return { error: 'Categoría inválida' };
    out.category = category || 'otros';
  }

  const alertRaw = ((formData.get('low_stock_alert') as string | null) ?? '').trim();
  if (alertRaw) {
    const n = Number(alertRaw);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { error: 'El aviso de stock bajo no es válido' };
    out.low_stock_alert = n;
  }
  return out;
}

export async function createProductAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(STAFF_ROLES);
  if (!auth.ok) return { error: auth.error };

  const name = ((formData.get('name') as string | null) ?? '').trim();
  const description = (formData.get('description') as string | null)?.trim() || null;
  const chlorineType = formData.get('chlorine_type') as string;
  const priceCents = Math.round(parseFloat(formData.get('price') as string) * 100);
  // El stock inicial lo carga el dueño; si crea marketing, arranca en 0.
  const stockUnits = OWNER_ROLES.includes(auth.role) ? parseInt(formData.get('stock_units') as string) || 0 : 0;
  const unit = (formData.get('unit') as string) || 'kg';
  const weightKg = parseFloat(formData.get('weight_kg') as string) || null;
  const promoLabel = (formData.get('promo_label') as string | null)?.trim() || null;
  const imageUrl = (formData.get('image_url') as string | null)?.trim() || null;
  const isFeatured = formData.get('is_featured') === 'on';
  const inStock = formData.get('in_stock') === 'on';

  if (!name || !CHLORINE_TYPES.includes(chlorineType) || !Number.isFinite(priceCents) || priceCents < 0) {
    return { error: 'Nombre, tipo y precio son requeridos' };
  }
  if (!UNITS.includes(unit)) return { error: 'Unidad inválida' };
  if (stockUnits < 0) return { error: 'El stock no puede ser negativo' };
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return { error: 'La imagen debe ser una URL http(s)' };
  const stock = camposDeStock(formData, chlorineType, OWNER_ROLES.includes(auth.role));
  if ('error' in stock) return { error: stock.error };

  const { data, error } = await auth.supabase
    .from('products')
    .insert({ name, description, chlorine_type: chlorineType, price_cents: priceCents, stock_units: stockUnits, unit, weight_kg: weightKg, image_url: imageUrl, promo_label: promoLabel, is_featured: isFeatured, in_stock: inStock, ...stock })
    .select('id')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/admin/stock');
  return { success: true, productId: data.id };
}

export async function adjustStockAction(productId: string, delta: number) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(productId) || !Number.isInteger(delta)) return { error: 'Datos inválidos' };

  // Función atómica en la DB (evita leer-y-escribir con carreras)
  const { data, error } = await auth.supabase.rpc('adjust_stock', {
    p_product_id: productId,
    p_delta: delta,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/stock');
  return { success: true, newStock: data as number };
}

export async function toggleProductActiveAction(productId: string, isActive: boolean) {
  const auth = await requireRole(STAFF_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(productId)) return { error: 'Producto inválido' };

  const { error } = await auth.supabase.from('products').update({ is_active: isActive }).eq('id', productId);
  if (error) return { error: error.message };
  revalidatePath('/admin/stock');
  revalidatePath('/');
  return { success: true };
}

// Marketing y dueño editan todo lo que se ve en la web. El stock (cantidad) y activar/desactivar
// son solo del dueño: otras acciones, y la base también lo exige.
export async function updateProductAction(productId: string, _prevState: unknown, formData: FormData) {
  const auth = await requireRole(STAFF_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(productId)) return { error: 'Producto inválido' };

  const imageUrl = (formData.get('image_url') as string | null)?.trim() || null;
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return { error: 'La imagen debe ser una URL http(s)' };

  const updates: Record<string, string | number | boolean | null> = {
    image_url: imageUrl,
    promo_label: (formData.get('promo_label') as string | null)?.trim() || null,
    is_featured: formData.get('is_featured') === 'on',
    in_stock: formData.get('in_stock') === 'on',
    display_order: Math.max(0, parseInt(formData.get('display_order') as string) || 0),
  };

  const name = ((formData.get('name') as string | null) ?? '').trim();
  if (!name) return { error: 'El nombre es requerido' };
  const priceCents = Math.round(parseFloat(formData.get('price') as string) * 100);
  if (!Number.isFinite(priceCents) || priceCents < 0) return { error: 'Precio inválido' };
  const chlorineType = formData.get('chlorine_type') as string;
  const unit = formData.get('unit') as string;
  if (!CHLORINE_TYPES.includes(chlorineType)) return { error: 'Tipo inválido' };
  if (!UNITS.includes(unit)) return { error: 'Unidad inválida' };
  updates.name = name;
  updates.description = (formData.get('description') as string | null)?.trim() || null;
  updates.price_cents = priceCents;
  updates.chlorine_type = chlorineType;
  updates.unit = unit;
  updates.weight_kg = parseFloat(formData.get('weight_kg') as string) || null;
  const stock = camposDeStock(formData, chlorineType, OWNER_ROLES.includes(auth.role));
  if ('error' in stock) return { error: stock.error };
  Object.assign(updates, stock);

  const { error } = await auth.supabase.from('products').update(updates).eq('id', productId);
  if (error) return { error: error.message };
  revalidatePath('/admin/stock');
  revalidatePath('/');
  return { success: true };
}

export async function setInStockAction(productId: string, inStock: boolean) {
  const auth = await requireRole(STAFF_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(productId)) return { error: 'Producto inválido' };

  const { error } = await auth.supabase.from('products').update({ in_stock: inStock }).eq('id', productId);
  if (error) return { error: error.message };
  revalidatePath('/admin/stock');
  revalidatePath('/');
  return { success: true };
}
