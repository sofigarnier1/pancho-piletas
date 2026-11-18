import { redirect } from 'next/navigation';
import { Info } from 'lucide-react';
import { PageHeader, Panel, Note } from '@/components/admin/bo';
import { requireRole, OWNER_ROLES, isUuid } from '@/lib/auth/require-role';
import { todayInArgentina } from '@/lib/dates';
import { parseMes } from '@/lib/staff-work';
import { CambiosLista } from '../CambiosLista';
import { MesNav } from '../MesNav';
import { STAFF, cambiosDelMes } from '../data';
import { PersonaFiltro } from './PersonaFiltro';

type Props = { searchParams: Promise<{ mes?: string; persona?: string }> };

export default async function CambiosPage({ searchParams }: Props) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) redirect('/admin/dashboard');
  const { supabase } = auth;
  const sp = await searchParams;
  const mes = parseMes(sp.mes, todayInArgentina());
  const persona = sp.persona && isUuid(sp.persona) ? sp.persona : null;

  const [{ entries, ctx, more }, { data: staff }] = await Promise.all([
    cambiosDelMes(supabase, mes.from, mes.to, persona),
    supabase.from('profiles').select('id, full_name').in('role', [...STAFF]).order('full_name'),
  ]);
  const people = ((staff ?? []) as { id: string; full_name: string | null }[]).map((p) => ({ id: p.id, name: p.full_name || 'Sin nombre' }));
  const href = (m: string) => `/admin/empleados/cambios?mes=${m}${persona ? `&persona=${persona}` : ''}`;
  const back = `/admin/empleados?mes=${mes.mes}`;

  return (
    <div className="bo-page bo-page-md">
      <PageHeader
        back={{ href: back, label: 'Empleados' }}
        title="Historial de cambios"
        description="Cada vez que alguien registró, editó o borró un registro de service: quién, cuándo y qué cambió."
      />

      <div className="mb-4">
        <PersonaFiltro mes={mes.mes} persona={persona} people={people} />
      </div>

      <Panel>
        <MesNav mes={mes} href={href} sub={`${entries.length}${more ? '+' : ''} ${entries.length === 1 ? 'cambio' : 'cambios'}, del más nuevo al más viejo`} />
        <CambiosLista entries={entries} ctx={ctx} />
      </Panel>
      {more && (
        <Note icon={Info} className="mt-4">Se muestran los 300 cambios más nuevos del mes. Para ver los demás, filtrá por persona.</Note>
      )}
    </div>
  );
}
