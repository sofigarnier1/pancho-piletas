import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Waves, ShoppingBag, Phone, MapPin, Users, StickyNote } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, StatusBadge, type BadgeTone } from '@/components/admin/bo';
import { ClientStatusControl } from './ClientStatusControl';
import { EditClienteForm } from './EditClienteForm';
import { POOL_TYPE_LABEL, embedOne, poolTitle } from '@/lib/clients';
import { PreciosPanel } from './PreciosPanel';
import { todayInArgentina } from '@/lib/dates';
import type { PriceRow } from '@/lib/precios';
import { mapSupabaseUserToAppUser } from '@/lib/supabase/user';
import { OWNER_ROLES } from '@/lib/auth/require-role';

async function getCliente(id: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: pools }, { data: sales }, { data: orders }, { data: prices }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, status, has_account, created_at, client_profiles(client_number, notes, address, neighborhood, city, shipping_notes)')
      .eq('id', id)
      .eq('role', 'client')
      .maybeSingle(),
    supabase
      .from('pool_clients')
      .select('is_primary, pools (id, nickname, address, neighborhood, pool_type, is_active, created_at)')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('manual_sales')
      .select('id, total_cents, sold_at, notes, manual_sale_items(product_name, quantity, unit_price_cents)')
      .eq('client_id', id)
      .order('sold_at', { ascending: false })
      .limit(10),
    supabase
      .from('orders')
      .select('id, status, total_cents, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    // Solo el dueño y el súper admin los pueden leer (RLS)
    supabase.from('client_prices').select('id, kind, price_cents, valid_from').eq('client_id', id).order('valid_from', { ascending: false }),
  ]);

  if (!profile) return null;
  // Los precios solo los ven el dueño y el súper admin (marketing ve la ficha, pero no los precios)
  const { data: { user } } = await supabase.auth.getUser();
  const verPrecios = !!user && OWNER_ROLES.includes(mapSupabaseUserToAppUser(user).role);
  const piletas = (pools ?? [])
    .map((l) => ({ ...(l.pools as unknown as PoolRow), is_primary: l.is_primary as boolean }))
    .filter((p) => p.id);
  return { profile, pools: piletas, sales: sales ?? [], orders: orders ?? [], prices: (prices ?? []) as PriceRow[], verPrecios };
}

const statusTone: Record<string, BadgeTone> = {
  active: 'green', inactive: 'gray', blocked: 'red',
};
const statusLabel: Record<string, string> = {
  active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado',
};
type PoolRow = {
  id: string; nickname: string | null; address: string | null; neighborhood: string | null;
  pool_type: string | null; is_active: boolean; created_at: string;
};
type ClientProfile = {
  client_number: number | null; notes: string | null;
  address?: string | null; neighborhood?: string | null; city?: string | null; shipping_notes?: string | null;
};

