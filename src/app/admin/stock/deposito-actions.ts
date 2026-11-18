'use server';

// Depósito de cloro (migración 34): ingresos de mercadería, conteo, merma, precio a granel y aviso.
// Solo el dueño y el súper admin; la base lo vuelve a exigir en cada función.
import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';
import { cantidadValida, isChlorineType, MAX_DEPOSITO, parseCantidad } from '@/lib/cloro';
import { parsePriceCents } from '@/lib/precios';

const MAX_NOTA = 500;
const MAX_PROVEEDOR = 120;

const revalidate = () => {
  revalidatePath('/admin/stock');
  revalidatePath('/admin/stock/cargar');
  revalidatePath('/admin/stock/movimientos');
};

const texto = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  return v.trim().slice(0, max) || null;
};

export type IngresoInput = {
  /** 'liquido' | 'granulado' | 'pastilla' para cloro (a granel o presentación); vacío para otro producto. */
  tipo?: string | null;
  /** Presentación del depósito u otro producto. Sin producto y con tipo = a granel. */
  productId?: string | null;
  cantidad: string;
  costo?: string | null;
  proveedor?: string | null;
  nota?: string | null;
};

/** "Cargar mercadería": suma al depósito (cloro) o al stock propio del producto. */
export async function ingresarStockAction(input: IngresoInput) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!input || typeof input !== 'object') return { error: 'Datos inválidos' };

  const tipo = input.tipo ? input.tipo : null;
  const productId = input.productId ? input.productId : null;
  if (tipo !== null && !isChlorineType(tipo)) return { error: 'Datos inválidos' };
  if (productId !== null && !isUuid(productId)) return { error: 'Datos inválidos' };
  if (tipo === null && productId === null) return { error: 'Elegí qué cloro llegó' };

  const cantidad = parseCantidad(input.cantidad);
  const aGranel = productId === null;
  if (!cantidadValida(aGranel ? tipo : null, cantidad) || (!aGranel && !Number.isInteger(cantidad))) {
    return { error: aGranel
      ? 'Escribí cuánto llegó (por ejemplo 20 o 2,5)'
      : 'Escribí cuántas unidades llegaron (un número entero)' };
  }

  let costo: number | null = null;
  if (input.costo && input.costo.trim()) {
    costo = parsePriceCents(input.costo);
    if (costo === null) return { error: 'El costo no es válido' };
  }
  const proveedor = texto(input.proveedor, MAX_PROVEEDOR);
  const nota = texto(input.nota, MAX_NOTA);
  if (proveedor === undefined || nota === undefined) return { error: 'Datos inválidos' };

  const { data, error } = await auth.supabase.rpc('ingresar_stock', {
    p_chlorine_type: tipo,
    p_product_id: productId,
    p_quantity: cantidad,
    p_cost_cents: costo,
    p_supplier: proveedor,
    p_note: nota,
  });
  if (error) return { error: error.message };
  revalidate();
  revalidatePath('/admin/dashboard');
  return { success: true, result: data as { chlorine_type?: string; added?: number; stock: number } };
}

/** "Contar": el dueño contó lo que hay y el sistema ajusta la diferencia. */
export async function contarCloroAction(tipo: string, cantidadTexto: string, nota?: string | null) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isChlorineType(tipo)) return { error: 'Datos inválidos' };
  const cantidad = parseCantidad(cantidadTexto);
  if (cantidad === null || (cantidad !== 0 && !cantidadValida(tipo, cantidad, MAX_DEPOSITO))) {
    return { error: 'Escribí cuánto contaste (0 o más, por ejemplo 35 o 12,5)' };
  }
  const n = texto(nota, MAX_NOTA);
  if (n === undefined) return { error: 'Datos inválidos' };

  const { data, error } = await auth.supabase.rpc('contar_cloro', { p_chlorine_type: tipo, p_quantity: cantidad, p_note: n });
  if (error) return { error: error.message };
  revalidate();
  return { success: true, stock: Number(data) };
}

/** "Merma": sale cloro sin venta (se rompió, se regaló, se usó en casa). La nota es obligatoria. */
export async function sacarMermaAction(tipo: string, cantidadTexto: string, nota: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isChlorineType(tipo)) return { error: 'Datos inválidos' };
  const cantidad = parseCantidad(cantidadTexto);
  if (!cantidadValida(tipo, cantidad)) return { error: 'Escribí cuánto salió (por ejemplo 2 o 0,5)' };
  const n = texto(nota, MAX_NOTA);
  if (n === undefined) return { error: 'Datos inválidos' };
  if (!n) return { error: 'Contá por qué sale ese cloro' };

  const { data, error } = await auth.supabase.rpc('sacar_merma', { p_chlorine_type: tipo, p_quantity: cantidad, p_note: n });
  if (error) return { error: error.message };
  revalidate();
  return { success: true, stock: Number(data) };
}

/** "Precio y aviso": precio de lista a granel (por litro, kilo o pastilla) y aviso de stock bajo. Vacío = sin valor. */
export async function configurarDepositoAction(tipo: string, precioTexto: string, avisoTexto: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isChlorineType(tipo)) return { error: 'Datos inválidos' };
  if (typeof precioTexto !== 'string' || typeof avisoTexto !== 'string') return { error: 'Datos inválidos' };

  let precio: number | null = null;
  if (precioTexto.trim()) {
    precio = parsePriceCents(precioTexto);
    if (precio === null) return { error: 'El precio no es válido (por ejemplo 1.500 o 1.500,50)' };
  }
  let aviso: number | null = null;
  if (avisoTexto.trim()) {
    aviso = parseCantidad(avisoTexto);
    if (aviso === null || (aviso !== 0 && !cantidadValida(null, aviso, MAX_DEPOSITO))) {
      return { error: 'El aviso no es válido (por ejemplo 20 o 2,5)' };
    }
  }

  const { error } = await auth.supabase.rpc('configurar_deposito', {
    p_chlorine_type: tipo, p_bulk_price_cents: precio, p_low_alert: aviso,
  });
  if (error) return { error: error.message };
  revalidate();
  revalidatePath('/admin/ventas/nueva');
  return { success: true };
}
