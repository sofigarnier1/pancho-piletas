import { createSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ShoppingBag, Plus, CheckCircle2, Globe, BarChart3 } from 'lucide-react';
import { SEGMENTO_LABEL, type Segmento } from '@/lib/cloro';
import { PageHeader, Panel, PanelHeader, EmptyState, StatCard, StatusBadge, type BadgeTone } from '@/components/admin/bo';

async function getVentas() {
  const supabase = await createSupabaseServerClient();

  const [{ data: manual }, { data: online }] = await Promise.all([
    supabase
      .from('manual_sales')
      .select(`
        id, total_cents, sold_at, notes, walkin_name, segment,
        profiles!manual_sales_client_id_fkey (full_name),
        manual_sale_items (product_name, quantity, unit_price_cents)
      `)
      .order('sold_at', { ascending: false })
      .limit(50),
    supabase
      .from('orders')
      .select(`
        id, status, total_cents, created_at,
        profiles!orders_client_id_fkey (full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  type ManualSale = {
    id: string; type: 'manual'; date: string; clientName: string;
    totalCents: number; status: string; notes: string | null; segment: Segmento;
    items: { product_name: string; quantity: number; unit_price_cents: number }[];
  };
  type OnlineOrder = {
    id: string; type: 'online'; date: string; clientName: string;
    totalCents: number; status: string; notes: null; segment: null;
    items: never[];
  };

  const allSales: (ManualSale | OnlineOrder)[] = [
    ...(manual ?? []).map((s) => ({
      id: s.id,
      type: 'manual' as const,
      date: s.sold_at as string,
      clientName: (s.profiles as unknown as { full_name: string } | null)?.full_name
        ?? (s.segment === 'mostrador' ? `Mostrador${s.walkin_name ? ` · ${s.walkin_name}` : ''}` : 'Desconocido'),
      totalCents: s.total_cents as number,
      status: 'paid',
      notes: s.notes as string | null,
      segment: s.segment as Segmento,
      items: (s.manual_sale_items ?? []) as { product_name: string; quantity: number; unit_price_cents: number }[],
    })),
    ...(online ?? []).map((o) => ({
      id: o.id,
      type: 'online' as const,
      date: o.created_at as string,
      clientName: (o.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Desconocido',
      totalCents: o.total_cents as number,
      status: o.status as string,
      notes: null,
      segment: null,
      items: [] as never[],
    })),
  ];

  allSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return allSales;
}

const orderStatusLabel: Record<string, string> = {
  pending: 'Pendiente', paid: 'Pagado', preparing: 'Preparando',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
};
// Verde: cobrado/entregado · ámbar: falta algo · violeta: en camino · rojo: cancelado (siempre con su texto)
const orderStatusTone: Record<string, BadgeTone> = {
  paid: 'green', delivered: 'green',
  pending: 'amber', preparing: 'blue', shipped: 'purple',
  cancelled: 'red',
};

function cents(n: number) {
  return `$${(n / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
}

export default async function VentasPage() {
  const ventas = await getVentas();

  const totalMonth = ventas
    .filter((v) => {
      const d = new Date(v.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        && (v.status === 'paid' || v.status === 'delivered');
    })
    .reduce((s, v) => s + v.totalCents, 0);

  const manualCount = ventas.filter((v) => v.type === 'manual').length;
  const onlineCount = ventas.length - manualCount;

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Cloro y otros productos"
        title="Ventas"
        description={`${ventas.length} registros · ${cents(totalMonth)} este mes`}
        actions={
          <>
            <Link href="/admin/ventas/reporte" className="bo-btn" data-testid="ver-reporte">
              <BarChart3 className="w-4 h-4" />
              Cloro del mes
            </Link>
            <Link href="/admin/ventas/nueva" className="bo-btn bo-btn-primary" data-testid="venta-rapida">
              <Plus className="w-4 h-4" />
              Venta rápida
            </Link>
          </>
        }
      />

      {ventas.length > 0 && (
        <div className="bo-stats cols-3">
          <StatCard label="Vendido este mes" value={cents(totalMonth)} foot="Ventas cobradas o entregadas" icon={CheckCircle2} tone="green" />
          <StatCard label="Ventas manuales" value={manualCount} foot="Cargadas desde el backoffice" icon={ShoppingBag} tone="blue" />
          <StatCard label="Pedidos online" value={onlineCount} foot="Desde la tienda web" icon={Globe} tone="purple" />
        </div>
      )}

      <Panel>
        {ventas.length === 0 ? (
          <EmptyState icon={ShoppingBag}>
            <p>Todavía no hay ventas registradas</p>
          </EmptyState>
        ) : (
          <>
            <PanelHeader title="Registro completo" sub="Manuales y online, de la más reciente a la más antigua" bordered />
            <div className="bo-rows">
              {ventas.map((venta) => (
                <div key={`${venta.type}-${venta.id}`} className="bo-row">
                  <div className={`bo-icon-tile ${venta.type === 'online' ? 'purple' : ''}`}>
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{venta.clientName}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {new Date(venta.date).toLocaleDateString('es-AR')}
                      {venta.type === 'manual' ? ' · Manual' : ' · Online'}
                      {venta.segment && venta.segment !== 'mostrador' ? ` · ${SEGMENTO_LABEL[venta.segment]}` : ''}
                      {venta.notes ? ` · ${venta.notes}` : ''}
                      {'items' in venta && venta.items.length > 0
                        ? ` · ${venta.items.map((i) => `${Number(i.quantity).toLocaleString('es-AR')}× ${i.product_name}`).join(', ')}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge tone={orderStatusTone[venta.status] ?? 'gray'} className="hidden sm:inline-flex">
                      {orderStatusLabel[venta.status] ?? venta.status}
                    </StatusBadge>
                    <p className="text-sm font-semibold text-foreground tabular-nums">{cents(venta.totalCents)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
