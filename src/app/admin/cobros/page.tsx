import { redirect } from 'next/navigation';
import { Wallet, HandCoins, Users, AlertTriangle } from 'lucide-react';
import { PageHeader, Panel, StatCard, Note } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { todayInArgentina } from '@/lib/dates';
import { embedOne } from '@/lib/clients';
import { formatPesos } from '@/lib/precios';
import { CargarPago, DeudaTabla, EnManoPanel, type CobroEnMano, type FilaDeuda } from './CobrosClient';

type DeudaRow = {
  client_id: string; full_name: string; client_number: number | null; services: number; desagotes: number;
  cargos_cents: number; pagos_cents: number; saldo_cents: number; con_empleado_cents: number; sin_precio: number; ultimo_pago: string | null;
};

export default async function CobrosPage() {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;
  const hoy = todayInArgentina();

  const [{ data: deuda, error }, { data: enMano }, { data: clientes }] = await Promise.all([
    supabase.rpc('deuda_clientes', { p_hasta: hoy }),
    supabase
      .from('payments')
      .select('id, amount_cents, paid_at, notes, received_by, client:profiles!payments_client_id_fkey (full_name), cobrador:profiles!payments_received_by_fkey (full_name)')
      .eq('status', 'con_empleado')
      .order('paid_at'),
    supabase.from('profiles').select('id, full_name, client_profiles (client_number)').eq('role', 'client').order('full_name').limit(5000),
  ]);

  const filas: FilaDeuda[] = ((deuda ?? []) as DeudaRow[]).map((r) => ({
    clientId: r.client_id,
    numero: r.client_number,
    cliente: r.full_name,
    services: r.services,
    desagotes: r.desagotes,
    cargos: Number(r.cargos_cents),
    pagos: Number(r.pagos_cents),
    saldo: Number(r.saldo_cents),
    conEmpleado: Number(r.con_empleado_cents),
    sinPrecio: r.sin_precio,
    ultimoPago: r.ultimo_pago,
  }));
  type EnManoRow = { id: string; amount_cents: number; paid_at: string; notes: string | null; received_by: string; client: unknown; cobrador: unknown };
  const cobros: CobroEnMano[] = ((enMano ?? []) as EnManoRow[]).map((p) => ({
    id: p.id,
    empleadoId: p.received_by,
    empleado: embedOne(p.cobrador as { full_name: string } | null)?.full_name ?? 'Sin nombre',
    cliente: embedOne(p.client as { full_name: string } | null)?.full_name ?? 'Cliente',
    fecha: p.paid_at,
    monto: Number(p.amount_cents),
    nota: p.notes,
  }));
  const listaClientes = ((clientes ?? []) as { id: string; full_name: string; client_profiles: unknown }[]).map((c) => {
    const n = embedOne(c.client_profiles as { client_number: number | null } | null)?.client_number;
    return { id: c.id, nombre: n ? `N° ${n} · ${c.full_name}` : c.full_name };
  });

  const deben = filas.filter((f) => f.saldo > 0);
  const totalDeuda = deben.reduce((n, f) => n + f.saldo, 0);
  const totalEnMano = cobros.reduce((n, c) => n + c.monto, 0);
  const sinPrecio = filas.filter((f) => f.sinPrecio > 0).length;

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Plata"
        title="Cobros"
        description="Cuánto te debe cada cliente: lo hecho (cada visita y el cloro, con el precio que regía ese día) menos lo que pagó. Se calcula solo."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Te deben" value={<span data-testid="total-deuda">{formatPesos(totalDeuda)}</span>} foot={`${deben.length} ${deben.length === 1 ? 'cliente' : 'clientes'}`} icon={Wallet} tone="purple" />
        <StatCard label="Lo tienen los empleados" value={<span data-testid="total-en-mano">{formatPesos(totalEnMano)}</span>} foot={`${cobros.length} ${cobros.length === 1 ? 'cobro sin entregar' : 'cobros sin entregar'}`} icon={HandCoins} tone="amber" />
        <StatCard label="Clientes con cuenta" value={filas.length} foot="con algo hecho o pagado" icon={Users} />
      </div>

      {error && <Note icon={AlertTriangle} tone="red" className="mb-4">No se pudo calcular la deuda: {error.message}</Note>}
      {sinPrecio > 0 && (
        <Note icon={AlertTriangle} tone="amber" className="mb-4">
          <span data-testid="aviso-sin-precio">
            {sinPrecio === 1 ? 'Hay 1 cliente' : `Hay ${sinPrecio} clientes`} con visitas o cloro sin precio: esas cosas cuentan $ 0. Cargá los precios en la ficha de cada cliente.
          </span>
        </Note>
      )}

      <EnManoPanel cobros={cobros} />
      <CargarPago clientes={listaClientes} hoy={hoy} />

      <Panel>
        <DeudaTabla filas={filas} />
      </Panel>
    </div>
  );
}
