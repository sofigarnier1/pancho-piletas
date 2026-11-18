import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Users, Waves, ShoppingBag, CalendarDays, TrendingUp, Clock, ArrowRight, CheckCircle2, Hourglass, AlertTriangle } from 'lucide-react';
import { EnVivo } from '@/components/layout/EnVivo';
import { PageHeader, Panel, PanelHeader, StatCard, Avatar, StatusBadge, type Tone } from '@/components/admin/bo';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { todayInArgentina, startOfMonthISOAR, longDateAR, addDays, formatDateAR } from '@/lib/dates';
import { mapSupabaseUserToAppUser } from '@/lib/supabase/user';
import { embedOne } from '@/lib/clients';
import { SERVICE_TYPE_LABEL, type ServiceType } from '@/lib/chlorine';
import { HoyDueno, type FilaHoy } from './HoyDueno';
import type { PiletaParaAgregar } from '@/app/admin/itinerario/[fecha]/AgregarPiletas';
import type { Persona } from '@/app/admin/itinerario/visita/[id]/VisitaDueno';

async function getDashboardStats() {
  const supabase = await createSupabaseServerClient();
  const today = todayInArgentina();
  const startOfMonth = startOfMonthISOAR();

  const [
    { count: totalClients },
    { count: activeClients },
    todayItems,
    { count: monthlySales },
    { data: recentClients },
    { count: activePools },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'client'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'client').eq('status', 'active'),
    supabase
      .from('itinerary_days')
      .select('id, itinerary_items(count)')
      .eq('date', today)
      .maybeSingle(),
    supabase
      .from('manual_sales')
      .select('*', { count: 'exact', head: true })
      .gte('sold_at', startOfMonth),
    supabase
      .from('profiles')
      .select('id, full_name, created_at')
      .eq('role', 'client')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('pools').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  const poolsToday = (todayItems.data as { itinerary_items: { count: number }[] } | null)
    ?.itinerary_items?.[0]?.count ?? 0;

  return {
    totalClients: totalClients ?? 0,
    activeClients: activeClients ?? 0,
    poolsToday,
    monthlySales: monthlySales ?? 0,
    activePools: activePools ?? 0,
    recentClients: recentClients ?? [],
  };
}

