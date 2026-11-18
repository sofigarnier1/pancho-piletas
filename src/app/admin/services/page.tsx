import { redirect } from 'next/navigation';
import { EnVivo } from '@/components/layout/EnVivo';
import { PageHeader, Panel } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { todayInArgentina } from '@/lib/dates';
import { embedOne } from '@/lib/clients';
import { isUuid } from '@/lib/validators';
import { parseMes } from '@/lib/staff-work';
import { controlPorPileta, diasDesde, type ControlItem, type ControlLog } from '@/lib/control-services';
import { MesNav } from '@/app/admin/empleados/MesNav';
import { STAFF } from '@/app/admin/empleados/data';
import { ServicesTabs } from './ServicesTabs';
import { ControlTabla, type FilaControl } from './ControlTabla';

type Props = { searchParams: Promise<{ mes?: string; auto?: string; empleado?: string; tipo?: string }> };

type PoolRow = {
  id: string; nickname: string | null; address: string | null; neighborhood: string | null; is_active: boolean;
  profiles: { full_name: string | null; client_profiles: unknown } | null;
};

export default async function ServicesPage({ searchParams }: Props) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;
  const sp = await searchParams;
  const hoy = todayInArgentina();
  const mes = parseMes(sp.mes, hoy);
  const auto = sp.auto && isUuid(sp.auto) ? sp.auto : '';
  const empleado = sp.empleado && isUuid(sp.empleado) ? sp.empleado : '';
  // Dos planillas: la de services (por defecto) y la de desagotes
  const tipo: 'service' | 'desagote' = sp.tipo === 'desagote' ? 'desagote' : 'service';
  const esTipo = (t: string | null) => (t === 'desagote' ? 'desagote' : 'service') === tipo;

  const [{ data: pools }, { data: items }, { data: logs }, { data: vehicles }, { data: staff }, { data: ultimas }, { data: notasMes }] = await Promise.all([
    supabase
      .from('pools')
      .select('id, nickname, address, neighborhood, is_active, profiles!pools_client_id_fkey (full_name, client_profiles (client_number))'),
    supabase
      .from('itinerary_items')
      .select('id, pool_id, status, service_type, vehicle_id, itinerary_days!inner (date)')
      .gte('itinerary_days.date', mes.from)
      .lte('itinerary_days.date', mes.to)
      .limit(20000),
    supabase
      .from('service_logs')
      .select('id, itinerary_item_id, pool_id, employee_id, date, service_type, chlorine_type, chlorine_amount, notes')
      .gte('date', mes.from)
      .lte('date', mes.to)
      .limit(20000),
    supabase.from('vehicles').select('id, name').order('sort_order').order('name'),
    supabase.from('profiles').select('id, full_name, role').in('role', [...STAFF]).order('full_name'),
    // Última visita de cada pileta (aunque sea de otro mes)
    supabase.from('service_logs').select('pool_id, date, service_type').lte('date', mes.to).order('date', { ascending: false }).limit(20000),
    supabase.from('pool_month_notes').select('pool_id, notes').eq('month', mes.from),
  ]);

  let controlItems: ControlItem[] = ((items ?? []) as unknown as (Omit<ControlItem, 'date'> & { itinerary_days: { date: string } | { date: string }[] })[])
    .map((i) => ({ id: i.id, pool_id: i.pool_id, status: i.status, service_type: i.service_type, vehicle_id: i.vehicle_id, date: embedOne(i.itinerary_days)!.date }))
    .filter((i) => esTipo(i.service_type));
  let controlLogs = ((logs ?? []) as ControlLog[]).filter((l) => esTipo(l.service_type));

  // Filtros: auto (las visitas de ese auto) y empleado (las visitas que registró esa persona)
  if (auto) {
    controlItems = controlItems.filter((i) => i.vehicle_id === auto);
    const ids = new Set(controlItems.map((i) => i.id));
    controlLogs = controlLogs.filter((l) => l.itinerary_item_id && ids.has(l.itinerary_item_id));
  }
  if (empleado) {
    controlLogs = controlLogs.filter((l) => l.employee_id === empleado);
    const ids = new Set(controlLogs.map((l) => l.itinerary_item_id));
    controlItems = controlItems.filter((i) => ids.has(i.id));
  }
  const filtrado = Boolean(auto || empleado);

  const resumen = controlPorPileta(controlItems, controlLogs, hoy);
  const ultimaDe = new Map<string, string>();
  for (const u of ultimas ?? []) if (esTipo(u.service_type as string | null) && !ultimaDe.has(u.pool_id as string)) ultimaDe.set(u.pool_id as string, u.date as string);
  const notaDe = new Map((notasMes ?? []).map((n) => [n.pool_id as string, n.notes as string]));

  const filas: FilaControl[] = ((pools ?? []) as unknown as PoolRow[])
    // Services sin filtros: todas las piletas activas (también las que no tuvieron visitas) y las inactivas con visitas.
    // Desagotes: solo las piletas que tuvieron desagotes en el mes (no es algo de todos los meses).
    .filter((p) => resumen.has(p.id) || (!filtrado && p.is_active && tipo === 'service'))
    .map((p) => {
      const c = resumen.get(p.id);
      const ultima = ultimaDe.get(p.id) ?? null;
      return {
        poolId: p.id,
        numero: embedOne(p.profiles?.client_profiles as { client_number: number | null } | null)?.client_number ?? null,
        cliente: p.profiles?.full_name ?? 'Sin cliente',
        direccion: p.address || p.nickname || 'Sin dirección',
        barrio: p.neighborhood,
        activa: p.is_active,
        fuimos: c?.fuimos ?? 0,
        services: c?.services ?? 0,
        desagotes: c?.desagotes ?? 0,
        salteadas: c?.salteadas ?? 0,
        noEstaba: c?.noEstaba ?? 0,
        programadas: c?.programadas ?? 0,
        liquido: c?.liquido ?? 0,
        granulado: c?.granulado ?? 0,
        pastillas: c?.pastillas ?? 0,
        ultima,
        diasSinVisita: diasDesde(ultima, hoy < mes.to ? hoy : mes.to),
        visitas: c?.visitas ?? [],
        observaciones: (c?.visitas ?? []).flatMap((v) => v.notas.map((t) => `${Number(v.date.slice(8, 10))}/${Number(v.date.slice(5, 7))}: ${t}`)).join(' · ') || null,
        notaMes: notaDe.get(p.id) ?? null,
      };
    });

  const nombres = Object.fromEntries((staff ?? []).map((s) => [s.id as string, (s.full_name as string | null) ?? 'Sin nombre']));
  const totalFuimos = filas.reduce((s, f) => s + f.fuimos, 0);
  const sinVisitas = filas.filter((f) => f.fuimos === 0 && f.activa).length;

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Operación"
        title={tipo === 'desagote' ? 'Planilla de desagotes' : 'Planilla de services'}
        description={tipo === 'desagote'
          ? 'Los desagotes del mes, pileta por pileta: cuántos se hicieron, el cloro y las notas.'
          : 'Los services del mes, pileta por pileta: cuántas veces fuimos, el cloro y las notas.'}
        actions={<EnVivo aviso={false} />}
      />

      <ServicesTabs actual={tipo === 'desagote' ? 'desagotes' : 'services'} mes={mes.mes} />

      <Panel>
        <MesNav
          mes={mes}
          href={(m) => `/admin/services?${new URLSearchParams({ mes: m, ...(tipo === 'desagote' ? { tipo } : {}), ...(auto ? { auto } : {}), ...(empleado ? { empleado } : {}) }).toString()}`}
          sub={tipo === 'desagote'
            ? `${totalFuimos} ${totalFuimos === 1 ? 'desagote hecho' : 'desagotes hechos'} · ${filas.length} ${filas.length === 1 ? 'pileta' : 'piletas'}`
            : `${totalFuimos} ${totalFuimos === 1 ? 'service hecho' : 'services hechos'} · ${sinVisitas} ${sinVisitas === 1 ? 'pileta activa sin services' : 'piletas activas sin services'}`}
        />
        <ControlTabla
          filas={filas}
          nombres={nombres}
          autos={(vehicles ?? []).map((v) => ({ id: v.id as string, name: v.name as string }))}
          empleados={(staff ?? []).filter((s) => s.role !== 'super_admin').map((s) => ({ id: s.id as string, name: (s.full_name as string | null) ?? 'Sin nombre' }))}
          auto={auto}
          empleado={empleado}
          titulo={`${tipo === 'desagote' ? 'Desagotes' : 'Services'} ${mes.label}`}
          tipo={tipo}
          mes={mes.mes}
        />
      </Panel>
    </div>
  );
}
