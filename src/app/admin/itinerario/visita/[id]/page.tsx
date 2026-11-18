import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { Car, ClipboardList, Lock, MapPin, Trash2, User, UserCheck } from 'lucide-react';
import { EnVivo } from '@/components/layout/EnVivo';
import { PageHeader, Panel, PanelHeader, StatusBadge, Note, type BadgeTone } from '@/components/admin/bo';
import { isUuid } from '@/lib/validators';
import { todayInArgentina, formatDateAR } from '@/lib/dates';
import { SERVICE_TYPE_LABEL, formatChlorine, type ServiceType } from '@/lib/chlorine';
import { CambiosLista } from '@/app/admin/empleados/CambiosLista';
import { cambiosDeLaVisita } from '@/app/admin/empleados/data';
import type { HistoryEntry } from '@/lib/staff-work';
import { VisitaDuenoAcciones, RegistroDuenoCard, type RegistroDueno, type Persona } from './VisitaDueno';

const statusLabel: Record<string, string> = {
  done: 'Hecha', skipped: 'Salteada', no_client: 'No estaba el cliente', pending: 'Pendiente',
};
const statusTone: Record<string, BadgeTone> = {
  done: 'green', skipped: 'gray', no_client: 'red', pending: 'amber',
};
const AR = 'America/Argentina/Buenos_Aires';
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: AR });
const diaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: AR });

type Props = { params: Promise<{ id: string }> };

