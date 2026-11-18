import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { PageHeader, Panel, EmptyState } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { todayInArgentina } from '@/lib/dates';
import { embedOne } from '@/lib/clients';
import { parseMes } from '@/lib/staff-work';
import { MARK_LABEL, WEEKS, buildPlanilla, weekRanges, type Mark, type PlanillaItem, type PlanillaLog, type PlanillaPool } from '@/lib/planilla';
import { MesNav } from '@/app/admin/empleados/MesNav';
import { ImprimirButton } from './ImprimirButton';
import { ServicesTabs } from '../ServicesTabs';

type Props = { searchParams: Promise<{ mes?: string; ver?: string }> };

type PoolRow = {
  id: string; nickname: string | null; address: string | null; neighborhood: string | null;
  profiles: { full_name: string | null; client_profiles: { client_number: number | null } | { client_number: number | null }[] | null } | null;
};

type ItemRow = {
  id: string; status: string; service_type: string | null; pool_id: string;
  itinerary_days: { date: string } | { date: string }[];
  pools: {
    nickname: string | null; address: string | null; neighborhood: string | null;
    profiles: { full_name: string | null; client_profiles: { client_number: number | null } | { client_number: number | null }[] | null } | null;
  } | null;
};

const MARK_CLASS: Record<Mark, string> = {
  S: 'text-[#2f7a4f] font-semibold', D: 'text-[#6a4bb0] font-semibold', X: 'text-muted-foreground', NE: 'text-[#ad4d52] font-semibold', '·': 'text-[#b7791f]',
};

