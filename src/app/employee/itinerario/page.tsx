import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MapPin, CheckCircle2, Clock, Navigation, Car, ChevronLeft, ChevronRight, Droplets, Route, UserCheck, Users } from 'lucide-react';
import { PageHeader, Panel, StatusBadge, EmptyState, type BadgeTone } from '@/components/admin/bo';
import { EnVivo } from '@/components/layout/EnVivo';
import { todayInArgentina, addDays, isIsoDate, formatDateAR } from '@/lib/dates';
import { SERVICE_TYPE_LABEL, formatChlorine, type ServiceType } from '@/lib/chlorine';
import { comoLlegarUrl, rutaCompleta } from '@/lib/maps';
import { AccionesRuta } from '../piletas/[id]/MarcarPiletaForm';
import { CampoPanel } from './CampoPanel';
import type { PiletaParaAgregar } from '@/app/admin/itinerario/[fecha]/AgregarPiletas';
import { esDeSuDia, esModoCampo } from '@/lib/campo';
import { embedOne } from '@/lib/clients';
import { mapSupabaseUserToAppUser } from '@/lib/supabase/user';

// Se marcan las visitas de hoy y de los 7 días anteriores
const DAYS_TO_MARK = 7;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type Visit = {
  itemId: string;
  orden: number;
  status: string;
  statusNote: string | null;
  serviceType: ServiceType;
  nickname: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  clientName: string;
  /** "Lo tiene que hacer X": null = cualquiera del auto; esMio = a este empleado */
  encargado: { esMio: boolean; nombre: string } | null;
  /** Cloro de los registros de la visita ("Granulado · 300 g", "Sin cloro"), si ya está hecha */
  cloro: string[];
};

async function getDay(supabase: Supabase, userId: string, date: string, campo: boolean) {
  const { data: day } = await supabase.from('itinerary_days').select('id').eq('date', date).maybeSingle();
  if (!day) return { visits: [] as Visit[], vehicle: null as string | null, vehicleId: null as string | null, mates: [] as string[] };

  // El auto en el que va ese día y sus compañeros
  const { data: crew } = await supabase
    .from('itinerary_day_crews')
    .select('vehicle_id, vehicles(name)')
    .eq('itinerary_day_id', day.id)
    .eq('employee_id', userId)
    .maybeSingle();
  let vehicle: string | null = null;
  const vehicleId = (crew?.vehicle_id as string | undefined) ?? null;
  let mates: string[] = [];
  if (crew) {
    vehicle = (crew.vehicles as unknown as { name: string } | null)?.name ?? null;
    const { data: others } = await supabase
      .from('itinerary_day_crews')
      .select('employee_id')
      .eq('itinerary_day_id', day.id)
      .eq('vehicle_id', crew.vehicle_id)
      .neq('employee_id', userId);
    const ids = (others ?? []).map((o) => o.employee_id as string);
    if (ids.length) {
      const { data: names } = await supabase.rpc('team_names', { p_ids: ids });
      mates = ((names ?? []) as { full_name: string }[]).map((n) => n.full_name);
    }
  }

  // La base devuelve solo las visitas que le tocan: las de su auto, o las sin auto para todos / para él.
  // En modo campo (dueño) la base devuelve todo el día: se aplica la misma regla acá.
  const { data: rawItems } = await supabase
    .from('itinerary_items')
    .select(`
      id, sort_order, status, status_note, service_type, assigned_employee_id, vehicle_id,
      pools (
        nickname, address, neighborhood, city, lat, lng,
        profiles!pools_client_id_fkey (full_name)
      )
    `)
    .eq('itinerary_day_id', day.id)
    .order('sort_order');
  const items = campo
    ? (rawItems ?? []).filter((i) => esDeSuDia({ vehicle_id: i.vehicle_id as string | null, assigned_employee_id: i.assigned_employee_id as string | null }, vehicleId, userId))
    : rawItems;

  const itemIds = (items ?? []).map((i) => i.id as string);
  const otros = [...new Set((items ?? []).map((i) => i.assigned_employee_id as string | null).filter((x): x is string => !!x && x !== userId))];
  const [{ data: names }, { data: logs }] = await Promise.all([
    otros.length ? supabase.rpc('team_names', { p_ids: otros }) : Promise.resolve({ data: [] }),
    itemIds.length
      ? supabase.from('service_logs').select('itinerary_item_id, chlorine_type, chlorine_amount').in('itinerary_item_id', itemIds).order('created_at')
      : Promise.resolve({ data: [] }),
  ]);
  const nombres = new Map(((names ?? []) as { id: string; full_name: string }[]).map((n) => [n.id, n.full_name]));
  const cloroPorVisita = new Map<string, string[]>();
  for (const l of (logs ?? []) as { itinerary_item_id: string; chlorine_type: string | null; chlorine_amount: number | null }[]) {
    const list = cloroPorVisita.get(l.itinerary_item_id) ?? [];
    list.push(formatChlorine(l.chlorine_type, l.chlorine_amount) ?? 'Sin cloro');
    cloroPorVisita.set(l.itinerary_item_id, list);
  }

  const visits = (items ?? []).map((item, idx) => {
    const asignado = (item.assigned_employee_id as string | null) ?? null;
    const pool = item.pools as unknown as {
      nickname: string | null; address: string | null; neighborhood: string | null; city: string | null;
      lat: number | null; lng: number | null; profiles: { full_name: string } | null;
    } | null;
    return {
      itemId: item.id as string,
      orden: idx + 1,
      status: item.status as string,
      statusNote: (item.status_note as string | null) ?? null,
      serviceType: (item.service_type as ServiceType) ?? 'service',
      nickname: pool?.nickname ?? null,
      address: pool?.address ?? null,
      neighborhood: pool?.neighborhood ?? null,
      city: pool?.city ?? null,
      lat: pool?.lat ?? null,
      lng: pool?.lng ?? null,
      clientName: pool?.profiles?.full_name ?? 'Cliente',
      encargado: asignado ? { esMio: asignado === userId, nombre: asignado === userId ? 'vos' : nombres.get(asignado) ?? 'un compañero' } : null,
      cloro: cloroPorVisita.get(item.id as string) ?? [],
    };
  });
  return { visits, vehicle, vehicleId, mates };
}

