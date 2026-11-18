import { createSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight, CalendarDays, Car, UserCheck } from 'lucide-react';
import { EnVivo } from '@/components/layout/EnVivo';
import { PageHeader, Panel, StatusBadge, type BadgeTone } from '@/components/admin/bo';
import { CopiarSemanaButton, NuevoAutoBoton, NuevoAutoCard } from './ItinerarioDayClient';
import { ItemControls } from './ItemControls';
import { CrewControls } from './CrewControls';
import { AgregarPiletas, type PiletaParaAgregar } from './AgregarPiletas';
import { PendientesRecordatorio, type PendienteSinReprogramar } from './PendientesRecordatorio';
import { SugerenciaBoton } from './SugerenciaBoton';
import { sugerirDia, type GrupoSugerido, type PoolSug, type VisitaSug } from '@/lib/sugerencia';
import { isFrequency } from '@/lib/ubicacion';
import { todayInArgentina, isIsoDate, addDays, formatDateAR } from '@/lib/dates';
import { embedOne } from '@/lib/clients';
import { SERVICE_TYPE_LABEL, type ServiceType } from '@/lib/chlorine';

type Item = {
  id: string;
  sort_order: number;
  status: string;
  status_note: string | null;
  service_type: ServiceType;
  vehicle_id: string | null;
  assigned_employee_id: string | null;
  pools: { id: string; nickname: string | null; address: string | null; neighborhood: string | null; profiles: { full_name: string } | null } | null;
};
type PendienteRow = {
  item_id: string; pool_id: string; date: string; status: string; status_note: string | null; service_type: string;
  client_name: string | null; client_number: number | null; nickname: string | null; address: string | null; neighborhood: string | null;
};
type Vehicle = { id: string; name: string; plate: string | null; is_active: boolean };
type Crew = { id: string; vehicle_id: string; employee_id: string };
type Person = { id: string; full_name: string; role: string; status: string };
type PoolRow = {
  id: string; nickname: string | null; address: string | null; neighborhood: string | null;
  frequency: string; lat: number | string | null; lng: number | string | null;
  profiles: { full_name: string; client_profiles: unknown } | null;
};

async function getDayData(fecha: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: day }, { data: activePools }, { data: vehicles }, { data: staff }, { data: lastWeek }] = await Promise.all([
    supabase
      .from('itinerary_days')
      .select(`
        id, date, notes,
        itinerary_items (
          id, sort_order, status, status_note, service_type, vehicle_id, assigned_employee_id,
          pools (id, nickname, address, neighborhood,
            profiles!pools_client_id_fkey (full_name)
          )
        ),
        itinerary_day_crews (id, vehicle_id, employee_id)
      `)
      .eq('date', fecha)
      .maybeSingle(),
    supabase
      .from('pools')
      .select('id, nickname, address, neighborhood, frequency, lat, lng, profiles!pools_client_id_fkey(full_name, client_profiles(client_number))')
      .eq('is_active', true),
    supabase.from('vehicles').select('id, name, plate, is_active').order('sort_order').order('name'),
    supabase.from('profiles').select('id, full_name, role, status').in('role', ['employee', 'owner', 'super_admin']).order('full_name'),
    supabase.from('itinerary_days').select('itinerary_items(pool_id, vehicle_id)').eq('date', addDays(fecha, -7)).maybeSingle(),
  ]);

  // Recordatorio: visitas sin hacer de la semana anterior que nadie volvió a agendar (solo al armar hoy o días que vienen)
  let pendientes: PendienteSinReprogramar[] = [];
  let pendientesRaw: PendienteRow[] = [];
  let visitasCerca: VisitaSug[] = [];
  if (fecha >= todayInArgentina()) {
    const [{ data: sin }, { data: cerca }] = await Promise.all([
      supabase.rpc('pendientes_sin_reprogramar', { p_fecha: fecha }),
      // Para la sugerencia: 5 semanas para atrás y unos días para adelante
      supabase
        .from('itinerary_items')
        .select('pool_id, status, vehicle_id, sort_order, itinerary_days!inner(date)')
        .gte('itinerary_days.date', addDays(fecha, -35))
        .lte('itinerary_days.date', addDays(fecha, 3))
        .neq('itinerary_days.date', fecha)
        .limit(20000),
    ]);
    pendientesRaw = (sin ?? []) as PendienteRow[];
    visitasCerca = ((cerca ?? []) as unknown as { pool_id: string; status: string; vehicle_id: string | null; sort_order: number; itinerary_days: { date: string } | { date: string }[] }[])
      .map((i) => ({ poolId: i.pool_id, date: embedOne(i.itinerary_days)!.date, status: i.status, vehicleId: i.vehicle_id, sortOrder: i.sort_order }));
    pendientes = pendientesRaw.map((r) => ({
      itemId: r.item_id,
      fecha: r.date,
      estado: r.status === 'skipped' ? 'Salteada' : r.status === 'no_client' ? 'No estaba el cliente' : 'Quedó pendiente',
      nota: r.status_note,
      desagote: r.service_type === 'desagote',
      numero: r.client_number,
      cliente: r.client_name ?? 'Sin cliente',
      lugar: [r.address || r.nickname || 'Sin dirección', r.neighborhood].filter(Boolean).join(', '),
    }));
  }

  const items = ((day?.itinerary_items ?? []) as unknown as Item[]).sort((a, b) => a.sort_order - b.sort_order);
  const crews = (day?.itinerary_day_crews ?? []) as Crew[];

  // Quién registró cada visita
  const authors = new Map<string, string[]>();
  if (items.length) {
    const { data: logs } = await supabase
      .from('service_logs')
      .select('itinerary_item_id, employee_id')
      .in('itinerary_item_id', items.map((i) => i.id))
      .order('created_at');
    for (const l of logs ?? []) {
      const list = authors.get(l.itinerary_item_id as string) ?? [];
      if (!list.includes(l.employee_id as string)) list.push(l.employee_id as string);
      authors.set(l.itinerary_item_id as string, list);
    }
  }

  const semanaPasada = new Map<string, string | null>();
  for (const i of ((lastWeek?.itinerary_items ?? []) as { pool_id: string; vehicle_id: string | null }[])) semanaPasada.set(i.pool_id, i.vehicle_id);

  return {
    items, crews, authors, semanaPasada, pendientes, pendientesRaw, visitasCerca,
    pools: (activePools ?? []) as unknown as PoolRow[],
    vehicles: (vehicles ?? []) as Vehicle[],
    staff: (staff ?? []) as Person[],
  };
}

