import { redirect } from 'next/navigation';
import { PackagePlus } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, EmptyState } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { formatDateAR } from '@/lib/dates';
import { formatPesos } from '@/lib/precios';
import { CHLORINE_TYPES, formatCantidad, isChlorineType } from '@/lib/cloro';
import { CargarForm, type ProductoCarga } from './CargarForm';

export default async function CargarMercaderiaPage() {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/stock');
  const { supabase } = auth;

  const [{ data: productos }, { data: depositos }, { data: ingresos }] = await Promise.all([
    supabase.from('products').select('id, name, chlorine_type, chlorine_content, stock_units, unit').eq('is_active', true).order('display_order').order('name'),
    supabase.from('chlorine_stock').select('chlorine_type, quantity'),
    supabase
      .from('stock_movements')
      .select('id, chlorine_type, product_name, quantity, cost_cents, supplier, note, occurred_on')
      .eq('kind', 'ingreso')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const stock = Object.fromEntries(CHLORINE_TYPES.map((t) => [t, Number((depositos ?? []).find((d) => d.chlorine_type === t)?.quantity ?? 0)]));

  return (
    <div className="bo-page">
      <PageHeader
        back={{ href: '/admin/stock', label: 'Volver a stock' }}
        eyebrow="Productos y existencias"
        title="Cargar mercadería"
        description="Lo que llegó del proveedor: suma al depósito de cloro o al stock del producto."
      />

      <CargarForm productos={(productos ?? []) as ProductoCarga[]} stock={stock} />

      <Panel testId="ultimos-ingresos">
        <PanelHeader title="Últimos ingresos" sub="Los 10 más recientes. El historial completo está en Movimientos." bordered />
        {(ingresos ?? []).length === 0 ? (
          <EmptyState icon={PackagePlus}><p>Todavía no cargaste mercadería</p></EmptyState>
        ) : (
          <div className="bo-rows">
            {(ingresos ?? []).map((m) => (
              <div key={m.id} className="bo-row" data-testid="ingreso">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">
                    {isChlorineType(m.chlorine_type) ? `${formatCantidad(m.chlorine_type, m.quantity)} · ${m.product_name}` : `${Number(m.quantity)} × ${m.product_name}`}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {formatDateAR(m.occurred_on as string, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {m.supplier ? ` · ${m.supplier}` : ''}
                    {m.note ? ` · ${m.note}` : ''}
                  </p>
                </div>
                {m.cost_cents != null && <p className="text-sm font-semibold tabular-nums">{formatPesos(Number(m.cost_cents))}</p>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