/** Para el modo campo: autos activos y piletas activas (para "Agregar a mi día"). */
async function getCampo(supabase: Supabase, date: string) {
  const [{ data: autos }, { data: pools }, { data: day }] = await Promise.all([
    supabase.from('vehicles').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    supabase
      .from('pools')
      .select('id, nickname, address, neighborhood, profiles!pools_client_id_fkey(full_name, client_profiles(client_number))')
      .eq('is_active', true)
      .limit(5000),
    supabase.from('itinerary_days').select('itinerary_items(pool_id)').eq('date', date).maybeSingle(),
  ]);
  const hoy = new Set(((day?.itinerary_items ?? []) as { pool_id: string }[]).map((i) => i.pool_id));
  type PoolRow = {
    id: string; nickname: string | null; address: string | null; neighborhood: string | null;
    profiles: { full_name: string | null; client_profiles: { client_number: number | null } | { client_number: number | null }[] | null } | null;
  };
  const piletas: PiletaParaAgregar[] = ((pools ?? []) as unknown as PoolRow[]).map((p) => ({
    id: p.id,
    numero: embedOne(p.profiles?.client_profiles)?.client_number ?? null,
    cliente: p.profiles?.full_name ?? 'Sin cliente',
    lugar: p.address || p.nickname || 'Sin dirección',
    barrio: p.neighborhood,
    yaEn: hoy.has(p.id) ? 'el día de hoy' : null,
    semanaPasada: false,
  }));
  return { autos: (autos ?? []) as { id: string; name: string }[], piletas };
}

const statusLabel: Record<string, string> = {
  pending: 'Pendiente', done: 'Hecha', skipped: 'Salteada', no_client: 'No estaba',
};
const statusTone: Record<string, BadgeTone> = {
  pending: 'gray', done: 'green', skipped: 'amber', no_client: 'red',
};

function relativeDay(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === addDays(today, 1)) return 'Mañana';
  if (date === addDays(today, -1)) return 'Ayer';
  const diff = Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
  return diff > 0 ? `En ${diff} días` : `Hace ${-diff} días`;
}