const statusLabel: Record<string, string> = {
  pending: 'Pendiente', done: 'Hecho', skipped: 'Salteado', no_client: 'No estaba',
};
const statusTone: Record<string, BadgeTone> = {
  pending: 'amber', done: 'green', skipped: 'gray', no_client: 'red',
};
// Franja a la izquierda de cada visita, del mismo color que su estado
const statusEdge: Record<string, string> = {
  pending: '#d9b05d', done: '#4a9d7f', skipped: '#c3cfdb', no_client: '#d48a8e',
};

type Props = { params: Promise<{ fecha: string }> };

export default async function ItinerarioDayPage({ params }: Props) {
  const { fecha } = await params;
  if (!isIsoDate(fecha)) notFound();
  const { items, crews, authors, semanaPasada, pendientes, pendientesRaw, visitasCerca, pools, vehicles, staff: team } = await getDayData(fecha);
  // Quienes pueden ir en un auto o ser encargados: empleados y el dueño (no bloqueados)
  const staff = team.filter((p) => (p.role === 'employee' || p.role === 'owner') && p.status !== 'blocked');

  const todayStr = todayInArgentina();
  const done = items.filter((i) => i.status === 'done').length;
  const desagotes = items.filter((i) => i.service_type === 'desagote').length;

  // Autos que se muestran: todos los activos y cualquiera que ya tenga visitas o gente ese día
  const used = new Set([...items.map((i) => i.vehicle_id), ...crews.map((c) => c.vehicle_id)].filter(Boolean));
  const shownVehicles = vehicles.filter((v) => v.is_active || used.has(v.id));
  const nameOf = new Map(team.map((p) => [p.id, p.full_name]));
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));

  // Grupos en el orden en que se ven; la ruta de cada auto es el orden de sus visitas
  const groups = [
    ...shownVehicles.map((v) => ({ key: v.id, vehicle: v as Vehicle | null, items: items.filter((i) => i.vehicle_id === v.id) })),
    { key: 'none', vehicle: null as Vehicle | null, items: items.filter((i) => !i.vehicle_id || !shownVehicles.some((v) => v.id === i.vehicle_id)) },
  ];
  const orderedIds = groups.flatMap((g) => g.items.map((i) => i.id));
  const vehicleOptions = shownVehicles.filter((v) => v.is_active || used.has(v.id)).map((v) => ({ id: v.id, name: v.name }));

  // Piletas para el botón "Agregar piletas" de cada auto
  const enElDia = new Map(items.map((i) => [i.pools?.id ?? '', i.vehicle_id ? vehicleName.get(i.vehicle_id) ?? 'otro auto' : 'Sin auto']));
  const piletasBase = pools.map((p) => {
    const cp = embedOne(p.profiles?.client_profiles as { client_number: number | null } | null);
    return {
      id: p.id,
      numero: cp?.client_number ?? null,
      cliente: p.profiles?.full_name ?? 'Sin cliente',
      lugar: p.address || p.nickname || 'Sin dirección',
      barrio: p.neighborhood,
      yaEn: enElDia.get(p.id) ?? null,
    };
  });
  const piletasPara = (vehicleId: string | null): PiletaParaAgregar[] =>
    piletasBase.map((p) => ({ ...p, semanaPasada: semanaPasada.has(p.id) && semanaPasada.get(p.id) === vehicleId }));

  // Sugerencia (sin IA): solo al armar hoy o un día que viene
  const autosActivos = vehicles.filter((v) => v.is_active).map((v) => ({ id: v.id, name: v.name }));
  const sugerencia: GrupoSugerido[] = fecha >= todayStr
    ? sugerirDia({
      fecha,
      pools: pools.map((p): PoolSug => {
        const b = piletasBase.find((x) => x.id === p.id)!;
        return {
          id: p.id, numero: b.numero, cliente: b.cliente, lugar: b.lugar, barrio: b.barrio,
          frequency: isFrequency(p.frequency) ? p.frequency : 'semanal',
          lat: p.lat === null ? null : Number(p.lat), lng: p.lng === null ? null : Number(p.lng),
        };
      }),
      visitas: visitasCerca,
      autos: autosActivos,
      enElDia: items.map((i) => ({ poolId: i.pools?.id ?? '', vehicleId: i.vehicle_id, sortOrder: i.sort_order })),
      pendientes: pendientesRaw.map((r) => ({
        poolId: r.pool_id, date: r.date,
        estado: r.status === 'skipped' ? 'Salteada' : r.status === 'no_client' ? 'No estaba el cliente' : 'Quedó pendiente',
      })),
    })
    : [];

  const resumenAutos = groups
    .filter((g) => g.vehicle || g.items.length > 0)
    .map((g) => `${g.vehicle?.name ?? 'Sin auto'}: ${g.items.length}`)
    .join(' · ');

  return (
    <div className="bo-page">
      <PageHeader
        back={{ href: '/admin/itinerario', label: 'Calendario' }}
        eyebrow={fecha === todayStr ? 'Hoy' : fecha < todayStr ? 'Día pasado' : 'Próximo día'}
        title={<span className="bo-capitalize">{formatDateAR(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>}
        description={items.length > 0
          ? `${items.length} ${items.length === 1 ? 'pileta' : 'piletas'} (${resumenAutos}) · ${desagotes} ${desagotes === 1 ? 'desagote' : 'desagotes'} · ${done} ${done === 1 ? 'hecha' : 'hechas'}`
          : 'Todavía no hay piletas para este día.'}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {fecha === todayStr && <EnVivo />}
            <Link href={`/admin/itinerario/${addDays(fecha, -1)}`} className="bo-btn" aria-label="Día anterior">
              <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Día anterior</span>
            </Link>
            {fecha !== todayStr && (
              <Link href={`/admin/itinerario/${todayStr}`} className="bo-btn">
                <CalendarDays className="w-4 h-4" /> Hoy
              </Link>
            )}
            <Link href={`/admin/itinerario/${addDays(fecha, 1)}`} className="bo-btn" aria-label="Día siguiente">
              <span className="hidden sm:inline">Día siguiente</span> <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        }
      />

      <PendientesRecordatorio fecha={fecha} pendientes={pendientes} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NuevoAutoBoton />
        <CopiarSemanaButton fecha={fecha} destacado={items.length === 0} />
        {fecha >= todayStr && <SugerenciaBoton fecha={fecha} grupos={sugerencia} autos={autosActivos} />}
        <p className="text-xs text-muted-foreground">
          Copia del {formatDateAR(addDays(fecha, -7), { weekday: 'long', day: 'numeric', month: 'long' })}: piletas, autos, tipo, encargado y quién iba en cada auto.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="itinerario-autos">
        {groups.map((group) => {
          const groupCrews = group.vehicle ? crews.filter((c) => c.vehicle_id === group.vehicle!.id) : [];
          const groupIds = group.items.map((i) => i.id);
          // Encargados posibles: primero los que van en el auto, después el resto del equipo
          const enAuto = new Set(groupCrews.map((c) => c.employee_id));
          const teamOptions = [...staff]
            .sort((a, b) => Number(enAuto.has(b.id)) - Number(enAuto.has(a.id)) || a.full_name.localeCompare(b.full_name, 'es'))
            .map((p) => ({ id: p.id, name: p.full_name, enAuto: !group.vehicle || enAuto.has(p.id) }));
          const desag = group.items.filter((i) => i.service_type === 'desagote').length;
          return (
            <Panel key={group.key} testId="itinerario-auto" className="flex flex-col">
              <div className="bo-panel-header bordered">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="bo-icon-tile blue"><Car /></span>
                  <div className="min-w-0">
                    <h2 className="bo-panel-title truncate">{group.vehicle ? group.vehicle.name : 'Sin auto'}</h2>
                    <p className="bo-panel-sub">
                      {group.items.length} {group.items.length === 1 ? 'visita' : 'visitas'}
                      {desag ? ` · ${desag} ${desag === 1 ? 'desagote' : 'desagotes'}` : ''}
                      {group.vehicle?.plate ? ` · ${group.vehicle.plate}` : ''}
                      {!group.vehicle ? ' · las ven todos los empleados' : ''}
                    </p>
                  </div>
                </div>
              </div>
              {group.vehicle && (
                <CrewControls
                  fecha={fecha}
                  vehicleId={group.vehicle.id}
                  members={groupCrews.map((c) => ({ crewId: c.id, name: nameOf.get(c.employee_id) ?? 'Sin nombre' }))}
                  candidates={staff
                    .filter((p) => !groupCrews.some((c) => c.employee_id === p.id))
                    .map((p) => {
                      const other = crews.find((c) => c.employee_id === p.id);
                      return { id: p.id, name: p.full_name, otherVehicle: other ? vehicleName.get(other.vehicle_id) ?? null : null };
                    })}
                />
              )}
              <div className="flex-1">
                {group.items.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">Sin piletas en {group.vehicle ? 'este auto' : 'este grupo'}.</p>
                ) : (
                  <ol className="bo-rows">
                    {group.items.map((item, idx) => {
                      const pool = item.pools;
                      const client = pool?.profiles;
                      const encargado = item.assigned_employee_id ? nameOf.get(item.assigned_employee_id) ?? 'Sin nombre' : null;
                      return (
                        <li
                          key={item.id}
                          data-testid="itinerario-item"
                          className="px-4 py-3 space-y-2"
                          style={{ boxShadow: `inset 3px 0 ${statusEdge[item.status] ?? 'transparent'}` }}
                        >
                          <div className="flex items-start gap-2.5">
                            <span data-testid="itinerario-orden" className="w-7 h-7 rounded-lg bg-accent text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0 tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <Link href={`/admin/itinerario/visita/${item.id}`} className="block text-sm font-semibold text-foreground truncate hover:text-primary hover:underline">
                                {pool?.nickname || pool?.address || client?.full_name}
                              </Link>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {client?.full_name}
                                {pool?.neighborhood ? ` · ${pool.neighborhood}` : ''}
                              </p>
                              {encargado && (
                                <p data-testid="itinerario-encargado" className="text-xs font-semibold text-[#705498] truncate mt-0.5 inline-flex items-center gap-1">
                                  <UserCheck className="w-3 h-3" /> Le toca a {encargado}
                                </p>
                              )}
                              {item.status_note && (item.status === 'skipped' || item.status === 'no_client') && (
                                <p data-testid="itinerario-motivo" className="text-xs italic text-muted-foreground mt-0.5 line-clamp-2">“{item.status_note}”</p>
                              )}
                              {authors.get(item.id) && (
                                <p data-testid="itinerario-hecho-por" className="text-xs text-[#28745b] truncate mt-0.5">
                                  Hecha por {authors.get(item.id)!.map((id) => nameOf.get(id) ?? 'Sin nombre').join(' y ')}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <StatusBadge tone={statusTone[item.status] ?? 'gray'}>{statusLabel[item.status] ?? item.status}</StatusBadge>
                              {item.service_type === 'desagote' && <StatusBadge tone="purple">{SERVICE_TYPE_LABEL.desagote}</StatusBadge>}
                            </div>
                          </div>
                          <ItemControls
                            fecha={fecha}
                            itemId={item.id}
                            orderedIds={orderedIds}
                            groupIds={groupIds}
                            vehicleId={group.vehicle?.id ?? null}
                            serviceType={item.service_type}
                            assigneeId={item.assigned_employee_id}
                            vehicles={vehicleOptions}
                            team={teamOptions}
                            canRemove={item.status !== 'done'}
                          />
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
              <div className="p-4 border-t border-border">
                <AgregarPiletas
                  fecha={fecha}
                  vehicleId={group.vehicle?.id ?? null}
                  vehicleName={group.vehicle?.name ?? 'Sin auto'}
                  piletas={piletasPara(group.vehicle?.id ?? null)}
                  testId={`agregar-piletas-${group.vehicle ? group.vehicle.name : 'sin-auto'}`}
                />
              </div>
            </Panel>
          );
        })}
        <NuevoAutoCard />
      </div>
    </div>
  );
}
