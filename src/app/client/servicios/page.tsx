import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Wrench, Droplets } from 'lucide-react';
import { PageHeader, Panel, StatusBadge, EmptyState } from '@/components/admin/bo';
import { SERVICE_TYPE_LABEL, formatChlorine, type ServiceType } from '@/lib/chlorine';

async function getServicios(clientId: string) {
  const supabase = await createSupabaseServerClient();
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const { data } = await supabase
    .from('service_logs')
    .select(`
      id, date,
      service_type, chlorine_type, chlorine_amount,
      notes,
      pools (nickname, address, neighborhood)
    `)
    .eq('client_id', clientId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  return data ?? [];
}

export default async function ClientServiciosPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const servicios = await getServicios(user.id);

  return (
    <div>
      <PageHeader
        title="Mis servicios"
        description={`Último año · ${servicios.length} ${servicios.length === 1 ? 'service' : 'services'}`}
      />

      {servicios.length === 0 ? (
        <Panel>
          <EmptyState icon={Wrench}>
            <p className="font-medium text-foreground">Sin servicios registrados</p>
            <p className="mt-1">Los mantenimientos de tu pileta aparecerán acá</p>
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-3">
          {servicios.map((s) => {
            const pool = s.pools as unknown as {
              nickname: string | null; address: string; neighborhood: string | null;
            } | null;
            const serviceType = (s.service_type as ServiceType) ?? 'service';
            const chlorine = formatChlorine(s.chlorine_type as string | null, s.chlorine_amount as number | null);

            return (
              <Panel as="div" key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-foreground text-sm">
                      {pool?.nickname || pool?.address}
                      {pool?.neighborhood ? ` · ${pool.neighborhood}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {new Date(s.date + 'T12:00:00').toLocaleDateString('es-AR', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                    </p>
                  </div>
                  <Wrench className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  <StatusBadge className="plain">{SERVICE_TYPE_LABEL[serviceType]}</StatusBadge>
                </div>

                {chlorine && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Droplets className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span>Cloro: {chlorine}</span>
                  </div>
                )}

                {s.notes && (
                  <p className="text-xs text-muted-foreground italic mt-1.5">{s.notes as string}</p>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