/** La tarjeta de una pileta en la ruta: datos, estado y, si está pendiente y le toca, los botones para marcarla. */
function VisitaCard({ v, canMark }: { v: Visit; canMark: boolean }) {
  const isPending = v.status === 'pending';
  const isDone = v.status === 'done';
  const deOtro = v.encargado !== null && !v.encargado.esMio;
  const nombre = v.nickname || v.address || v.clientName;
  const mapsUrl = comoLlegarUrl(v);
  const detail = `/employee/piletas/${v.itemId}`;

  return (
    <Panel as="div" testId="visita" className={!isPending && !isDone ? 'opacity-80' : undefined}>
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        {/* Número de orden o tilde si ya está hecha */}
        <span
          className={`grid place-items-center w-9 h-9 rounded-full shrink-0 text-sm font-bold ${
            isDone ? 'bg-[#2b9270] text-white' : 'bg-accent text-primary'
          }`}
        >
          {isDone ? <CheckCircle2 className="w-5 h-5" /> : v.orden}
        </span>

        {/* Info (toca para abrir la pileta) */}
        <Link href={detail} className="flex-1 min-w-0" data-testid="visita-abrir">
          <p className="font-semibold text-foreground text-[15px] leading-snug">{nombre}</p>
          <p className="text-xs text-muted-foreground truncate">
            {v.clientName}
            {v.neighborhood ? ` · ${v.neighborhood}` : ''}
          </p>
          {v.nickname && v.address && (
            <p className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {v.address}
            </p>
          )}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={v.serviceType === 'desagote' ? 'purple' : 'blue'}>{SERVICE_TYPE_LABEL[v.serviceType]}</StatusBadge>
            {!isPending && <StatusBadge tone={statusTone[v.status] ?? 'gray'}>{statusLabel[v.status] ?? v.status}</StatusBadge>}
            {deOtro && (
              <span data-testid="ruta-encargado" className="text-xs font-semibold text-[#705498]">Le toca a {v.encargado!.nombre}</span>
            )}
          </span>
          {isDone && v.cloro.length > 0 && (
            <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" data-testid="visita-cloro">
              <Droplets className="w-3.5 h-3.5 text-primary shrink-0" />
              {v.cloro.join(' + ')}
            </span>
          )}
          {v.statusNote && !isPending && !isDone && (
            <span className="mt-1 block text-xs italic text-muted-foreground" data-testid="visita-motivo">“{v.statusNote}”</span>
          )}
        </Link>

        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="bo-icon-btn shrink-0 !h-11 !w-11" title="Cómo llegar" aria-label="Cómo llegar">
            <Navigation />
          </a>
        )}
      </div>

      {isPending && canMark && !deOtro && (
        <div className="px-4 pb-3.5">
          <AccionesRuta itemId={v.itemId} nombre={nombre} />
        </div>
      )}
    </Panel>
  );
}

function Bloque({ titulo, icon: Icon, visits, canMark, testId }: {
  titulo: string; icon: typeof Users; visits: Visit[]; canMark: boolean; testId: string;
}) {
  if (visits.length === 0) return null;
  const hechas = visits.filter((v) => v.status === 'done').length;
  return (
    <section className="mb-6" data-testid={testId}>
      <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="w-4 h-4" />
        {titulo}
        <span className="ml-auto text-xs font-semibold normal-case tracking-normal">{hechas} de {visits.length}</span>
      </h2>
      <div className="space-y-2.5">
        {visits.map((v) => <VisitaCard key={v.itemId} v={v} canMark />)}
      </div>
    </section>
  );
}

type Props = { searchParams: Promise<{ fecha?: string }> };

