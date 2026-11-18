/* =============================================================================
   CLORO Y PILETAS PANCHO — Ventas manuales (por WhatsApp)
   Migración: 20260502000006

   El owner registra ventas que se hicieron por fuera del e-commerce.
   También descuentan del stock.
============================================================================= */

-- ============================================================================
-- 1) Ventas manuales
-- ============================================================================

create table if not exists public.manual_sales (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.profiles(id),
  sold_by     uuid        not null references public.profiles(id),  -- owner o super_admin
  notes       text,
  total_cents bigint      not null check (total_cents >= 0),
  sold_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists ix_manual_sales_client_id on public.manual_sales(client_id);
create index if not exists ix_manual_sales_sold_at   on public.manual_sales(sold_at);


-- ============================================================================
-- 2) Items de la venta manual
-- ============================================================================

create table if not exists public.manual_sale_items (
  id                uuid        primary key default gen_random_uuid(),
  manual_sale_id    uuid        not null references public.manual_sales(id) on delete cascade,
  product_id        uuid        references public.products(id),
  product_name      text        not null,             -- snapshot (puede ser producto eliminado)
  quantity          integer     not null check (quantity > 0),
  unit_price_cents  bigint      not null check (unit_price_cents >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists ix_manual_sale_items_sale_id on public.manual_sale_items(manual_sale_id);


-- ============================================================================
-- 3) Trigger: descontar stock al registrar venta manual
-- ============================================================================

create or replace function public.deduct_stock_on_manual_sale()
returns trigger language plpgsql as $$
begin
  if new.product_id is not null then
    update public.products
    set stock_units = greatest(0, stock_units - new.quantity)
    where id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_deduct_stock_manual on public.manual_sale_items;
create trigger tr_deduct_stock_manual
  after insert on public.manual_sale_items
  for each row execute function public.deduct_stock_on_manual_sale();