async function DashboardGeneral() {
  const stats = await getDashboardStats();

  const cards: { label: string; value: React.ReactNode; sub: string; icon: typeof Users; href: string; tone: Tone }[] = [
    { label: 'Clientes activos', value: stats.activeClients, sub: `${stats.totalClients} en total`, icon: Users, href: '/admin/clientes', tone: 'green' },
    { label: 'Piletas hoy', value: stats.poolsToday, sub: `${stats.activePools} piletas activas`, icon: CalendarDays, href: `/admin/itinerario/${todayInArgentina()}`, tone: 'blue' },
    { label: 'Piletas activas', value: stats.activePools, sub: 'en toda la cartera', icon: Waves, href: '/admin/clientes', tone: 'blue' },
    { label: 'Ventas este mes', value: stats.monthlySales, sub: 'ventas manuales', icon: ShoppingBag, href: '/admin/ventas', tone: 'purple' },
  ];

  const quickLinks = [
    { href: '/admin/clientes/nuevo', label: 'Nuevo cliente', icon: Users },
    { href: `/admin/itinerario/${todayInArgentina()}`, label: 'Itinerario de hoy', icon: CalendarDays },
    { href: '/admin/ventas/nueva', label: 'Registrar venta', icon: ShoppingBag },
    { href: '/admin/piletas/nueva', label: 'Nueva pileta', icon: Waves },
  ];

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Resumen general"
        title="Dashboard"
        description={<span className="bo-capitalize">{longDateAR({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>}
      />

      {/* Indicadores */}
      <div className="bo-stats">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} foot={card.sub} icon={card.icon} href={card.href} tone={card.tone} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        {/* Clientes recientes */}
        <Panel>
          <PanelHeader
            icon={Clock}
            title="Últimos clientes"
            sub="Las últimas altas de tu cartera"
            action={
              <Link href="/admin/clientes" className="bo-link">
                Ver todos <ArrowRight />
              </Link>
            }
            bordered
          />
          {stats.recentClients.length === 0 ? (
            <p className="bo-empty">Sin clientes aún</p>
          ) : (
            <div className="bo-rows">
              {stats.recentClients.map((c) => (
                <Link key={c.id} href={`/admin/clientes/${c.id}`} className="bo-row">
                  <Avatar name={c.full_name as string} small />
                  <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{c.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at as string).toLocaleDateString('es-AR')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {/* Accesos rápidos */}
        <Panel className="self-start">
          <PanelHeader icon={TrendingUp} title="Acciones rápidas" sub="Lo que más usás, a un clic" />
          <div className="grid grid-cols-2 gap-2.5 px-5 pb-5">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-border bg-card px-3 py-3.5 text-[13px] font-medium text-foreground transition-colors hover:border-[#a9bfd7] hover:bg-muted"
              >
                <link.icon className="w-[18px] h-[18px] text-primary mb-2.5" />
                {link.label}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

type PoolEmbed = {
  id: string; nickname: string | null; address: string | null; neighborhood: string | null;
  profiles: { full_name: string | null; client_profiles: unknown } | null;
} | null;
type ItemHoy = {
  id: string; sort_order: number; status: string; status_note: string | null; service_type: ServiceType; vehicle_id: string | null;
  assigned_employee_id: string | null; pools: PoolEmbed;
};
type Atrasada = { id: string; pools: PoolEmbed; itinerary_days: { date: string } | { date: string }[] };

const numeroDe = (p: PoolEmbed) => embedOne(p?.profiles?.client_profiles as { client_number: number | null } | null)?.client_number ?? null;
const lugarDe = (p: PoolEmbed) => p?.address || p?.nickname || 'Sin dirección';

/** El día de hoy para el dueño (y el súper admin): números del día, botones grandes y la tabla de visitas. */
async function DashboardDueno({ userId }: { userId: string }) {
  const supabase = await createSupabaseServerClient();
  const hoy = todayInArgentina();

  const [{ data: day }, { data: vehicles }, { data: staff }, { data: pools }, { data: atrasadas }, { count: ventasMes }] = await Promise.all([
    supabase
      .from('itinerary_days')
      .select(`
        id,
        itinerary_items (id, sort_order, status, status_note, service_type, vehicle_id, assigned_employee_id,
          pools (id, nickname, address, neighborhood, profiles!pools_client_id_fkey (full_name, client_profiles (client_number)))),
        itinerary_day_crews (vehicle_id, employee_id, created_at)
      `)
      .eq('date', hoy)
      .maybeSingle(),
    supabase.from('vehicles').select('id, name, is_active').order('sort_order').order('name'),
    supabase.from('profiles').select('id, full_name, role, status').in('role', ['employee', 'owner', 'super_admin']).order('full_name'),
    supabase
      .from('pools')
      .select('id, nickname, address, neighborhood, profiles!pools_client_id_fkey (full_name, client_profiles (client_number))')
      .eq('is_active', true),
    // Visitas de las dos últimas semanas que quedaron pendientes
    supabase
      .from('itinerary_items')
      .select('id, pools (id, nickname, address, neighborhood, profiles!pools_client_id_fkey (full_name, client_profiles (client_number))), itinerary_days!inner (date)')
      .eq('status', 'pending')
      .gte('itinerary_days.date', addDays(hoy, -14))
      .lt('itinerary_days.date', hoy)
      .limit(200),
    supabase.from('manual_sales').select('*', { count: 'exact', head: true }).gte('sold_at', startOfMonthISOAR()),
  ]);

  const items = ((day?.itinerary_items ?? []) as unknown as ItemHoy[]);
  const crews = ((day?.itinerary_day_crews ?? []) as { vehicle_id: string; employee_id: string; created_at: string }[])
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const people = (staff ?? []) as { id: string; full_name: string; role: string; status: string }[];
  const nameOf = new Map(people.map((p) => [p.id, p.full_name]));
  const autos = ((vehicles ?? []) as { id: string; name: string; is_active: boolean }[]);
  const autoIdx = new Map(autos.map((v, i) => [v.id, i]));

  // Quién registró cada visita de hoy
  const autores = new Map<string, string[]>();
  if (items.length) {
    const { data: logs } = await supabase
      .from('service_logs')
      .select('itinerary_item_id, employee_id')
      .in('itinerary_item_id', items.map((i) => i.id))
      .order('created_at');
    for (const l of logs ?? []) {
      const lista = autores.get(l.itinerary_item_id as string) ?? [];
      const n = nameOf.get(l.employee_id as string) ?? 'Sin nombre';
      if (!lista.includes(n)) lista.push(n);
      autores.set(l.itinerary_item_id as string, lista);
    }
  }

  const team: Persona[] = people
    .filter((p) => p.status !== 'blocked')
    .map((p) => ({ id: p.id, name: p.id === userId ? `${p.full_name} (vos)` : p.full_name }));
  const enEquipo = new Set(team.map((t) => t.id));

  // Orden de la ruta dentro de cada auto, como en la pantalla del día
  const porAuto = new Map<string, ItemHoy[]>();
  for (const i of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    const k = i.vehicle_id && autoIdx.has(i.vehicle_id) ? i.vehicle_id : 'none';
    porAuto.set(k, [...(porAuto.get(k) ?? []), i]);
  }
  const filas: FilaHoy[] = [...porAuto.entries()].flatMap(([k, lista]) =>
    lista.map((i, n) => {
      // Por defecto, el registro va a nombre del encargado, o del primero del auto, o de uno mismo
      const primero = k === 'none' ? undefined : crews.find((c) => c.vehicle_id === k)?.employee_id;
      const defaultEmployeeId = [i.assigned_employee_id, primero, userId].find((x): x is string => !!x && enEquipo.has(x)) ?? userId;
      return {
        id: i.id,
        auto: k === 'none' ? 'Sin auto' : autos[autoIdx.get(k)!].name,
        autoOrden: k === 'none' ? 1e6 : autoIdx.get(k)!,
        orden: n + 1,
        numero: numeroDe(i.pools),
        cliente: i.pools?.profiles?.full_name ?? 'Sin cliente',
        direccion: lugarDe(i.pools),
        barrio: i.pools?.neighborhood ?? null,
        tipo: SERVICE_TYPE_LABEL[i.service_type] ?? i.service_type,
        encargado: i.assigned_employee_id ? nameOf.get(i.assigned_employee_id) ?? 'Sin nombre' : null,
        estado: i.status,
        hicieron: autores.get(i.id)?.join(', ') ?? null,
        motivo: i.status_note ?? null,
        defaultEmployeeId,
      };
    }),
  ).sort((a, b) => a.autoOrden - b.autoOrden || a.orden - b.orden);

  const yaHoy = new Map(items.map((i) => [i.pools?.id ?? '', i.vehicle_id && autoIdx.has(i.vehicle_id) ? autos[autoIdx.get(i.vehicle_id)!].name : 'Sin auto']));
  const piletas: PiletaParaAgregar[] = ((pools ?? []) as unknown as NonNullable<PoolEmbed>[]).map((p) => ({
    id: p.id,
    numero: numeroDe(p),
    cliente: p.profiles?.full_name ?? 'Sin cliente',
    lugar: lugarDe(p),
    barrio: p.neighborhood,
    yaEn: yaHoy.get(p.id) ?? null,
    semanaPasada: false,
  }));

  const hechas = items.filter((i) => i.status === 'done').length;
  const faltan = items.filter((i) => i.status === 'pending').length;
  const desagotes = items.filter((i) => i.service_type === 'desagote').length;
  const atrasos = ((atrasadas ?? []) as unknown as Atrasada[])
    .map((a) => ({ id: a.id, fecha: embedOne(a.itinerary_days)!.date, pool: a.pools }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Hoy"
        title={<span className="bo-capitalize">{longDateAR({ weekday: 'long', day: 'numeric', month: 'long' })}</span>}
        description={items.length ? `${items.length} ${items.length === 1 ? 'pileta' : 'piletas'} en el itinerario de hoy` : 'Todavía no hay piletas para hoy.'}
        actions={<EnVivo userId={userId} />}
      />

      <div className="bo-stats">
        <StatCard label="Visitas hoy" value={items.length} foot={`${desagotes} ${desagotes === 1 ? 'desagote' : 'desagotes'}`} icon={CalendarDays} href={`/admin/itinerario/${hoy}`} tone="blue" />
        <StatCard label="Hechas" value={hechas} foot={items.length ? `${Math.round((hechas / items.length) * 100)}% del día` : 'sin visitas'} icon={CheckCircle2} tone="green" />
        <StatCard label="Faltan" value={faltan} foot="pendientes de hoy" icon={Hourglass} tone="amber" />
        <StatCard label="Ventas este mes" value={ventasMes ?? 0} foot="ventas manuales" icon={ShoppingBag} href="/admin/ventas" tone="purple" />
      </div>

      <HoyDueno hoy={hoy} filas={filas} team={team} piletas={piletas} autos={autos.filter((v) => v.is_active).map((v) => ({ id: v.id, name: v.name }))} />

      {atrasos.length > 0 && (
        <Panel className="mt-5" testId="sin-hacer">
          <PanelHeader
            icon={AlertTriangle}
            title="Quedaron sin hacer"
            sub="Visitas de las últimas dos semanas que siguen pendientes. Tocá una para registrarla o reprogramarla desde su día."
            bordered
          />
          <div className="bo-rows">
            {atrasos.map((a) => (
              <Link key={a.id} href={`/admin/itinerario/visita/${a.id}`} className="bo-row">
                <span className="text-xs font-semibold text-muted-foreground w-24 shrink-0 bo-capitalize">{formatDateAR(a.fecha, { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-foreground">
                  <strong>{a.pool?.profiles?.full_name ?? 'Sin cliente'}</strong> · {lugarDe(a.pool)}
                </span>
                <StatusBadge tone="amber">Pendiente</StatusBadge>
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { role } = mapSupabaseUserToAppUser(user);
  if (role === 'owner' || role === 'super_admin') return <DashboardDueno userId={user.id} />;
  return <DashboardGeneral />;
}
