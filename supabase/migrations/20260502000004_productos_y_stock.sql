/* =============================================================================
   CLORO Y PILETAS PANCHO — Productos y stock de cloro
   Migración: 20260502000004

   Nota: este stock corresponde a la línea de VENTA DE CLORO.
   El cloro usado en services se registra en service_logs (circuito separado).
============================================================================= */

create table if not exists public.products (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  description     text,
  chlorine_type   text        not null,
  price_cents     bigint      not null check (price_cents >= 0),
  stock_units     integer     not null default 0 check (stock_units >= 0),
  unit            text        not null default 'kg',
  weight_kg       numeric(6,2),
  image_url       text,
  -- Visibilidad en landing (controlado por marketing)
  is_active       boolean     not null default true,
  is_featured     boolean     not null default false,
  display_order   integer     not null default 0,
  promo_label     text,                                       -- "MÁS VENDIDO", "OFERTA"
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ck_products_chlorine_type
    check (chlorine_type in ('pastilla', 'granulado', 'liquido', 'combo', 'otro')),
  constraint ck_products_unit
    check (unit in ('kg', 'litro', 'unidad'))
);

drop trigger if exists tr_products_updated_at on public.products;
create trigger tr_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create index if not exists ix_products_is_active   on public.products(is_active);
create index if not exists ix_products_is_featured on public.products(is_featured);
create index if not exists ix_products_order       on public.products(display_order);
