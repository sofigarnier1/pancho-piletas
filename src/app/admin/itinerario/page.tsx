import { createSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarDays, Car, Check } from 'lucide-react';
import { todayInArgentina, currentYearMonthAR } from '@/lib/dates';
import { resumenDia, semanasDelMes, type EstadoDia, type ResumenDia } from '@/lib/calendario';
import { PageHeader, Panel } from '@/components/admin/bo';

async function getDias(desde: string, hasta: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: dias }, { data: autos }] = await Promise.all([
    supabase
      .from('itinerary_days')
      .select('date, itinerary_items(status, vehicle_id)')
      .gte('date', desde)
      .lte('date', hasta),
    supabase.from('vehicles').select('id, name').order('sort_order').order('name'),
  ]);
  const porFecha = new Map<string, { status: string; vehicle_id: string | null }[]>();
  for (const d of dias ?? []) {
    porFecha.set(d.date as string, (d.itinerary_items as unknown as { status: string; vehicle_id: string | null }[]) ?? []);
  }
  const nombreAuto = new Map((autos ?? []).map((a) => [a.id as string, a.name as string]));
  return { porFecha, nombreAuto };
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Estilo de cada estado: el color siempre va con texto. */
const ESTILO: Record<EstadoDia, string> = {
  'sin-programar': 'bg-card border-border',
  programado: 'bg-[#e8f1fb] border-[#9cc0e6]',
  pendientes: 'bg-[#fcf1df] border-[#e0b46a]',
  terminado: 'bg-[#e9f5ee] border-[#8cc4a5]',
};

function Etiqueta({ r }: { r: ResumenDia }) {
  if (r.estado === 'sin-programar') return <span className="text-[11px] text-muted-foreground">Sin programar</span>;
  if (r.estado === 'terminado') {
    return <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#28745b]"><Check className="w-3 h-3" /> Terminado</span>;
  }
  if (r.estado === 'pendientes') return <span className="text-[11px] font-semibold text-[#93671f]">{r.sinHacer} sin hacer</span>;
  return <span className="text-[11px] font-semibold text-primary">Programado</span>;
}

type Props = { searchParams: Promise<{ y?: string; m?: string }> };

export default async function ItinerarioPage({ searchParams }: Props) {
  const { y, m } = await searchParams;
  const now = currentYearMonthAR();
  const year = Number.parseInt(y ?? '', 10) || now.year;
  const month = Math.min(12, Math.max(1, Number.parseInt(m ?? '', 10) || now.month));

  const semanas = semanasDelMes(year, month);
  const desde = semanas[0][0].fecha;
  const hasta = semanas.at(-1)!.at(-1)!.fecha;
  const { porFecha, nombreAuto } = await getDias(desde, hasta);
  const hoy = todayInArgentina();

  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const monthName = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const delMes = semanas.flat().filter((c) => c.delMes).map((c) => ({ c, r: resumenDia(porFecha.get(c.fecha) ?? [], c.fecha, hoy) }));
  const monthTotal = delMes.reduce((s, x) => s + x.r.total, 0);
  const programados = delMes.filter((x) => x.r.total > 0).length;
  const conPendientes = delMes.filter((x) => x.r.estado === 'pendientes').length;

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Operación diaria"
        title="Itinerario"
        description="Tocá un día para armarlo: qué autos salen, quién va en cada uno y qué piletas visita."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/itinerario/autos" className="bo-btn">
              <Car className="w-4 h-4" />
              Autos
            </Link>
            <Link href={`/admin/itinerario/${hoy}`} className="bo-btn bo-btn-primary">
              <CalendarDays className="w-4 h-4" />
              Hoy
            </Link>
          </div>
        }
      />

      <Panel testId="calendario">
        <div className="bo-panel-header bordered">
          <div>
            <h2 className="bo-panel-title bo-capitalize text-lg">{monthName}</h2>
            <p className="bo-panel-sub">
              {programados} {programados === 1 ? 'día programado' : 'días programados'} · {monthTotal} {monthTotal === 1 ? 'visita' : 'visitas'}
              {conPendientes > 0 ? ` · ${conPendientes} ${conPendientes === 1 ? 'día' : 'días'} con visitas sin hacer` : ''}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Link href={`/admin/itinerario?y=${prevMonth.y}&m=${prevMonth.m}`} className="bo-btn" aria-label="Mes anterior">
              <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Anterior</span>
            </Link>
            <Link href={`/admin/itinerario?y=${nextMonth.y}&m=${nextMonth.m}`} className="bo-btn" aria-label="Mes siguiente">
              <span className="hidden sm:inline">Siguiente</span> <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] table-fixed border-collapse" data-testid="calendario-grilla">
            <thead>
              <tr>
                {DIAS_SEMANA.map((d) => (
                  <th key={d} className="border-b border-border bg-muted py-2 text-center text-xs font-semibold text-muted-foreground">
                    <span className="hidden sm:inline">{d}</span>
                    <span className="sm:hidden">{d.slice(0, 2)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((semana) => (
                <tr key={semana[0].fecha}>
                  {semana.map((c) => {
                    const r = resumenDia(porFecha.get(c.fecha) ?? [], c.fecha, hoy);
                    const esHoy = c.fecha === hoy;
                    return (
                      <td key={c.fecha} className="border border-border p-0 align-top">
                        <Link
                          href={`/admin/itinerario/${c.fecha}`}
                          data-testid="calendario-dia"
                          data-fecha={c.fecha}
                          data-estado={r.estado}
                          className={`flex h-20 sm:h-28 flex-col gap-0.5 border-l-4 p-1.5 sm:p-2 transition-colors hover:brightness-95 ${ESTILO[r.estado]} ${c.delMes ? '' : 'opacity-45'} ${esHoy ? 'outline outline-2 -outline-offset-2 outline-primary' : ''}`}
                        >
                          <span className="flex items-center gap-1">
                            <span className={`text-sm sm:text-base font-bold tabular-nums ${esHoy ? 'rounded bg-primary px-1.5 text-white' : 'text-foreground'}`}>{c.dia}</span>
                            {esHoy && <span className="hidden sm:inline text-[10px] font-semibold uppercase text-primary">Hoy</span>}
                          </span>
                          {r.total > 0 && (
                            <span className="text-xs font-semibold text-foreground">
                              {r.total} <span className="hidden sm:inline">{r.total === 1 ? 'pileta' : 'piletas'}</span>
                            </span>
                          )}
                          <span className="hidden sm:flex flex-col text-[11px] leading-tight text-muted-foreground">
                            {r.porAuto.slice(0, 3).map((a) => (
                              <span key={a.vehicleId ?? 'sin'} className="truncate">
                                {a.vehicleId ? nombreAuto.get(a.vehicleId) ?? 'Auto' : 'Sin auto'}: {a.cantidad}
                              </span>
                            ))}
                          </span>
                          <span className="mt-auto hidden sm:block"><Etiqueta r={r} /></span>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bo-panel-footer flex-wrap justify-center gap-x-5 gap-y-2 text-xs" data-testid="calendario-referencias">
          <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm border ${ESTILO['sin-programar']}`} /> Sin programar</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm border ${ESTILO.programado}`} /> Programado</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm border ${ESTILO.pendientes}`} /> Quedaron visitas sin hacer</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm border ${ESTILO.terminado}`} /> Terminado</span>
        </div>
      </Panel>
    </div>
  );
}
