import Link from 'next/link';
import { redirect } from 'next/navigation';
import { History } from 'lucide-react';
import { PageHeader, Panel } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES } from '@/lib/auth/require-role';
import { addDays, todayInArgentina } from '@/lib/dates';
import { ROLE_LABEL } from '@/components/layout/admin-nav';
import { emptySummary, marcasPorPersona, parseMes, summarizeWork, visitasPorDia, type WorkLog } from '@/lib/staff-work';
import { MesNav } from './MesNav';
import { STAFF } from './data';
import { EmpleadosTablas, type FilaEmpleado } from './EmpleadosTablas';

type Props = { searchParams: Promise<{ mes?: string }> };

export default async function EmpleadosPage({ searchParams }: Props) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;
  const mes = parseMes((await searchParams).mes, todayInArgentina());

  const [{ data: logs }, { data: staff }, { data: marcas }, { data: cambios }] = await Promise.all([
    supabase
      .from('service_logs')
      .select('id, employee_id, itinerary_item_id, date, service_type, chlorine_type, chlorine_amount')
      .gte('date', mes.from)
      .lte('date', mes.to)
      .limit(20000),
    supabase.from('profiles').select('id, full_name, role, status').in('role', [...STAFF]).order('full_name'),
    supabase
      .from('itinerary_items')
      .select('status, completed_by, itinerary_days!inner(date)')
      .in('status', ['skipped', 'no_client'])
      .gte('itinerary_days.date', mes.from)
      .lte('itinerary_days.date', mes.to)
      .limit(20000),
    supabase
      .from('service_log_history')
      .select('changed_by')
      .gte('changed_at', `${mes.from}T00:00:00-03:00`)
      .lt('changed_at', `${addDays(mes.to, 1)}T00:00:00-03:00`)
      .limit(20000),
  ]);

  const work = summarizeWork((logs ?? []) as WorkLog[]);
  const porDia = visitasPorDia((logs ?? []) as WorkLog[]);
  const saltadas = marcasPorPersona((marcas ?? []) as { status: string; completed_by: string | null }[]);
  const cambiosDe = new Map<string, number>();
  for (const c of cambios ?? []) if (c.changed_by) cambiosDe.set(c.changed_by as string, (cambiosDe.get(c.changed_by as string) ?? 0) + 1);

  const filas: FilaEmpleado[] = ((staff ?? []) as { id: string; full_name: string | null; role: string; status: string }[])
    // Aparecen los empleados activos y cualquiera que haya trabajado ese mes (el dueño, o alguien que ya no está)
    .filter((p) => work.has(p.id) || saltadas.has(p.id) || (p.role === 'employee' && p.status === 'active'))
    .map((p) => {
      const w = work.get(p.id) ?? emptySummary(p.id);
      const m = saltadas.get(p.id) ?? { salteadas: 0, noEstaba: 0 };
      return {
        id: p.id,
        nombre: p.full_name || 'Sin nombre',
        rol: ROLE_LABEL[p.role] ?? p.role,
        estado: p.status,
        visitas: w.visits,
        service: w.service,
        desagote: w.desagote,
        dias: w.days,
        salteadas: m.salteadas,
        noEstaba: m.noEstaba,
        liquido: w.chlorine.liquido.amount,
        granulado: w.chlorine.granulado.amount,
        pastillas: w.chlorine.pastilla.amount,
        cambios: cambiosDe.get(p.id) ?? 0,
        porDia: Object.fromEntries(porDia.get(p.id) ?? []),
      };
    });
  const totalVisits = filas.reduce((n, p) => n + p.visitas, 0);

  const dias: string[] = [];
  for (let d = mes.from; d <= mes.to; d = addDays(d, 1)) dias.push(d);

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Operación"
        title="Empleados"
        description="Cuánto trabajó cada uno en el mes: días, visitas, salteadas y cloro. Tocá una persona para ver el detalle."
        actions={
          <Link href={`/admin/empleados/cambios?mes=${mes.mes}`} className="bo-btn">
            <History className="w-4 h-4" />
            Historial de cambios
          </Link>
        }
      />

      <Panel>
        <MesNav
          mes={mes}
          href={(m) => `/admin/empleados?mes=${m}`}
          sub={`${totalVisits} ${totalVisits === 1 ? 'visita registrada' : 'visitas registradas'} en el mes`}
        />
        <EmpleadosTablas filas={filas} dias={dias} mes={mes.mes} label={mes.label} />
      </Panel>
    </div>
  );
}
