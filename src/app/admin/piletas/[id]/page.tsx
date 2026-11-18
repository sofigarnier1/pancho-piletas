import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MapPin, User, Calendar, Waves } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, StatusBadge } from '@/components/admin/bo';
import { TogglePoolActiveButton } from './TogglePoolActiveButton';
import { PoolClientsPanel, type ClientOption, type PoolClient } from './PoolClientsPanel';
import { VisitasUbicacionPanel } from './VisitasUbicacionPanel';
import { isFrequency } from '@/lib/ubicacion';
import { POOL_TYPE_LABEL, embedOne, poolTitle } from '@/lib/clients';
import { SERVICE_TYPE_LABEL, formatChlorine, type ServiceType } from '@/lib/chlorine';

async function getPool(id: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: pool }, { data: logs }, { data: links }, { data: options }] = await Promise.all([
    supabase
      .from('pools')
      .select(`
        id, nickname, address, neighborhood, city, pool_type, notes, is_active, created_at, frequency, lat, lng, location_source,
        profiles!pools_client_id_fkey (id, full_name)
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('service_logs')
      .select('id, date, service_type, chlorine_type, chlorine_amount, notes')
      .eq('pool_id', id)
      .order('date', { ascending: false })
      .limit(15),
    supabase
      .from('pool_clients')
      .select('is_primary, created_at, profiles!pool_clients_client_id_fkey (id, full_name, client_profiles (client_number))')
      .eq('pool_id', id)
      .order('is_primary', { ascending: false })
      .order('created_at'),
    supabase
      .from('profiles')
      .select('id, full_name, client_profiles (client_number)')
      .eq('role', 'client')
      .eq('status', 'active')
      .order('full_name'),
  ]);

  if (!pool) return null;
  const number = (cp: unknown) => embedOne(cp as { client_number: number | null } | null)?.client_number ?? null;
  const clients: PoolClient[] = (links ?? []).flatMap((l) => {
    const p = l.profiles as unknown as { id: string; full_name: string; client_profiles: unknown } | null;
    return p ? [{ id: p.id, full_name: p.full_name, client_number: number(p.client_profiles), is_primary: l.is_primary as boolean }] : [];
  });
  const clientOptions: ClientOption[] = (options ?? []).map((o) => ({
    id: o.id as string, full_name: o.full_name as string, client_number: number(o.client_profiles),
  }));
  return { pool, logs: logs ?? [], clients, clientOptions };
}


type Props = { params: Promise<{ id: string }> };

export default async function PoolDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getPool(id);
  if (!data) notFound();

  const { pool, logs, clients, clientOptions } = data;
  const client = pool.profiles as unknown as { id: string; full_name: string } | null;

  return (
    <div className="bo-page bo-page-narrow">
      <PageHeader
        back={{ href: '/admin/clientes', label: 'Volver a clientes y piletas' }}
        eyebrow="Ficha de pileta"
        title={poolTitle(pool as { nickname: string | null; address: string | null })}
        description={[pool.neighborhood, pool.address, pool.city].filter(Boolean).join(', ')}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge tone={pool.is_active ? 'green' : 'gray'}>
              {pool.is_active ? 'Activa' : 'Inactiva'}
            </StatusBadge>
            <TogglePoolActiveButton poolId={pool.id} isActive={pool.is_active as boolean} />
          </div>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Panel className="sm:col-span-2">
          <PanelHeader icon={Waves} title="Datos de la pileta" bordered />
          <div className="bo-panel-pad space-y-3">
            {client && (
              <div className="flex items-center gap-2.5 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Titular:</span>
                <Link href={`/admin/clientes/${client.id}`} className="text-primary hover:underline font-medium">
                  {client.full_name}
                </Link>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span>{[pool.neighborhood, pool.address].filter(Boolean).join(', ') || 'Sin dirección cargada'}</span>
            </div>
            {pool.pool_type && (
              <p className="text-sm text-muted-foreground pl-6.5">
                {POOL_TYPE_LABEL[pool.pool_type as string] ?? pool.pool_type}
              </p>
            )}
            {pool.notes && (
              <p className="text-sm text-muted-foreground pl-6.5 italic">{pool.notes as string}</p>
            )}
          </div>
        </Panel>

        <div className="bo-stat tone-green">
          <div className="bo-stat-top">
            <span>Historial</span>
            <Calendar />
          </div>
          <strong className="bo-stat-value">{logs.length}</strong>
          <div className="bo-stat-foot">services registrados</div>
        </div>
      </div>

      <PoolClientsPanel poolId={pool.id as string} clients={clients} options={clientOptions} />

      <VisitasUbicacionPanel
        poolId={pool.id as string}
        frequency={isFrequency(pool.frequency) ? pool.frequency : 'semanal'}
        lat={pool.lat === null ? null : Number(pool.lat)}
        lng={pool.lng === null ? null : Number(pool.lng)}
        source={(pool.location_source as 'auto' | 'manual' | null) ?? null}
        tieneDireccion={!!(pool.address as string | null)?.trim()}
      />

      <Panel>
        <PanelHeader icon={Calendar} title="Historial de services" bordered />
        {logs.length === 0 ? (
          <p className="bo-empty !py-8">Sin services registrados</p>
        ) : (
          <div className="bo-rows">
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground bo-capitalize">
                    {new Date(log.date as string + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long', day: 'numeric', month: 'short',
                    })}
                  </p>
                  <StatusBadge tone={log.service_type === 'desagote' ? 'purple' : 'blue'}>
                    {SERVICE_TYPE_LABEL[(log.service_type as ServiceType) ?? 'service']}
                  </StatusBadge>
                </div>
                {log.chlorine_type && (
                  <p className="text-xs text-muted-foreground">
                    Cloro: {formatChlorine(log.chlorine_type as string, log.chlorine_amount as number | null)}
                  </p>
                )}
                {log.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{log.notes as string}</p>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
