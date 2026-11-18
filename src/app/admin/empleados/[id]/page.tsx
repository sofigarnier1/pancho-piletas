import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CalendarDays, ClipboardList, Droplets, History, Waves } from 'lucide-react';
import { PageHeader, Panel, StatCard, StatusBadge, EmptyState } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES, isUuid } from '@/lib/auth/require-role';
import { todayInArgentina, formatDateAR } from '@/lib/dates';
import { ROLE_LABEL } from '@/components/layout/admin-nav';
import { SERVICE_TYPE_LABEL, formatChlorine } from '@/lib/chlorine';
import { embedOne, poolTitle } from '@/lib/clients';
import { chlorineTotalsText, emptySummary, parseMes, summarizeWork, type WorkLog } from '@/lib/staff-work';
import { MesNav } from '../MesNav';
import { STAFF } from '../data';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> };

type Row = WorkLog & {
  notes: string | null;
  pools: { nickname: string | null; address: string | null; neighborhood: string | null; profiles: { full_name: string } | { full_name: string }[] | null } | null;
};

export default async function EmpleadoDetallePage({ params, searchParams }: Props) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const mes = parseMes((await searchParams).mes, todayInArgentina());

  const [{ data: person }, { data: logs }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, status').eq('id', id).maybeSingle(),
    supabase
      .from('service_logs')
      .select(`
        id, employee_id, itinerary_item_id, date, service_type, chlorine_type, chlorine_amount, notes, created_at,
        pools (nickname, address, neighborhood, profiles!pools_client_id_fkey (full_name))
      `)
      .eq('employee_id', id)
      .gte('date', mes.from)
      .lte('date', mes.to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5000),
  ]);
  if (!person || !(STAFF as readonly string[]).includes(person.role as string)) notFound();

  const rows = (logs ?? []) as unknown as Row[];
  const w = summarizeWork(rows).get(id) ?? emptySummary(id);
  const cloro = chlorineTotalsText(w.chlorine);
  const name = (person.full_name as string | null) || 'Sin nombre';
  const byDay = new Map<string, Row[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);

  return (
    <div className="bo-page bo-page-md">
      <PageHeader
        back={{ href: `/admin/empleados?mes=${mes.mes}`, label: 'Empleados' }}
        eyebrow={ROLE_LABEL[person.role as string] ?? (person.role as string)}
        title={name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {person.status !== 'active' && <StatusBadge tone="gray">{person.status === 'blocked' ? 'Bloqueado' : 'Inactivo'}</StatusBadge>}
            <Link href={`/admin/empleados/cambios?mes=${mes.mes}&persona=${id}`} className="bo-btn">
              <History className="w-4 h-4" />
              Ver sus cambios
            </Link>
          </div>
        }
      />

      <div className="bo-stats cols-3">
        <StatCard label="Visitas" value={w.visits} icon={Waves} foot={`${w.service} service · ${w.desagote} desagote`} />
        <StatCard label="Días trabajados" value={w.days} icon={CalendarDays} tone="green" />
        <StatCard label="Registros" value={w.logs} icon={ClipboardList} tone="purple" />
      </div>

      <Panel className="bo-panel-pad mb-4" testId="cloro-mes">
        <h2 className="bo-panel-title flex items-center gap-2"><Droplets className="w-4 h-4 text-primary" />Cloro del mes</h2>
        <p className="bo-panel-sub">La suma de lo que cargó, por tipo y en su unidad.</p>
        {cloro.length ? (
          <ul className="mt-2 space-y-1 text-sm text-foreground">{cloro.map((c) => <li key={c}>{c}</li>)}</ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Sin cloro</p>
        )}
      </Panel>

      <Panel>
        <MesNav mes={mes} href={(m) => `/admin/empleados/${id}?mes=${m}`} sub="Lo que registró, día por día. Tocá una pileta para abrir la visita y corregirla." />
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList}>No tiene registros en este mes.</EmptyState>
        ) : (
          <div className="bo-rows" data-testid="registros-mes">
            {[...byDay.entries()].map(([date, list]) => (
              <div key={date} className="px-5 py-3.5" data-testid="dia">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{formatDateAR(date)}</p>
                <ul className="space-y-2.5">
                  {list.map((r) => {
                    const client = embedOne(r.pools?.profiles)?.full_name;
                    const title = poolTitle(r.pools);
                    const type = r.service_type === 'desagote' ? 'desagote' : 'service';
                    return (
                      <li key={r.id} className="text-sm" data-testid="registro-mes">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.itinerary_item_id ? (
                            <Link href={`/admin/itinerario/visita/${r.itinerary_item_id}`} className="font-medium text-foreground hover:text-primary underline-offset-2 hover:underline">{title}</Link>
                          ) : (
                            <span className="font-medium text-foreground">{title}</span>
                          )}
                          <StatusBadge tone={type === 'desagote' ? 'purple' : 'blue'}>{SERVICE_TYPE_LABEL[type]}</StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[client, r.pools?.neighborhood].filter(Boolean).join(' · ')}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Droplets className="w-3.5 h-3.5 text-primary shrink-0" />
                          {formatChlorine(r.chlorine_type, r.chlorine_amount) ?? 'Sin cloro'}
                        </p>
                        {r.notes && <p className="text-xs text-muted-foreground italic mt-0.5 whitespace-pre-line">{r.notes}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
