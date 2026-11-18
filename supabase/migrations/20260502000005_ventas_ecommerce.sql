/* =============================================================================
   CLORO Y PILETAS PANCHO — Ventas e-commerce (carrito + MercadoPago)
   Migración: 20260502000005
============================================================================= */

-- ============================================================================
-- 1) Órdenes
-- ============================================================================

create table if not exists public.orders (
  id                    uuid        primary key default gen_random_uuid(),
  client_id             uuid        not null references public.profiles(id),
  status                text        not null default 'pending',
  -- Montos
  subtotal_cents        bigint      not null default 0 check (subtotal_cents >= 0),
  shipping_cost_cents   bigint      not null default 0 check (shipping_cost_cents >= 0),
  total_cents           bigint      not null default 0 check (total_cents >= 0),
  -- Entrega
  shipping_address      text,
  shipping_notes        text,
  -- MercadoPago
  mp_preference_id      text,
  mp_payment_id         text,
  mp_payment_status     text,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ck_orders_status
    check (status in ('pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'))
);

drop trigger if exists tr_orders_updated_at on public.orders;
create trigger tr_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index if not exists ix_orders_client_id on public.orders(client_id);
create index if not exists ix_orders_status    on public.orders(status);
create index if not exists ix_orders_mp        on public.orders(mp_payment_id);


-- ============================================================================
-- 2) Items de la orden
-- ============================================================================

create table if not exists public.order_items (
  id                uuid        primary key default gen_random_uuid(),
  order_id          uuid        not null references public.orders(id) on delete cascade,
  product_id        uuid        not null references public.products(id),
  product_name      text        not null,             -- snapshot al momento de la compra
  quantity          integer     not null check (quantity > 0),
  unit_price_cents  bigint      not null check (unit_price_cents >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists ix_order_items_order_id on public.order_items(order_id);


-- ============================================================================
-- 3) Trigger: descontar stock al confirmar pago
-- ============================================================================

create or replace function public.deduct_stock_on_payment()
returns trigger language plpgsql as $$
begin
  -- Solo actuar cuando el status cambia a 'paid'
  if new.status = 'paid' and (old.status is null or old.status <> 'paid') then
    update public.products p
    set stock_units = greatest(0, p.stock_units - oi.quantity)
    from public.order_items oi
    where oi.order_id = new.id
      and oi.product_id = p.id;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_deduct_stock on public.orders;
create trigger tr_deduct_stock
  after update of status on public.orders
  for each row execute function public.deduct_stock_on_payment();