/** La marca de pendiente: un punto de color bien visible (el texto "·" queda para lectores de pantalla). */
function PendienteDot() {
  return (
    <span className="inline-flex h-[1.2em] items-center align-middle">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-[#b7791f]" />
      <span className="sr-only">·</span>
    </span>
  );
}

export default async function PlanillaPage({ searchParams }: Props) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;
  const sp = await searchParams;
  const mes = parseMes(sp.mes, todayInArgentina());
  const soloSinAgendar = sp.ver === 'sin-agendar';

  const [{ data: items }, { data: logs }, { data: activas }] = await Promise.all([
    supabase
      .from('itinerary_items')
      .select(`
        id, status, service_type, pool_id,
        itinerary_days!inner (date),
        pools (nickname, address, neighborhood, profiles!pools_client_id_fkey (full_name, client_profiles (client_number)))
      `)
      .gte('itinerary_days.date', mes.from)
      .lte('itinerary_days.date', mes.to)
      .limit(10000),
    supabase
      .from('service_logs')
      .select('itinerary_item_id, pool_id, chlorine_type, chlorine_amount')
      .gte('date', mes.from)
      .lte('date', mes.to)
      .limit(20000),
    // Todas las piletas activas, para que no se pase ninguna aunque no tenga visitas en el mes
    supabase
      .from('pools')
      .select('id, nickname, address, neighborhood, profiles!pools_client_id_fkey (full_name, client_profiles (client_number))')
      .eq('is_active', true)
      .limit(5000),
  ]);
  const piletas: PlanillaPool[] = ((activas ?? []) as unknown as PoolRow[]).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    address: p.address,
    neighborhood: p.neighborhood,
    clientName: p.profiles?.full_name ?? null,
    clientNumber: embedOne(p.profiles?.client_profiles)?.client_number ?? null,
  }));

  const planillaItems: PlanillaItem[] = ((items ?? []) as unknown as ItemRow[]).map((i) => {
    const titular = i.pools?.profiles ?? null;
    return {
      id: i.id,
      date: embedOne(i.itinerary_days)!.date,
      status: i.status,
      service_type: i.service_type,
      pool_id: i.pool_id,
      pool: {
        nickname: i.pools?.nickname ?? null,
        address: i.pools?.address ?? null,
        neighborhood: i.pools?.neighborhood ?? null,
        clientName: titular?.full_name ?? null,
        clientNumber: embedOne(titular?.client_profiles)?.client_number ?? null,
      },
    };
  });
  const todas = buildPlanilla(planillaItems, (logs ?? []) as PlanillaLog[], piletas);
  const sinAgendar = todas.filter((r) => r.sinAgendar).length;
  const rows = soloSinAgendar ? todas.filter((r) => r.sinAgendar) : todas;
  const conVisitas = todas.length - sinAgendar;
  const ranges = weekRanges(mes.from, mes.to);
  const done = rows.reduce((n, r) => n + r.done, 0);

  return (
    <div className="bo-page planilla-print">
      <PageHeader
        back={{ href: `/admin/services?mes=${mes.mes}`, label: 'Planilla de services' }}
        eyebrow="Services"
        title="Planilla del mes"
        description="Como la planilla en papel: cada pileta con su cliente, su dirección y lo que pasó cada semana. Sin precios."
        actions={<div className="no-print"><ImprimirButton /></div>}
      />

      <ServicesTabs actual="planilla" mes={mes.mes} />

      <Panel>
        <MesNav
          mes={mes}
          href={(m) => `/admin/services/planilla?mes=${m}${soloSinAgendar ? '&ver=sin-agendar' : ''}`}
          sub={`${conVisitas} ${conVisitas === 1 ? 'pileta' : 'piletas'} con visitas · ${done} ${done === 1 ? 'visita hecha' : 'visitas hechas'} · ${sinAgendar} sin agendar`}
        />
        <div className="no-print flex flex-wrap items-center gap-2 px-5 pb-3" data-testid="planilla-filtro">
          <div className="bo-segmented">
            <Link href={`/admin/services/planilla?mes=${mes.mes}`} data-active={!soloSinAgendar} aria-current={!soloSinAgendar ? 'page' : undefined}>Todas</Link>
            <Link href={`/admin/services/planilla?mes=${mes.mes}&ver=sin-agendar`} data-active={soloSinAgendar} aria-current={soloSinAgendar ? 'page' : undefined} data-testid="planilla-sin-agendar">
              Sin agendar ({sinAgendar})
            </Link>
          </div>
          {sinAgendar > 0 && !soloSinAgendar && (
            <p className="text-xs text-muted-foreground">Las piletas activas sin ninguna visita en el mes van resaltadas.</p>
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList}>
            {soloSinAgendar ? 'Todas las piletas activas tienen al menos una visita este mes.' : 'No hay piletas activas ni visitas en el itinerario de este mes.'}
          </EmptyState>
        ) : (
          // relative: los textos sr-only (absolutos) quedan dentro del scroll de la tabla y no ensanchan la página en el celular
          <div className="bo-table-wrap relative">
            <table className="bo-table planilla-table" data-testid="planilla">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Dirección</th>
                  {ranges.map((r, w) => (r ? <th key={w} className="text-center">Sem {w + 1}<span className="block font-normal normal-case tracking-normal">{r}</span></th> : null))}
                  <th>Cloro</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.poolId} data-testid="planilla-fila" data-sin-agendar={r.sinAgendar || undefined} className={r.sinAgendar ? 'bg-[#fff4e0]' : undefined}>
                    <td className="tabular-nums text-muted-foreground">{r.number ?? '—'}</td>
                    <td className="font-medium text-foreground">
                      {r.client}
                      {r.sinAgendar && <span className="block text-[11px] font-semibold text-[#b7791f]" data-testid="planilla-marca-sin-agendar">Sin agendar este mes</span>}
                    </td>
                    <td>
                      <Link href={`/admin/piletas/${r.poolId}`} className="hover:text-primary hover:underline underline-offset-2">{r.address}</Link>
                    </td>
                    {Array.from({ length: WEEKS }, (_, w) =>
                      ranges[w] ? (
                        <td key={w} className="text-center whitespace-nowrap" data-testid={`sem-${w + 1}`}>
                          {r.weeks[w].map((c) => (
                            <Link
                              key={c.itemId}
                              href={`/admin/itinerario/visita/${c.itemId}`}
                              className={`inline-block px-1 ${MARK_CLASS[c.mark]}`}
                              title={`${MARK_LABEL[c.mark]} · ${Number(c.date.slice(8, 10))}/${Number(c.date.slice(5, 7))}`}
                            >
                              {c.mark === '·' ? <PendienteDot /> : c.mark}
                              <span className="block text-[10px] font-normal text-muted-foreground">{Number(c.date.slice(8, 10))}</span>
                            </Link>
                          ))}
                        </td>
                      ) : null,
                    )}
                    <td className="text-xs">{r.chlorine.length ? r.chlorine.map((c) => <div key={c}>{c}</div>) : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="relative px-5 py-3 text-xs text-muted-foreground border-t border-border" data-testid="planilla-referencias">
          <strong className="text-foreground">S</strong> service hecho · <strong className="text-foreground">D</strong> desagote hecho ·{' '}
          <strong className="text-foreground">X</strong> salteada · <strong className="text-foreground">NE</strong> no estaba el cliente ·{' '}
          <PendienteDot /> pendiente. Debajo de cada marca, el día. Tocá una marca para abrir la visita.
        </p>
      </Panel>
    </div>
  );
}