export default async function EmployeeItinerarioPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = todayInArgentina();
  // El empleado ve solo su día: hoy y, para cerrar lo que quedó, hasta 7 días atrás. Nunca días que no llegaron.
  const minDate = addDays(today, -DAYS_TO_MARK);
  const maxDate = today;
  const { fecha } = await searchParams;
  const date = isIsoDate(fecha) && fecha >= minDate && fecha <= maxDate ? fecha : today;
  const isToday = date === today;
  const hrefFor = (d: string) => (d === today ? '/employee/itinerario' : `/employee/itinerario?fecha=${d}`);

  const campo = esModoCampo(mapSupabaseUserToAppUser(user).role);
  const { visits, vehicle, vehicleId, mates } = await getDay(supabase, user.id, date, campo);
  const datosCampo = campo && isToday ? await getCampo(supabase, date) : null;

  const mias = visits.filter((v) => v.encargado?.esMio);
  const delEquipo = visits.filter((v) => !v.encargado?.esMio);
  // El avance cuenta lo que le toca a él: las suyas y las que puede hacer cualquiera del auto (no las de un compañero)
  const tuyas = visits.filter((v) => v.encargado === null || v.encargado.esMio);
  const done = tuyas.filter((p) => p.status === 'done').length;
  const resueltas = tuyas.filter((p) => p.status !== 'pending').length;
  const pending = tuyas.length - resueltas;
  // El total del auto, solo si es distinto de lo suyo
  const autoHechas = visits.filter((p) => p.status === 'done').length;
  const mostrarAuto = tuyas.length !== visits.length;
  const autoPendientes = visits.filter((p) => p.status === 'pending').length;
  // La ruta completa en Maps: TODAS las pendientes del auto (el que maneja lleva también a los compañeros), en el orden del recorrido
  const tramos = rutaCompleta(visits.filter((v) => v.status === 'pending'));

  return (
    <div>
      <PageHeader
        eyebrow={relativeDay(date, today)}
        title={formatDateAR(date)}
        actions={<EnVivo userId={user.id} />}
      />

      {/* Cambiar de día */}
      <nav className="flex items-center gap-2 -mt-3 mb-4" aria-label="Cambiar de día">
        {date > minDate ? (
          <Link href={hrefFor(addDays(date, -1))} className="bo-icon-btn !h-11 !w-11" title="Día anterior" aria-label="Día anterior" data-testid="dia-anterior">
            <ChevronLeft />
          </Link>
        ) : (
          <span className="bo-icon-btn !h-11 !w-11 opacity-40" aria-hidden="true"><ChevronLeft /></span>
        )}
        {!isToday && (
          <Link href="/employee/itinerario" className="bo-btn !h-11">Volver a hoy</Link>
        )}
        {date < maxDate && (
          <Link href={hrefFor(addDays(date, 1))} className="bo-icon-btn !h-11 !w-11" title="Día siguiente" aria-label="Día siguiente" data-testid="dia-siguiente">
            <ChevronRight />
          </Link>
        )}
      </nav>

      {datosCampo && <CampoPanel fecha={date} autos={datosCampo.autos} miAuto={vehicleId} piletas={datosCampo.piletas} />}
      {campo && !isToday && (
        <p className="mb-4 text-xs text-muted-foreground" data-testid="modo-campo-otro-dia">
          Modo campo: para sumarte a un auto o agregar piletas, volvé a hoy.
        </p>
      )}

      {/* Tarjeta del día: con quién vas y cuánto llevás */}
      {(vehicle || visits.length > 0) && (
        <Panel className="bo-panel-pad mb-5" testId="tarjeta-dia">
          {vehicle ? (
            <p className="flex items-center gap-2 text-[15px] text-foreground" data-testid="mi-auto">
              <Car className="w-5 h-5 text-primary shrink-0" />
              <span>
                Vas en <strong>{vehicle}</strong>
                {mates.length > 0 ? <> con {mates.join(', ')}</> : null}
              </span>
            </p>
          ) : null}
          {tuyas.length > 0 && (
            <div className={vehicle ? 'mt-3' : undefined} data-testid="avance">
              <p className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-foreground tabular-nums">{done} de {tuyas.length}</span>
                <span className="text-sm text-muted-foreground">{mostrarAuto ? (tuyas.length === 1 ? 'tuya hecha' : 'tuyas hechas') : (tuyas.length === 1 ? 'pileta hecha' : 'piletas hechas')}</span>
                {pending > 0 && <span className="ml-auto text-sm font-semibold text-primary">Te quedan {pending}</span>}
              </p>
              <div className="mt-2 w-full bg-[#e3eaf1] rounded-full h-2.5" aria-hidden="true">
                <div className="bg-[#2b9270] h-2.5 rounded-full transition-all duration-500" style={{ width: `${(resueltas / tuyas.length) * 100}%` }} />
              </div>
            </div>
          )}
          {mostrarAuto && (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="avance-auto">
              {vehicle ? `En ${vehicle}` : 'Del equipo'}: {autoHechas} de {visits.length} hechas
            </p>
          )}
          {tramos.length > 0 && (
            <div className="mt-4 grid gap-2" data-testid="ruta-completa">
              {tramos.map((t, i) => (
                <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="bo-btn bo-btn-primary !h-12 w-full">
                  <Route />
                  {tramos.length === 1 ? 'Abrir la ruta completa' : `Abrir la ruta completa: parte ${i + 1} (paradas ${t.desde} a ${t.hasta})`}
                </a>
              ))}
            </div>
          )}
        </Panel>
      )}

      {visits.length === 0 ? (
        <Panel>
          <EmptyState icon={Clock}>
            <p className="font-medium text-foreground">
              {isToday ? 'No hay piletas asignadas para hoy' : 'No hay piletas para este día'}
            </p>
            <p className="mt-1">{campo ? (isToday ? 'Sumate a un auto o tocá Agregar a mi día' : 'Ese día no ibas en ningún auto') : 'El itinerario lo carga el dueño'}</p>
          </EmptyState>
        </Panel>
      ) : (
        <div data-testid="ruta">
          {mias.length > 0 ? (
            <>
              <Bloque titulo="Te tocan a vos" icon={UserCheck} visits={mias} canMark testId="bloque-mias" />
              <Bloque titulo="Del equipo" icon={Users} visits={delEquipo} canMark testId="bloque-equipo" />
            </>
          ) : (
            <Bloque titulo="Piletas del día" icon={Users} visits={delEquipo} canMark testId="bloque-equipo" />
          )}
        </div>
      )}

      {/* Mensaje de fin de jornada */}
      {visits.length > 0 && autoPendientes === 0 && (
        <div className="mt-2 rounded-[0.625rem] border border-[#cfe6da] bg-[#eef6f1] p-5 text-center text-[#28745b]">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
          <p className="font-display font-bold text-lg">¡Jornada completa!</p>
          <p className="text-sm mt-1">Todas las piletas del día marcadas</p>
        </div>
      )}
    </div>
  );
}