function cents(n: number) {
  return `$${(n / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
}

type Props = { params: Promise<{ id: string }> };

export default async function ClienteDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getCliente(id);
  if (!data) notFound();

  const { profile, pools, sales, orders, prices, verPrecios } = data;
  const cp = embedOne(profile.client_profiles as unknown as ClientProfile | null);

  const totalSpent = [
    ...sales.map((s) => s.total_cents as number),
    ...orders.filter((o) => o.status === 'paid').map((o) => o.total_cents as number),
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="bo-page bo-page-narrow">
      <PageHeader
        back={{ href: '/admin/clientes', label: 'Volver a clientes y piletas' }}
        eyebrow="Ficha de cliente"
        title={profile.full_name as string}
        description={`${cp?.client_number ? `N° ${cp.client_number} · ` : ''}Cliente desde ${new Date(profile.created_at as string).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`}
        actions={
          <div className="flex items-center gap-3">
            {!profile.has_account && <StatusBadge tone="gray"><span data-testid="cliente-sin-cuenta">Sin cuenta web</span></StatusBadge>}
            <StatusBadge tone={statusTone[profile.status as string] ?? 'gray'}>
              {statusLabel[profile.status as string] ?? profile.status}
            </StatusBadge>
            <ClientStatusControl userId={profile.id as string} status={profile.status as string} />
          </div>
        }
      />

      {/* Datos + total */}
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Panel className="sm:col-span-2">
          <PanelHeader icon={Users} title="Datos del cliente" bordered />
          <div className="bo-panel-pad space-y-3">
            <EditClienteForm
              clientId={profile.id as string}
              fullName={profile.full_name as string}
              clientNumber={cp?.client_number ?? null}
              phone={(profile.phone as string | null) ?? null}
              notes={cp?.notes ?? null}
            >
              {profile.phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span>{profile.phone as string}</span>
                </div>
              )}
              {cp?.notes && (
                <div className="flex items-start gap-2.5 text-sm">
                  <StickyNote className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{cp.notes}</span>
                </div>
              )}
              {(cp?.address || cp?.neighborhood) && (
                <div className="flex items-center gap-2.5 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span>
                    Entrega de cloro: {[cp.neighborhood, cp.address, cp.city].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {cp?.shipping_notes && (
                <p className="text-sm text-muted-foreground pl-6.5">{cp.shipping_notes}</p>
              )}
              {!profile.phone && !cp?.notes && !cp?.address && !cp?.neighborhood && (
                <p className="text-sm text-muted-foreground">Sin teléfono ni notas</p>
              )}
            </EditClienteForm>
          </div>
        </Panel>

        <div className="bo-stat tone-purple">
          <div className="bo-stat-top">
            <span>Total gastado</span>
            <ShoppingBag />
          </div>
          <strong className="bo-stat-value">{cents(totalSpent)}</strong>
          <div className="bo-stat-foot">en {sales.length + orders.filter((o) => o.status === 'paid').length} compras</div>
        </div>
      </div>

      {/* Piletas */}
      <Panel className="mb-5">
        <PanelHeader
          icon={Waves}
          title={`Piletas (${pools.length})`}
          action={
            <Link href={`/admin/piletas/nueva?cliente=${id}`} className="bo-link">
              + Agregar pileta
            </Link>
          }
          bordered
        />
        {pools.length === 0 ? (
          <p className="bo-empty !py-8">Sin piletas registradas</p>
        ) : (
          <div className="bo-rows">
            {pools.map((pool) => (
              <Link key={pool.id} href={`/admin/piletas/${pool.id}`} className="bo-row justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {poolTitle(pool)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[pool.neighborhood, pool.address].filter(Boolean).join(' · ')}
                    {pool.pool_type ? ` · ${POOL_TYPE_LABEL[pool.pool_type] ?? pool.pool_type}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge tone={pool.is_primary ? 'blue' : 'purple'}>
                    {pool.is_primary ? 'Titular' : 'Co-cliente'}
                  </StatusBadge>
                  <StatusBadge tone={pool.is_active ? 'green' : 'gray'}>
                    {pool.is_active ? 'Activa' : 'Inactiva'}
                  </StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      {verPrecios && <PreciosPanel clientId={profile.id as string} prices={prices} hoy={todayInArgentina()} />}

      {/* Historial de compras */}
      <Panel>
        <PanelHeader icon={ShoppingBag} title="Últimas compras" bordered />
        {sales.length === 0 && orders.length === 0 ? (
          <p className="bo-empty !py-8">Sin compras registradas</p>
        ) : (
          <div className="bo-rows">
            {sales.map((sale) => (
              <div key={sale.id} className="bo-row justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Venta manual</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(sale.sold_at as string).toLocaleDateString('es-AR')}
                    {sale.notes ? ` · ${sale.notes}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums">{cents(sale.total_cents as number)}</p>
              </div>
            ))}
            {orders.map((order) => (
              <div key={order.id} className="bo-row justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Orden online</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(order.created_at as string).toLocaleDateString('es-AR')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={order.status === 'paid' ? 'green' : 'gray'}>
                    {order.status as string}
                  </StatusBadge>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{cents(order.total_cents as number)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
