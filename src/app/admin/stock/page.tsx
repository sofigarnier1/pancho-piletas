import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unidadConCantidad } from '@/lib/unidad'
import { mapSupabaseUserToAppUser } from '@/lib/supabase/user';
import Link from 'next/link';
import { Package, Pencil, Plus, Star, CheckCircle2, AlertTriangle, PackagePlus, History } from 'lucide-react';
import { alcanzaPara, CHLORINE_TYPES, DEPOSITO_UNIDAD, isChlorineType, stockBajo } from '@/lib/cloro';
import { DepositoPanel, type Deposito } from './DepositoPanel';
import { PageHeader, Panel, EmptyState, StatCard, StatusBadge } from '@/components/admin/bo';
import { StockAdjustButtons } from './StockAdjustButtons';
import { ToggleProductActiveButton } from './ToggleProductActiveButton';
import { InStockToggle } from './InStockToggle';

async function getProducts() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, chlorine_type, price_cents, stock_units, in_stock, unit, is_active, is_featured, promo_label, chlorine_content, low_stock_alert')
    .order('display_order')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

async function getDepositos(): Promise<Deposito[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('chlorine_stock').select('chlorine_type, quantity, bulk_price_cents, low_alert');
  return CHLORINE_TYPES.map((t) => {
    const d = (data ?? []).find((r) => r.chlorine_type === t);
    return {
      chlorine_type: t,
      quantity: Number(d?.quantity ?? 0),
      bulk_price_cents: d?.bulk_price_cents == null ? null : Number(d.bulk_price_cents),
      low_alert: d?.low_alert == null ? null : Number(d.low_alert),
    };
  });
}

const chlorineTypeLabel: Record<string, string> = {
  pastilla: 'Pastilla', granulado: 'Granulado', liquido: 'Líquido', combo: 'Combo', otro: 'Otro',
};

function cents(n: number) {
  return `$${(n / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
}

export default async function StockPage() {
  const [products, depositos] = await Promise.all([getProducts(), getDepositos()]);
  const enDeposito = (t: string) => depositos.find((d) => d.chlorine_type === t)?.quantity ?? 0;
  /** Presentación del depósito: cuántas unidades enteras alcanzan; null si el producto tiene stock propio. */
  const alcanza = (p: (typeof products)[number]) =>
    p.chlorine_content != null && isChlorineType(p.chlorine_type) ? alcanzaPara(enDeposito(p.chlorine_type), p.chlorine_content) : null;
  const unidades = (p: (typeof products)[number]) => alcanza(p) ?? (p.stock_units as number);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = !!user && ['super_admin', 'owner'].includes(mapSupabaseUserToAppUser(user).role);
  const active = products.filter((p) => p.is_active);
  const inactive = products.filter((p) => !p.is_active);

  const outOfStock = active.filter((p) => unidades(p) <= 0).length;
  const featured = active.filter((p) => p.is_featured).length;

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Productos y existencias"
        title="Stock"
        description={`${active.length} productos activos`}
        actions={(
          <>
            {isOwner && (
              <>
                <Link href="/admin/stock/cargar" className="bo-btn bo-btn-primary" data-testid="cargar-mercaderia">
                  <PackagePlus className="w-4 h-4" />
                  Cargar mercadería
                </Link>
                <Link href="/admin/stock/movimientos" className="bo-btn" data-testid="ver-movimientos">
                  <History className="w-4 h-4" />
                  Movimientos
                </Link>
              </>
            )}
            <Link href="/admin/stock/nuevo" className={isOwner ? 'bo-btn' : 'bo-btn bo-btn-primary'}>
              <Plus className="w-4 h-4" />
              Nuevo producto
            </Link>
          </>
        )}
      />

      <DepositoPanel depositos={depositos} isOwner={isOwner} />

      {products.length > 0 && (
        <div className="bo-stats cols-3">
          <StatCard label="Productos activos" value={active.length} foot="Disponibles para la venta" icon={Package} tone="blue" />
          <StatCard label="Sin stock" value={outOfStock} foot={outOfStock === 0 ? 'Todos con existencias' : 'Activos con stock en 0'} icon={outOfStock === 0 ? CheckCircle2 : AlertTriangle} tone={outOfStock === 0 ? 'green' : 'amber'} />
          <StatCard label="Destacados" value={featured} foot="Marcados como destacados" icon={Star} tone="purple" />
        </div>
      )}

      {products.length === 0 ? (
        <Panel>
          <EmptyState icon={Package}>
            <p>No hay productos cargados</p>
            <Link href="/admin/stock/nuevo" className="bo-link mt-4 text-sm">
              <Plus className="w-4 h-4" /> Agregar producto
            </Link>
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-5">
          {[{ label: 'Activos', items: active }, { label: 'Inactivos', items: inactive }]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <Panel key={group.label}>
                <div className="bo-panel-header bordered">
                  <h2 className="bo-panel-title">{group.label}</h2>
                  <span className="text-xs text-muted-foreground">{group.items.length}</span>
                </div>
                <div className="bo-rows">
                  {group.items.map((product) => (
                    <div key={product.id} data-testid="producto" className="bo-row flex-wrap sm:flex-nowrap">
                      <div className="bo-icon-tile">
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-[11rem]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground text-sm">{product.name as string}</p>
                          {product.is_featured && (
                            <StatusBadge tone="purple">Destacado</StatusBadge>
                          )}
                          {product.promo_label && (
                            <StatusBadge tone="amber" className="plain">{product.promo_label as string}</StatusBadge>
                          )}
                          {alcanza(product) === null && stockBajo(product.stock_units as number, product.low_stock_alert as number | null) && (
                            <StatusBadge tone="red">Stock bajo</StatusBadge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {chlorineTypeLabel[product.chlorine_type as string] ?? product.chlorine_type}
                          {' · '}{cents(product.price_cents as number)}/{product.unit as string}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
                        <div className="flex flex-col items-center gap-1">
                          <InStockToggle productId={product.id} inStock={product.in_stock as boolean} />
                          {alcanza(product) === null && !isOwner && (
                            <span className="text-[11px] leading-none text-muted-foreground whitespace-nowrap" data-testid="stock-solo-lectura">
                              En stock: {unidadConCantidad(product.stock_units as number, product.unit as string)}
                            </span>
                          )}
                        </div>
                        {alcanza(product) !== null && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap text-right" data-testid="alcanza-para">
                            Alcanza para {alcanza(product)}
                            <br />
                            <span className="text-[11px]">({Number(product.chlorine_content).toLocaleString('es-AR')} {DEPOSITO_UNIDAD[product.chlorine_type as 'liquido'].corta || 'pastillas'} c/u, del depósito)</span>
                          </span>
                        )}
                        {alcanza(product) === null && isOwner && (
                          <StockAdjustButtons productId={product.id} currentStock={product.stock_units as number} unit={product.unit as string} />
                        )}
                        <ToggleProductActiveButton productId={product.id} isActive={product.is_active as boolean} />
                        <Link
                          href={`/admin/stock/${product.id}/editar`}
                          aria-label={`Editar ${product.name as string}`}
                          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
        </div>
      )}
    </div>
  );
}
