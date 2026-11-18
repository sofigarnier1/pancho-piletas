import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ShoppingBag, Package } from 'lucide-react';
import { PageHeader, Panel, StatusBadge, EmptyState, type BadgeTone } from '@/components/admin/bo';

const statusLabel: Record<string, string> = {
  pending: 'Pendiente', paid: 'Pagado', preparing: 'Preparando',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
};
const statusTone: Record<string, BadgeTone> = {
  pending:   'amber',
  paid:      'blue',
  preparing: 'purple',
  shipped:   'blue',
  delivered: 'green',
  cancelled: 'red',
};

type SaleItem = { product_name: string; quantity: number; unit_price_cents: number };

async function getCompras(clientId: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: orders }, { data: manualSales }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, total_cents, created_at, order_items(product_name, quantity, unit_price_cents)')
      .eq('client_id', clientId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
    supabase
      .from('manual_sales')
      .select('id, total_cents, sold_at, notes, manual_sale_items(product_name, quantity, unit_price_cents)')
      .eq('client_id', clientId)
      .order('sold_at', { ascending: false }),
  ]);

  const unified = [
    ...(orders ?? []).map((o) => ({
      id: o.id,
      type: 'online' as const,
      date: o.created_at as string,
      totalCents: o.total_cents,
      status: o.status,
      items: (o.order_items as unknown as SaleItem[]) ?? [],
      notes: null as string | null,
    })),
    ...(manualSales ?? []).map((s) => ({
      id: s.id,
      type: 'manual' as const,
      date: s.sold_at as string,
      totalCents: s.total_cents,
      status: 'delivered',
      items: (s.manual_sale_items as unknown as SaleItem[]) ?? [],
      notes: s.notes as string | null,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return unified;
}

export default async function ClientComprasPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const compras = await getCompras(user.id);

  return (
    <div>
      <PageHeader
        title="Mis compras"
        description={`${compras.length} ${compras.length === 1 ? 'compra' : 'compras'} en total`}
      />

      {compras.length === 0 ? (
        <Panel>
          <EmptyState icon={ShoppingBag}>
            <p className="font-medium text-foreground">Sin compras registradas</p>
            <p className="mt-1">Tus pedidos aparecerán acá</p>
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-3">
          {compras.map((c) => (
            <Panel as="div" key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <p className="font-semibold text-foreground text-sm">
                      {new Date(c.date).toLocaleDateString('es-AR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </p>
                    {c.type === 'manual' && (
                      <StatusBadge tone="gray" className="plain">
                        WhatsApp
                      </StatusBadge>
                    )}
                  </div>
                  {c.items.length > 0 && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {c.items.map((i) => `${Number(i.quantity).toLocaleString("es-AR")}× ${i.product_name}`).join(', ')}
                    </p>
                  )}
                  {c.notes && (
                    <p className="text-xs text-muted-foreground italic pl-6 mt-0.5">{c.notes}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <p className="font-bold text-foreground text-sm">
                    ${(c.totalCents / 100).toLocaleString('es-AR')}
                  </p>
                  <StatusBadge tone={statusTone[c.status] ?? 'gray'}>
                    {statusLabel[c.status] ?? c.status}
                  </StatusBadge>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
