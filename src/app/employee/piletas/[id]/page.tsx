import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { MapPin, User, CheckCircle2, XCircle, SkipForward, Car, Lock, ClipboardList, UserCheck } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, StatusBadge, Note, type BadgeTone } from '@/components/admin/bo';
import { todayInArgentina, addDays, formatDateAR } from '@/lib/dates';
import { SERVICE_TYPE_LABEL, formatChlorine, type ServiceType } from '@/lib/chlorine';
import { comoLlegarUrl } from '@/lib/maps';
import { VisitaAcciones } from './MarcarPiletaForm';
import { RegistroCard, type Registro } from './RegistroForm';
import { CobroPanel, type Cobro } from './CobroPanel';

const EDIT_DAYS = 7;

async function getVisit(itemId: string, userId: string) {
  const supabase = await createSupabaseServerClient();

  // La base devuelve la visita solo si le toca a este empleado (su auto, o sin auto para todos / para él)
  const { data: item } = await supabase
    .from('itinerary_items')
    .select(`
      id, status, status_note, completed_at, service_type, assigned_employee_id,
      itinerary_days (date),
      vehicles (name),
      pools (
        nickname, address, neighborhood, city, lat, lng, pool_type, notes,
        profiles!pools_client_id_fkey (full_name)
      )
    `)
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return null;

  const [{ data: logs }, { data: pagos }] = await Promise.all([
    supabase
      .from('service_logs')
      .select('id, employee_id, created_at, updated_at, chlorine_type, chlorine_amount, notes')
      .eq('itinerary_item_id', itemId)
      .order('created_at'),
    // El empleado ve solo los cobros que anotó él (RLS)
    supabase.from('payments').select('id, amount_cents, status, received_by, created_at, notes').eq('itinerary_item_id', itemId).order('created_at'),
  ]);
  const cobros: Cobro[] = (pagos ?? []).map((p) => ({
    id: p.id as string,
    amountCents: Number(p.amount_cents),
    conEmpleado: p.status === 'con_empleado',
    mio: p.received_by === userId,
    hora: new Date(p.created_at as string).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }),
    nota: (p.notes as string | null) ?? null,
  }));

  const assignee = (item.assigned_employee_id as string | null) ?? null;
  const authorIds = [...new Set([...(logs ?? []).map((l) => l.employee_id as string), ...(assignee ? [assignee] : [])])].filter((id) => id !== userId);
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data } = await supabase.rpc('team_names', { p_ids: authorIds });
    for (const n of (data ?? []) as { id: string; full_name: string }[]) names.set(n.id, n.full_name);
  }

  const registros: Registro[] = (logs ?? []).map((l) => ({
    id: l.id as string,
    isMine: l.employee_id === userId,
    author: l.employee_id === userId ? 'Vos' : names.get(l.employee_id as string) ?? 'Un compañero',
    time: new Date(l.created_at as string).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }),
    edited: new Date(l.updated_at as string).getTime() - new Date(l.created_at as string).getTime() > 1000,
    chlorineType: (l.chlorine_type as string | null) ?? null,
    chlorineAmount: l.chlorine_amount === null ? null : Number(l.chlorine_amount),
    chlorineText: formatChlorine(l.chlorine_type as string | null, l.chlorine_amount as number | null),
    notes: (l.notes as string | null) ?? null,
  }));

  const pool = item.pools as unknown as {
    nickname: string | null; address: string | null; neighborhood: string | null; city: string | null;
    lat: number | null; lng: number | null; pool_type: string | null; notes: string | null;
    profiles: { full_name: string } | null;
  } | null;

  return {
    item,
    pool,
    date: (item.itinerary_days as unknown as { date: string }).date,
    vehicle: (item.vehicles as unknown as { name: string } | null)?.name ?? null,
    registros,
    cobros,
    // "Lo tiene que hacer X": null = cualquiera del auto
    encargado: assignee ? { esMio: assignee === userId, nombre: assignee === userId ? 'vos' : names.get(assignee) ?? 'un compañero' } : null,
  };
}

const statusLabel: Record<string, string> = {
  done: 'Hecha', skipped: 'Salteada', no_client: 'No estaba el cliente', pending: 'Pendiente',
};
const statusTone: Record<string, BadgeTone> = {
  done: 'green', skipped: 'amber', no_client: 'red', pending: 'gray',
};
const poolTypeLabel: Record<string, string> = {
  fibra: 'Fibra', hormigon: 'Hormigón', liner: 'Liner', otro: 'Otro',
};

type Props = { params: Promise<{ id: string }> };

