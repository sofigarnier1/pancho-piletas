import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, StatCard, StatusBadge } from '@/components/admin/bo';
import { Wallet } from 'lucide-react';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';
import { formatDateAR, todayInArgentina } from '@/lib/dates';
import { embedOne } from '@/lib/clients';
import { PRICE_LABEL, formatPesos, isPriceKind } from '@/lib/precios';
import { CargarPago } from '../CobrosClient';
import { BorrarPagoBoton } from './BorrarPagoBoton';

type Mov = {
  fecha: string; tipo: string; detalle: string | null; cantidad: number | null; precio_cents: number | null;
  cargo_cents: number; pago_cents: number; sin_precio: boolean; ref_id: string; estado: string | null;
};

const UNIDAD: Record<string, string> = { cloro_liquido: 'L', cloro_granulado: 'kg', cloro_pastilla: 'pastillas' };
const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });

type Props = { params: Promise<{ clienteId: string }> };

export default async function CuentaClientePage({ params }: Props) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { clienteId } = await params;
  if (!isUuid(clienteId)) notFound();
  const { supabase } = auth;
  const hoy = todayInArgentina();

  const [{ data: cliente }, { data: movs, error }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, client_profiles (client_number)').eq('id', clienteId).eq('role', 'client').maybeSingle(),
    supabase.rpc('movimientos_cuenta', { p_client: clienteId, p_hasta: hoy }),
  ]);
  if (!cliente) notFound();
  const numero = embedOne(cliente.client_profiles as unknown as { client_number: number | null } | null)?.client_number ?? null;

  // Saldo corrido, del más viejo al más nuevo; se muestra del más nuevo al más viejo
  let saldo = 0;
  const lineas = ((movs ?? []) as Mov[]).map((m) => {
    saldo += Number(m.cargo_cents) - Number(m.pago_cents);
    return { ...m, saldo };
  }).reverse();
  const cargos = lineas.reduce((n, m) => n + Number(m.cargo_cents), 0);
  const pagos = lineas.reduce((n, m) => n + Number(m.pago_cents), 0);
  const sinPrecio = lineas.filter((m) => m.sin_precio).length;

  const concepto = (m: Mov) => {
    if (m.tipo === 'pago') return m.estado === 'con_empleado' ? 'Pago (lo tiene un empleado)' : 'Pago';
    if (!isPriceKind(m.tipo)) return m.tipo;
    if (m.tipo.startsWith('cloro_')) return `${PRICE_LABEL[m.tipo]} · ${num(Number(m.cantidad))} ${UNIDAD[m.tipo]}`;
    return `${PRICE_LABEL[m.tipo]}${m.detalle ? ` · ${m.detalle}` : ''}`;
  };

  return (
    <div className="bo-page bo-page-narrow">
      <PageHeader
        back={{ href: '/admin/cobros', label: 'Volver a cobros' }}
        eyebrow="Cuenta del cliente"
        title={cliente.full_name as string}
        description={`${numero ? `N° ${numero} · ` : ''}Todo lo hecho y lo pagado, con el precio que regía cada día.`}
        actions={<Link href={`/admin/clientes/${clienteId}`} className="bo-btn">Ver precios en la ficha</Link>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label={saldo < 0 ? 'A favor' : 'Debe'} value={<span data-testid="cuenta-saldo">{formatPesos(Math.abs(saldo))}</span>} icon={Wallet} tone={saldo > 0 ? 'purple' : 'green'} />
        <StatCard label="Lo hecho" value={formatPesos(cargos)} foot={sinPrecio ? `${sinPrecio} sin precio (cuentan $ 0)` : undefined} icon={Receipt} />
        <StatCard label="Pagó" value={formatPesos(pagos)} icon={Receipt} tone="green" />
      </div>

      {error && <p className="mb-4 text-sm text-destructive">No se pudo calcular la cuenta: {error.message}</p>}

      <CargarPago clientes={[]} hoy={hoy} clienteFijo={clienteId} />

      <Panel>
        <PanelHeader icon={Receipt} title="Movimientos" bordered />
        {lineas.length === 0 ? (
          <p className="bo-empty !py-8">Todavía no hay visitas hechas, cloro ni pagos.</p>
        ) : (
          <div className="bo-table-wrap">
            <table className="bo-table" data-testid="movimientos">
              <thead>
                <tr><th>Fecha</th><th>Concepto</th><th className="text-right">Precio</th><th className="text-right">Cargo</th><th className="text-right">Pago</th><th className="text-right">Saldo</th><th /></tr>
              </thead>
              <tbody>
                {lineas.map((m) => (
                  <tr key={`${m.tipo}-${m.ref_id}`} data-testid="movimiento" className={m.sin_precio ? 'bg-[#fff4e0]' : undefined}>
                    <td className="whitespace-nowrap tabular-nums">{formatDateAR(m.fecha, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    <td>
                      {concepto(m)}
                      {m.tipo === 'pago' && m.detalle && <span className="block text-xs text-muted-foreground">“{m.detalle}”</span>}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {m.tipo === 'pago' ? '' : m.sin_precio ? <StatusBadge tone="amber">Sin precio</StatusBadge> : formatPesos(Number(m.precio_cents))}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">{Number(m.cargo_cents) ? formatPesos(Number(m.cargo_cents)) : ''}</td>
                    <td className="text-right tabular-nums whitespace-nowrap text-[#28745b]">{Number(m.pago_cents) ? formatPesos(Number(m.pago_cents)) : ''}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-semibold">{formatPesos(m.saldo)}</td>
                    <td>{m.tipo === 'pago' && <BorrarPagoBoton paymentId={m.ref_id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
