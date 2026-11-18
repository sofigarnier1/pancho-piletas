import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, EmptyState, StatusBadge, type BadgeTone } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { formatDateAR, todayInArgentina } from '@/lib/dates';
import { formatPesos } from '@/lib/precios';
import {
  MOVIMIENTO_LABEL, SEGMENTO_LABEL, TIPO_LABEL, formatCantidad, isChlorineType, moverMes, nombreMes, rangoMes,
  type Segmento, type TipoMovimiento,
} from '@/lib/cloro';

const TONO: Record<TipoMovimiento, BadgeTone> = {
  ingreso: 'green', venta: 'blue', pedido: 'purple', pedido_cancelado: 'gray',
  service: 'amber', service_corregido: 'gray', ajuste: 'gray', merma: 'red',
};

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/stock');
  const { supabase } = auth;

  const { mes: mesParam } = await searchParams;
  const actual = todayInArgentina().slice(0, 7);
  const mes = rangoMes(mesParam) ? (mesParam as string) : actual;
  const { desde, hasta } = rangoMes(mes)!;

  const { data: movs } = await supabase
    .from('stock_movements')
    .select('id, kind, chlorine_type, product_name, quantity, consumed, shortfall, amount_cents, segment, note, supplier, occurred_on, client:profiles!stock_movements_client_id_fkey (full_name)')
    .gte('occurred_on', desde)
    .lte('occurred_on', hasta)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);

  return (
    <div className="bo-page">
      <PageHeader
        back={{ href: '/admin/stock', label: 'Volver a stock' }}
        eyebrow="Productos y existencias"
        title="Movimientos"
        description="Todo lo que entró y salió del stock: ingresos, ventas, pedidos online, cloro de los services, conteos y mermas."
      />

      <div className="flex items-center justify-between gap-2" data-testid="movimientos-mes">
        <Link href={`/admin/stock/movimientos?mes=${moverMes(mes, -1)}`} className="bo-btn" aria-label="Mes anterior">
          <ChevronLeft className="w-4 h-4" /> Mes anterior
        </Link>
        <strong className="text-sm capitalize">{nombreMes(mes)}</strong>
        {mes < actual ? (
          <Link href={`/admin/stock/movimientos?mes=${moverMes(mes, 1)}`} className="bo-btn" aria-label="Mes siguiente">
            Mes siguiente <ChevronRight className="w-4 h-4" />
          </Link>
        ) : <span />}
      </div>

      <Panel>
        <PanelHeader title="Historial del mes" sub="Lo que sumó al stock va con +, lo que restó con −. El faltante es lo que se vendió o aplicó sin stock." bordered />
        {(movs ?? []).length === 0 ? (
          <EmptyState icon={History}><p>No hubo movimientos este mes</p></EmptyState>
        ) : (
          <div className="bo-rows">
            {(movs ?? []).map((m) => {
              const tipo = isChlorineType(m.chlorine_type) ? m.chlorine_type : null;
              const q = Number(m.quantity);
              const cant = tipo ? formatCantidad(tipo, Math.abs(q)) : `${Math.abs(q).toLocaleString('es-AR')} u.`;
              const cliente = (m.client as unknown as { full_name: string } | null)?.full_name;
              return (
                <div key={m.id} className="bo-row" data-testid="movimiento">
                  <StatusBadge tone={TONO[m.kind as TipoMovimiento] ?? 'gray'}>{MOVIMIENTO_LABEL[m.kind as TipoMovimiento] ?? m.kind}</StatusBadge>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">
                      {tipo ? `${TIPO_LABEL[tipo]} · ` : ''}{m.product_name ?? ''}
                      {cliente ? ` · ${cliente}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {formatDateAR(m.occurred_on as string, { day: '2-digit', month: '2-digit' })}
                      {m.segment ? ` · ${SEGMENTO_LABEL[m.segment as Segmento]}` : ''}
                      {m.supplier ? ` · ${m.supplier}` : ''}
                      {m.note ? ` · ${m.note}` : ''}
                      {Number(m.shortfall) > 0 ? ` · Faltante: ${tipo ? formatCantidad(tipo, Number(m.shortfall)) : Number(m.shortfall)}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-semibold tabular-nums ${q > 0 ? 'text-[#28745b]' : q < 0 ? 'text-[#ad4d52]' : ''}`}>
                      {q > 0 ? '+' : q < 0 ? '−' : ''}{cant}
                    </p>
                    {m.amount_cents != null && Number(m.amount_cents) !== 0 && (
                      <p className="text-xs text-muted-foreground tabular-nums">{formatPesos(Number(m.amount_cents))}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