export default async function VisitaDuenoPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: item }, { data: logs }, { data: staff }, historial] = await Promise.all([
    supabase
      .from('itinerary_items')
      .select(`
        id, status, status_note, completed_at, completed_by, service_type, vehicle_id, assigned_employee_id,
        itinerary_days (id, date),
        vehicles (name),
        pools (nickname, address, neighborhood, city, profiles!pools_client_id_fkey (full_name))
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('service_logs')
      .select('id, employee_id, created_at, updated_at, chlorine_type, chlorine_amount, notes')
      .eq('itinerary_item_id', id)
      .order('created_at'),
    supabase.from('profiles').select('id, full_name, role, status').in('role', ['employee', 'owner', 'super_admin']).order('full_name'),
    cambiosDeLaVisita(supabase, id),
  ]);
  if (!item) notFound();

  const day = item.itinerary_days as unknown as { id: string; date: string };
  const pool = item.pools as unknown as {
    nickname: string | null; address: string | null; neighborhood: string | null; city: string | null;
    profiles: { full_name: string } | null;
  } | null;
  const vehicle = (item.vehicles as unknown as { name: string } | null)?.name ?? null;
  const serviceType = (item.service_type as ServiceType) ?? 'service';
  const people = (staff ?? []) as { id: string; full_name: string; role: string; status: string }[];
  const nameOf = new Map(people.map((p) => [p.id, p.full_name]));

  // A quién se le puede cargar un registro: el equipo no bloqueado. Por defecto, quien va en el auto de la visita, o uno mismo.
  const team: Persona[] = people
    .filter((p) => p.status !== 'blocked')
    .map((p) => ({ id: p.id, name: p.id === user.id ? `${p.full_name} (vos)` : p.full_name }));
  let defaultEmployeeId = user.id;
  if (item.vehicle_id) {
    const { data: crew } = await supabase
      .from('itinerary_day_crews')
      .select('employee_id')
      .eq('itinerary_day_id', day.id)
      .eq('vehicle_id', item.vehicle_id as string)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (crew && team.some((t) => t.id === crew.employee_id)) defaultEmployeeId = crew.employee_id as string;
  }
  // Si la visita tiene encargado, viene elegido él
  const assignee = (item.assigned_employee_id as string | null) ?? null;
  if (assignee && team.some((t) => t.id === assignee)) defaultEmployeeId = assignee;

  const registros: RegistroDueno[] = (logs ?? []).map((l) => ({
    id: l.id as string,
    employeeId: l.employee_id as string,
    author: nameOf.get(l.employee_id as string) ?? 'Sin nombre',
    when: diaHora(l.created_at as string),
    edited: new Date(l.updated_at as string).getTime() - new Date(l.created_at as string).getTime() > 1000,
    chlorineType: (l.chlorine_type as string | null) ?? null,
    chlorineAmount: l.chlorine_amount === null ? null : Number(l.chlorine_amount),
    chlorineText: formatChlorine(l.chlorine_type as string | null, l.chlorine_amount as number | null),
    notes: (l.notes as string | null) ?? null,
  }));
  // Un registro a nombre de alguien que ya no es del equipo sigue apareciendo en el selector al corregirlo
  const teamWithAuthors = [
    ...team,
    ...registros.filter((r) => !team.some((t) => t.id === r.employeeId)).map((r) => ({ id: r.employeeId, name: r.author })),
  ];

  // Historial de cada registro; los de registros que ya no existen van aparte
  const cambiosDe = new Map<string, HistoryEntry[]>();
  for (const e of historial.entries) cambiosDe.set(e.serviceLogId, [...(cambiosDe.get(e.serviceLogId) ?? []), e]);
  const vivos = new Set(registros.map((r) => r.id));
  const borrados = historial.entries.filter((e) => !vivos.has(e.serviceLogId) && e.action === 'delete');

  const isFuture = day.date > todayInArgentina();
  const title = pool?.nickname || pool?.address || pool?.profiles?.full_name || 'Pileta';
  const closedBy = item.completed_by ? nameOf.get(item.completed_by as string) ?? null : null;

  return (
    <div className="bo-page bo-page-md">
      <PageHeader
        back={{ href: `/admin/itinerario/${day.date}`, label: 'Volver al día' }}
        eyebrow={formatDateAR(day.date)}
        title={title}
        description={pool?.nickname ? pool.address ?? undefined : undefined}
        actions={
          <div className="flex items-center gap-2">
            <EnVivo userId={user.id} />
            <StatusBadge tone={statusTone[item.status as string] ?? 'gray'}>
              {statusLabel[item.status as string] ?? item.status}
            </StatusBadge>
          </div>
        }
      />

      <Panel className="bo-panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge tone={serviceType === 'desagote' ? 'purple' : 'blue'}>{SERVICE_TYPE_LABEL[serviceType]}</StatusBadge>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Car className="w-3.5 h-3.5" />
            {vehicle ?? 'Sin auto'}
          </span>
          {assignee && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#705498]" data-testid="visita-encargado">
              <UserCheck className="w-3.5 h-3.5" />
              Le toca a {nameOf.get(assignee) ?? 'Sin nombre'}
            </span>
          )}
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          {pool?.profiles && (
            <div className="flex items-center gap-2"><User className="w-4 h-4 shrink-0" /><span>{pool.profiles.full_name}</span></div>
          )}
          {pool?.address && (
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 shrink-0" /><span>{[pool.address, pool.neighborhood, pool.city].filter(Boolean).join(', ')}</span></div>
          )}
        </div>
        {item.status !== 'pending' && item.completed_at && (
          <p className="text-xs text-muted-foreground mt-3" data-testid="visita-cierre">
            {statusLabel[item.status as string]}
            {closedBy ? ` · la cerró ${closedBy}` : ''} a las {hora(item.completed_at as string)}
          </p>
        )}
        {item.status_note && (
          <p className="text-sm italic text-foreground mt-2 whitespace-pre-line" data-testid="visita-motivo">Motivo: “{item.status_note as string}”</p>
        )}
      </Panel>

      {isFuture ? (
        <Note icon={Lock} className="mb-4">Esta visita es de un día que todavía no llegó: se va a poder registrar ese día.</Note>
      ) : (
        <div className="mb-4">
          <VisitaDuenoAcciones itemId={item.id as string} status={item.status as string} team={team} defaultEmployeeId={defaultEmployeeId} />
        </div>
      )}

      {registros.length > 0 && (
        <Panel>
          <PanelHeader icon={ClipboardList} title="Registros de esta visita" sub="Quién la hizo, el cloro y las observaciones. Cada cambio queda en el historial." bordered />
          <div className="bo-rows" data-testid="registros">
            {registros.map((r) => (
              <RegistroDuenoCard
                key={r.id}
                registro={r}
                team={teamWithAuthors}
                cambios={
                  <details className="mt-2 text-xs" data-testid="ver-cambios">
                    <summary className="cursor-pointer text-primary font-medium w-fit">Ver cambios ({cambiosDe.get(r.id)?.length ?? 0})</summary>
                    <div className="mt-2 rounded-lg border border-border">
                      <CambiosLista entries={cambiosDe.get(r.id) ?? []} ctx={historial.ctx} showPool={false} />
                    </div>
                  </details>
                }
              />
            ))}
          </div>
        </Panel>
      )}

      {borrados.length > 0 && (
        <Panel className="mt-4" testId="registros-borrados">
          <PanelHeader icon={Trash2} title="Registros borrados" sub="Registros de esta visita que alguien borró: quién, cuándo y cómo estaban." bordered />
          <CambiosLista entries={borrados} ctx={historial.ctx} showPool={false} />
        </Panel>
      )}
    </div>
  );
}
