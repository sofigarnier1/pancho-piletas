import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { todayInArgentina } from '@/lib/dates';
import { CHLORINE_TYPES } from '@/lib/cloro';
import { precioVigente, type PriceRow } from '@/lib/precios';
import { NuevaVentaForm, type ClienteVenta, type ProductoVenta } from './NuevaVentaForm';

export default async function NuevaVentaPage() {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;
  const hoy = todayInArgentina();

  const [{ data: clientes }, { data: productos }, { data: depositos }, { data: pools }, { data: precios }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'client').eq('status', 'active').order('full_name').limit(5000),
    supabase.from('products').select('id, name, price_cents, unit, chlorine_type, chlorine_content').eq('is_active', true).order('name'),
    supabase.from('chlorine_stock').select('chlorine_type, quantity, bulk_price_cents'),
    supabase.from('pools').select('client_id, pool_clients (client_id)').eq('is_active', true).limit(10000),
    supabase.from('client_prices').select('id, client_id, kind, price_cents, valid_from').like('kind', 'cloro_%').lte('valid_from', hoy).limit(20000),
  ]);

  // Clientes de service: titulares o compartidos de una pileta activa (igual que segmento_cliente en la base)
  const conService = new Set<string>();
  for (const p of pools ?? []) {
    if (p.client_id) conService.add(p.client_id as string);
    for (const pc of (p.pool_clients ?? []) as { client_id: string }[]) conService.add(pc.client_id);
  }

  const preciosPorCliente = new Map<string, PriceRow[]>();
  for (const p of (precios ?? []) as (PriceRow & { client_id: string })[]) {
    preciosPorCliente.set(p.client_id, [...(preciosPorCliente.get(p.client_id) ?? []), p]);
  }

  const lista: ClienteVenta[] = (clientes ?? []).map((c) => {
    const rows = preciosPorCliente.get(c.id as string) ?? [];
    const propios: Partial<Record<string, number>> = {};
    for (const t of CHLORINE_TYPES) {
      const v = precioVigente(rows, `cloro_${t}`, hoy);
      if (v) propios[t] = Number(v.price_cents);
    }
    return { id: c.id as string, full_name: c.full_name as string, service: conService.has(c.id as string), precios: propios };
  });

  const granel = Object.fromEntries(CHLORINE_TYPES.map((t) => {
    const d = (depositos ?? []).find((r) => r.chlorine_type === t);
    return [t, { precio: d?.bulk_price_cents == null ? null : Number(d.bulk_price_cents), hay: Number(d?.quantity ?? 0) }];
  }));

  return (
    <div className="bo-page bo-page-md">
      <PageHeader
        back={{ href: '/admin/ventas', label: 'Volver a ventas' }}
        eyebrow="Ventas"
        title="Venta rápida"
        description="A un cliente o en el mostrador. Cada venta descuenta el stock."
      />
      <NuevaVentaForm clientes={lista} productos={(productos ?? []) as ProductoVenta[]} granel={granel} />
    </div>
  );
}