export default async function MarcarPiletaPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const data = await getVisit(id, user.id);
  if (!data) notFound();

  const { item, pool, date, vehicle, registros, cobros, encargado } = data;
  const client = pool?.profiles;
  const today = todayInArgentina();
  const isFuture = date > today;
  const isTooOld = date < addDays(today, -EDIT_DAYS);
  // Si la visita tiene encargado, solo esa persona la registra o la marca
  const deOtro = encargado !== null && !encargado.esMio;
  const canEdit = !isFuture && !isTooOld;
  const serviceType = (item.service_type as ServiceType) ?? 'service';
  const back = date === today ? '/employee/itinerario' : `/employee/itinerario?fecha=${date}`;
  const title = pool?.nickname || pool?.address || client?.full_name || 'Pileta';

  const mapsUrl = pool ? comoLlegarUrl(pool) : null;

  return (
    <div>
      <PageHeader
        back={{ href: back, label: 'Volver al itinerario' }}
        eyebrow={formatDateAR(date)}
        title={title}
        description={pool?.nickname ? pool.address : undefined}
        actions={
          <StatusBadge tone={statusTone[item.status as string] ?? 'gray'}>
            {statusLabel[item.status as string] ?? item.status}
          </StatusBadge>
        }
      />

      {/* Datos de la pileta */}
      <Panel className="bo-panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge tone={serviceType === 'desagote' ? 'purple' : 'blue'}>{SERVICE_TYPE_LABEL[serviceType]}</StatusBadge>
          {vehicle && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Car className="w-3.5 h-3.5" />
              {vehicle}
            </span>
          )}
        </div>
        <div className="space-y-2 text-sm">
          {client && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4 shrink-0" />
              <span>{client.full_name}</span>
            </div>
          )}
          {pool?.address && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>{[pool.address, pool.neighborhood, pool.city].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {pool?.pool_type && (
            <p className="text-xs text-muted-foreground pl-6">
              {poolTypeLabel[pool.pool_type] ?? pool.pool_type}
            </p>
          )}
          {pool?.notes && (
            <p className="text-xs text-muted-foreground pl-6 italic">{pool.notes}</p>
          )}
        </div>

        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bo-btn mt-4 w-full"
          >
            <MapPin />
            Cómo llegar
          </a>
        )}
      </Panel>

      {/* Estado de la visita (si ya se resolvió) */}
      {item.status !== 'pending' && (
        <div className={`rounded-[0.625rem] border p-5 text-center mb-4 ${
          item.status === 'done' ? 'bg-[#eef6f1] border-[#cfe6da]' :
          item.status === 'no_client' ? 'bg-[#fbefef] border-[#efd0d2]' :
          'bg-[#fcf5e8] border-[#efe2c6]'
        }`}>
          {item.status === 'done' && <CheckCircle2 className="w-8 h-8 text-[#28745b] mx-auto mb-2" />}
          {item.status === 'no_client' && <XCircle className="w-8 h-8 text-[#ad4d52] mx-auto mb-2" />}
          {item.status === 'skipped' && <SkipForward className="w-8 h-8 text-[#93671f] mx-auto mb-2" />}
          <p className="font-bold text-foreground">{statusLabel[item.status as string]}</p>
          {item.completed_at && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(item.completed_at as string).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}
            </p>
          )}
          {item.status_note && (
            <p className="text-sm text-foreground mt-2 italic whitespace-pre-line" data-testid="visita-motivo">“{item.status_note as string}”</p>
          )}
        </div>
      )}

      {/* Qué se puede hacer */}
      {isFuture && (
        <Note icon={Lock} className="mb-4">Esta visita es de un día que todavía no llegó: la vas a poder marcar ese día.</Note>
      )}
      {isTooOld && (
        <Note icon={Lock} className="mb-4">Pasaron más de 7 días: esta visita ya no se puede cambiar desde la app. Si hay que corregir algo, avisale al dueño.</Note>
      )}
      {encargado && (
        <Note icon={UserCheck} className="mb-4">
          <span data-testid="visita-encargado">
            {encargado.esMio
              ? <>Esta pileta <strong>te toca a vos</strong>: el dueño te la asignó.</>
              : <>Esta pileta <strong>le toca a {encargado.nombre}</strong>: solo esa persona la puede marcar.</>}
          </span>
        </Note>
      )}
      {canEdit && !deOtro && <VisitaAcciones itemId={item.id as string} status={item.status as string} nombre={title} />}

      {/* Registros de la visita (puede haber más de uno si fueron dos personas) */}
      {registros.length > 0 && (
        <Panel className="mt-4">
          <PanelHeader icon={ClipboardList} title="Registros de esta visita" bordered />
          <div className="bo-rows" data-testid="registros">
            {registros.map((r) => (
              <RegistroCard key={r.id} registro={r} canEdit={canEdit && r.isMine} />
            ))}
          </div>
        </Panel>
      )}

      {/* Cobré: solo el monto que le dieron (nunca precios ni deuda) */}
      <CobroPanel itemId={item.id as string} cobros={cobros} puedeAnotar={canEdit && !deOtro} />
    </div>
  );
}
