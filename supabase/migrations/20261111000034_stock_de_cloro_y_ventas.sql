/*
  Migración 34 — Stock de cloro, movimientos, venta rápida y reporte del cloro

  Pedido de Pancho (2026-11-11):
  - Cargar cloro de cualquier tipo de forma fácil (lo carga el dueño).
  - Separar cuánto cloro se vendió a clientes de service y cuánto a clientes que solo compran cloro.
  - El cloro que se aplica en los services SALE DEL MISMO DEPÓSITO, pero bien diferenciado.
  - También se vende a granel (litros, kilos o pastillas sueltas).
  - No hay ventas fiadas: lo único parecido es el cloro del service, que ya va a Cobros.
  - Aparte, la venta de otros productos.

  Modelo:
  1. chlorine_stock: un depósito por tipo de cloro, en su unidad base: líquido en LITROS, granulado en
     KILOS y pastillas en UNIDADES. Precio de lista a granel por unidad base y aviso de stock bajo.
  2. products.chlorine_content: cuánto cloro trae una unidad del producto (bidón de 5 L = 5). Un
     producto con contenido es una PRESENTACIÓN del depósito: venderlo descuenta del depósito
     (cantidad × contenido) y su stock propio (stock_units) deja de usarse. Sin contenido, el producto
     sigue con su stock propio, como hasta ahora.
  3. products.category: cloro, químicos, accesorios, combos u otros (los "otros productos").
     Coherente con chlorine_type: líquido/granulado/pastilla = cloro, combo = combos.
  4. stock_movements: el historial de todo lo que entra y sale (ingreso, venta, pedido online, service,
     correcciones, ajuste por conteo, merma). quantity = lo que cambió el stock; consumed = lo vendido o
     aplicado (para el reporte; si faltaba stock, consumed es mayor que lo que bajó el stock).
     Las referencias a ventas, pedidos y services NO son FK: el historial queda aunque se borre el origen.
  5. Ventas manuales: cliente opcional (venta de mostrador con nombre opcional), cantidades con
     decimales para el granel, y el SEGMENTO de la venta lo fija la base al guardarla:
     'service' (el cliente tiene una pileta activa), 'cloro' (cliente que solo compra cloro) o
     'mostrador' (sin cuenta). Es una foto: no cambia si el cliente después contrata el service.
  6. Services: al registrar cloro aplicado se descuenta del depósito (movimiento 'service'); si se
     corrige o se borra el registro, se devuelve lo descontado y se descuenta lo nuevo.
  7. reporte_cloro(desde, hasta): cuánto cloro salió por tipo y por canal, en unidades y en pesos.

  Reglas de stock (iguales a las de siempre): nunca queda negativo; si se vende o aplica más de lo que
  hay, queda en 0 y el faltante se anota (shortfall).
  Escritura del depósito y del historial: SOLO por las funciones de esta migración (security definer).
*/

-- ─── 1. Productos: contenido de cloro, categoría y aviso de stock bajo ───────────────────────────

alter table public.products add column if not exists chlorine_content numeric(12,3);
alter table public.products add column if not exists category text;
alter table public.products add column if not exists low_stock_alert integer;

update public.products
   set category = case chlorine_type when 'combo' then 'combos' when 'otro' then 'otros' else 'cloro' end
 where category is null;

alter table public.products alter column category set default 'otros';
alter table public.products alter column category set not null;

-- La categoría sale del tipo: cloro (líquido, granulado, pastilla), combos (combo). Solo los "otro"
-- eligen entre químicos, accesorios u otros.
create or replace function public.set_product_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.category := case
    when new.chlorine_type in ('pastilla', 'granulado', 'liquido') then 'cloro'
    when new.chlorine_type = 'combo' then 'combos'
    when new.category in ('quimicos', 'accesorios', 'otros') then new.category
    else 'otros' end;
  if new.chlorine_type not in ('pastilla', 'granulado', 'liquido') then
    new.chlorine_content := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_product_category() from public, anon, authenticated;

drop trigger if exists tr_set_product_category on public.products;
create trigger tr_set_product_category
  before insert or update of chlorine_type, category, chlorine_content on public.products
  for each row execute function public.set_product_category();

alter table public.products drop constraint if exists ck_products_category;
alter table public.products add constraint ck_products_category check (
  category in ('cloro', 'quimicos', 'accesorios', 'combos', 'otros')
  and (chlorine_type not in ('pastilla', 'granulado', 'liquido') or category = 'cloro')
  and (chlorine_type <> 'combo' or category = 'combos')
  and (chlorine_type <> 'otro' or category in ('quimicos', 'accesorios', 'otros'))
);

alter table public.products drop constraint if exists ck_products_chlorine_content;
alter table public.products add constraint ck_products_chlorine_content check (
  chlorine_content is null
  or (chlorine_content > 0 and chlorine_content <= 100000 and chlorine_type in ('pastilla', 'granulado', 'liquido'))
);

alter table public.products drop constraint if exists ck_products_low_stock_alert;
alter table public.products add constraint ck_products_low_stock_alert check (low_stock_alert is null or low_stock_alert between 0 and 1000000);

comment on column public.products.chlorine_content is
  'Cuánto cloro trae una unidad, en la unidad del depósito (litros, kilos o pastillas). Con valor, el producto descuenta del depósito de su tipo y no usa stock_units.';
comment on column public.products.category is 'cloro, quimicos, accesorios, combos u otros.';
comment on column public.products.low_stock_alert is 'Aviso de stock bajo para productos con stock propio (sin contenido de cloro).';

-- Marketing no cambia el stock ni el contenido de cloro (cambia de dónde descuenta el producto).
create or replace function public.guard_product_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if public.get_my_role() = 'marketing' and new.stock_units is distinct from old.stock_units then
    raise exception 'Marketing no puede cambiar el stock'
      using errcode = '42501';
  end if;

  if public.get_my_role() = 'marketing' and new.chlorine_content is distinct from old.chlorine_content then
    raise exception 'Marketing no puede cambiar el contenido de cloro'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_product_update() from public, anon, authenticated;

-- ─── 2. Depósito de cloro ───────────────────────────────────────────────────────────────────────

create table if not exists public.chlorine_stock (
  id              uuid primary key default gen_random_uuid(),
  chlorine_type   text not null unique,
  quantity        numeric(14,3) not null default 0,
  bulk_price_cents bigint,
  low_alert       numeric(14,3),
  updated_at      timestamptz not null default now(),
  constraint ck_chlorine_stock_type check (chlorine_type in ('liquido', 'granulado', 'pastilla')),
  constraint ck_chlorine_stock_quantity check (quantity >= 0 and quantity <= 100000000),
  constraint ck_chlorine_stock_price check (bulk_price_cents is null or (bulk_price_cents >= 0 and bulk_price_cents <= 10000000000)),
  constraint ck_chlorine_stock_alert check (low_alert is null or (low_alert >= 0 and low_alert <= 100000000))
);

comment on table public.chlorine_stock is
  'Depósito de cloro por tipo. Líquido en litros, granulado en kilos, pastillas en unidades. Se escribe solo con las funciones de stock.';
comment on column public.chlorine_stock.bulk_price_cents is 'Precio de lista a granel por litro, kilo o pastilla (centavos).';

drop trigger if exists tr_chlorine_stock_updated_at on public.chlorine_stock;
create trigger tr_chlorine_stock_updated_at
  before update on public.chlorine_stock
  for each row execute function public.set_updated_at();

insert into public.chlorine_stock (chlorine_type) values ('liquido'), ('granulado'), ('pastilla')
on conflict (chlorine_type) do nothing;

alter table public.chlorine_stock enable row level security;

drop policy if exists "chlorine_stock: staff read" on public.chlorine_stock;
create policy "chlorine_stock: staff read"
  on public.chlorine_stock for select
  using (public.get_my_role() in ('super_admin', 'owner', 'marketing'));

drop policy if exists "blocked denied" on public.chlorine_stock;
create policy "blocked denied" on public.chlorine_stock as restrictive for all using (not (select public.is_blocked()));

revoke all on public.chlorine_stock from anon;
revoke insert, update, delete on public.chlorine_stock from authenticated;
grant select on public.chlorine_stock to authenticated;

-- ─── 3. Historial de movimientos ─────────────────────────────────────────────────────────────────

create table if not exists public.stock_movements (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,
  chlorine_type       text,
  product_id          uuid references public.products(id) on delete set null,
  product_name        text,
  quantity            numeric(14,3) not null,
  consumed            numeric(14,3),
  shortfall           numeric(14,3) not null default 0,
  amount_cents        bigint,
  segment             text,
  client_id           uuid references public.profiles(id) on delete set null,
  manual_sale_id      uuid,
  manual_sale_item_id uuid,
  order_item_id       uuid,
  service_log_id      uuid,
  cost_cents          bigint,
  supplier            text,
  note                text,
  occurred_on         date not null default public.today_ar(),
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint ck_stock_movements_kind check (kind in (
    'ingreso', 'venta', 'pedido', 'pedido_cancelado', 'service', 'service_corregido', 'ajuste', 'merma')),
  constraint ck_stock_movements_target check (chlorine_type is not null or product_name is not null),
  constraint ck_stock_movements_type check (chlorine_type is null or chlorine_type in ('liquido', 'granulado', 'pastilla')),
  constraint ck_stock_movements_segment check (segment is null or segment in ('service', 'cloro', 'mostrador')),
  constraint ck_stock_movements_shortfall check (shortfall >= 0),
  constraint ck_stock_movements_cost check (cost_cents is null or (cost_cents >= 0 and cost_cents <= 10000000000)),
  constraint ck_stock_movements_text check (
    (supplier is null or char_length(supplier) <= 120) and (note is null or char_length(note) <= 500))
);

comment on table public.stock_movements is
  'Historial de stock. quantity: cuánto cambió el stock (+ entra, − sale). consumed: lo vendido o aplicado (para el reporte). Solo lo escriben las funciones de stock.';

create index if not exists ix_stock_movements_date on public.stock_movements (occurred_on desc, created_at desc);
create index if not exists ix_stock_movements_service_log on public.stock_movements (service_log_id) where service_log_id is not null;
create index if not exists ix_stock_movements_order_item on public.stock_movements (order_item_id) where order_item_id is not null;
create index if not exists ix_stock_movements_product on public.stock_movements (product_id) where product_id is not null;

alter table public.stock_movements enable row level security;

drop policy if exists "stock_movements: owner read" on public.stock_movements;
create policy "stock_movements: owner read"
  on public.stock_movements for select
  using (public.is_owner_or_above());

drop policy if exists "blocked denied" on public.stock_movements;
create policy "blocked denied" on public.stock_movements as restrictive for all using (not (select public.is_blocked()));

revoke all on public.stock_movements from anon;
revoke insert, update, delete on public.stock_movements from authenticated;
grant select on public.stock_movements to authenticated;

-- ─── 4. Helpers ──────────────────────────────────────────────────────────────────────────────────

-- Segmento de un cliente hoy: 'service' si tiene una pileta activa (titular o compartida), si no 'cloro'.
-- Sin cliente: 'mostrador'.
create or replace function public.segmento_cliente(p_client uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_client is null then 'mostrador'
    when exists (select 1 from public.pools p where p.client_id = p_client and p.is_active)
      or exists (select 1 from public.pool_clients pc join public.pools p on p.id = pc.pool_id
                 where pc.client_id = p_client and p.is_active)
      then 'service'
    else 'cloro'
  end;
$$;

revoke execute on function public.segmento_cliente(uuid) from public, anon, authenticated;

-- Dueño o súper admin con la cuenta habilitada (las funciones security definer no pasan por RLS).
create or replace function public.es_dueno_activo()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.is_owner_or_above() and not public.is_blocked();
$$;

-- Saca cloro del depósito. Devuelve lo que realmente bajó (nunca deja el depósito negativo).
create or replace function public.sacar_del_deposito(p_type text, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_have numeric;
  v_take numeric;
begin
  select quantity into v_have from public.chlorine_stock where chlorine_type = p_type for update;
  if not found then
    raise exception 'Tipo de cloro inválido' using errcode = '22023';
  end if;
  v_take := least(v_have, greatest(p_amount, 0));
  update public.chlorine_stock set quantity = quantity - v_take, updated_at = now() where chlorine_type = p_type;
  return v_take;
end;
$$;

create or replace function public.sumar_al_deposito(p_type text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.chlorine_stock set quantity = quantity + p_amount, updated_at = now() where chlorine_type = p_type;
  if not found then
    raise exception 'Tipo de cloro inválido' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.sacar_del_deposito(text, numeric) from public, anon, authenticated;
revoke execute on function public.sumar_al_deposito(text, numeric) from public, anon, authenticated;

-- Cloro de un service en la unidad del depósito: granulado se registra en gramos y el depósito va en kilos.
create or replace function public.cloro_service_en_deposito(p_type text, p_amount numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_type = 'granulado' then p_amount / 1000 else p_amount end;
$$;

-- ─── 5. Ventas manuales: mostrador, granel y segmento ────────────────────────────────────────────

alter table public.manual_sales alter column client_id drop not null;
alter table public.manual_sales add column if not exists walkin_name text;
alter table public.manual_sales add column if not exists segment text;

update public.manual_sales set segment = public.segmento_cliente(client_id) where segment is null;
alter table public.manual_sales alter column segment set not null;

alter table public.manual_sales drop constraint if exists ck_manual_sales_segment;
alter table public.manual_sales add constraint ck_manual_sales_segment check (segment in ('service', 'cloro', 'mostrador'));
alter table public.manual_sales drop constraint if exists ck_manual_sales_walkin;
alter table public.manual_sales add constraint ck_manual_sales_walkin check (
  (walkin_name is null or char_length(walkin_name) <= 80) and (client_id is null or walkin_name is null));

comment on column public.manual_sales.segment is
  'Lo fija la base al guardar: service (cliente con pileta activa), cloro (cliente solo de cloro) o mostrador (sin cuenta).';
comment on column public.manual_sales.walkin_name is 'Venta de mostrador: nombre opcional del comprador (sin cuenta).';

alter table public.manual_sale_items alter column quantity type numeric(12,3);
alter table public.manual_sale_items alter column stock_shortfall type numeric(14,3);
alter table public.manual_sale_items add column if not exists chlorine_type text;
alter table public.manual_sale_items add column if not exists chlorine_amount numeric(14,3);

alter table public.manual_sale_items drop constraint if exists ck_manual_sale_items_chlorine;
alter table public.manual_sale_items add constraint ck_manual_sale_items_chlorine check (
  chlorine_type is null or chlorine_type in ('liquido', 'granulado', 'pastilla'));
alter table public.manual_sale_items drop constraint if exists ck_manual_sale_items_quantity;
alter table public.manual_sale_items add constraint ck_manual_sale_items_quantity check (quantity > 0 and quantity <= 100000);

comment on column public.manual_sale_items.chlorine_type is
  'Tipo de cloro de la línea: a granel (sin producto) o el de la presentación del depósito.';
comment on column public.manual_sale_items.chlorine_amount is
  'Cloro que representa la línea en la unidad del depósito (litros, kilos o pastillas).';

-- Total: suma de cantidad × precio, redondeada por línea (el granel admite decimales).
create or replace function public.check_manual_sale_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale  uuid := coalesce(new.manual_sale_id, old.manual_sale_id);
  v_total bigint;
  v_sum   numeric;
begin
  select total_cents into v_total from public.manual_sales where id = v_sale;
  if not found then
    return null; -- la venta se borró (cascada)
  end if;

  select coalesce(sum(round(quantity * unit_price_cents)), 0) into v_sum
  from public.manual_sale_items where manual_sale_id = v_sale;

  if v_sum <> v_total then
    raise exception 'El total de la venta no coincide con la suma de sus ítems' using errcode = '23514';
  end if;
  return null;
end;
$$;

-- Guard de la venta: el segmento lo pone siempre la base; el resto, como antes.
create or replace function public.guard_manual_sale_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.segment := public.segmento_cliente(new.client_id);
    if new.client_id is not null then
      new.walkin_name := null;
    else
      new.walkin_name := nullif(btrim(new.walkin_name), '');
    end if;
  elsif new.segment is distinct from old.segment then
    raise exception 'El cliente, el vendedor y el total de una venta no se pueden modificar' using errcode = '42501';
  end if;

  -- Procesos del sistema (service role) y roles sin permiso de escritura: estos últimos los niega RLS.
  if auth.uid() is null or not public.is_owner_or_above() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.client_id is not null
       and not exists (select 1 from public.profiles where id = new.client_id and role = 'client') then
      raise exception 'El destinatario de la venta no es un cliente' using errcode = '22023';
    end if;
  else
    if new.client_id   is distinct from old.client_id
       or new.walkin_name is distinct from old.walkin_name
       or new.sold_by     is distinct from old.sold_by
       or new.total_cents is distinct from old.total_cents
    then
      raise exception 'El cliente, el vendedor y el total de una venta no se pueden modificar'
        using errcode = '42501';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.sold_at is distinct from old.sold_at)
     and (new.sold_at > now() + interval '1 day' or new.sold_at < now() - interval '1 year')
  then
    raise exception 'Fecha de venta fuera de rango' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_manual_sale_write() from public, anon, authenticated;

-- Descuento al vender: granel y presentaciones salen del depósito; el resto, del stock del producto.
create or replace function public.deduct_stock_on_manual_sale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale    record;
  v_pid     uuid;
  v_ptype   text;
  v_pcont   numeric;
  v_stock   integer;
  v_amount  numeric;
  v_take    numeric;
  v_line    bigint := round(new.quantity * new.unit_price_cents);
begin
  select client_id, segment, sold_at into v_sale from public.manual_sales where id = new.manual_sale_id;

  if new.product_id is not null then
    select id, chlorine_type, chlorine_content into v_pid, v_ptype, v_pcont
    from public.products where id = new.product_id for update;
  end if;

  if new.product_id is null and new.chlorine_type is not null then
    -- Granel
    v_amount := new.quantity;
  elsif v_pid is not null and v_pcont is not null then
    -- Presentación del depósito: se vende por unidad entera
    if new.quantity <> trunc(new.quantity) then
      raise exception 'Ítem de venta inválido' using errcode = '22023';
    end if;
    new.chlorine_type := v_ptype;
    v_amount := new.quantity * v_pcont;
  else
    new.chlorine_type := null;
    v_amount := null;
  end if;

  if v_amount is not null then
    if new.chlorine_type = 'pastilla' and v_amount * 2 <> trunc(v_amount * 2) then
      raise exception 'Las pastillas se venden enteras o por mitades' using errcode = '22023';
    end if;
    new.chlorine_amount := v_amount;
    v_take := public.sacar_del_deposito(new.chlorine_type, v_amount);
    -- El faltante va en la unidad de la línea (bidones, o litros/kilos/pastillas a granel)
    new.stock_shortfall := round((v_amount - v_take) * new.quantity / v_amount, 3);
    insert into public.stock_movements (kind, chlorine_type, product_id, product_name, quantity, consumed, shortfall,
      amount_cents, segment, client_id, manual_sale_id, manual_sale_item_id, occurred_on, created_by)
    values ('venta', new.chlorine_type, new.product_id, new.product_name, -v_take, v_amount, v_amount - v_take,
      v_line, v_sale.segment, v_sale.client_id, new.manual_sale_id, new.id,
      (v_sale.sold_at at time zone 'America/Argentina/Buenos_Aires')::date, auth.uid());
  elsif v_pid is not null then
    if new.quantity <> trunc(new.quantity) then
      raise exception 'Ítem de venta inválido' using errcode = '22023';
    end if;
    select stock_units into v_stock from public.products where id = new.product_id;
    new.stock_shortfall := greatest(0, new.quantity - v_stock);
    update public.products set stock_units = greatest(0, v_stock - new.quantity::integer) where id = new.product_id;
    insert into public.stock_movements (kind, product_id, product_name, quantity, consumed, shortfall,
      amount_cents, segment, client_id, manual_sale_id, manual_sale_item_id, occurred_on, created_by)
    values ('venta', new.product_id, new.product_name, -least(new.quantity, v_stock), new.quantity,
      greatest(0, new.quantity - v_stock), v_line, v_sale.segment, v_sale.client_id, new.manual_sale_id, new.id,
      (v_sale.sold_at at time zone 'America/Argentina/Buenos_Aires')::date, auth.uid());
  else
    -- Venta libre ("Otro (manual)"): no toca stock, pero queda en el historial de ventas
    if new.quantity <> trunc(new.quantity) then
      raise exception 'Ítem de venta inválido' using errcode = '22023';
    end if;
    new.stock_shortfall := 0;
  end if;

  return new;
end;
$$;

revoke execute on function public.deduct_stock_on_manual_sale() from public, anon, authenticated;

-- Venta manual en una transacción. p_client_id null = venta de mostrador (p_walkin_name opcional).
-- Ítems: {product_id?, product_name, quantity, unit_price_cents, chlorine_type?} (chlorine_type sin producto = granel).
drop function if exists public.crear_venta_manual(uuid, text, timestamptz, jsonb);
create or replace function public.crear_venta_manual(
  p_client_id uuid, p_notes text, p_sold_at timestamptz, p_items jsonb, p_walkin_name text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item      jsonb;
  v_qty       numeric;
  v_price     bigint;
  v_name      text;
  v_type      text;
  v_total     bigint := 0;
  v_sale_id   uuid;
  v_shortages jsonb;
  v_segment   text;
begin
  if p_client_id is not null
     and not exists (select 1 from public.profiles where id = p_client_id and role = 'client') then
    raise exception 'El destinatario de la venta no es un cliente' using errcode = '22023';
  end if;
  if p_walkin_name is not null and char_length(btrim(p_walkin_name)) > 80 then
    raise exception 'El nombre del comprador es demasiado largo' using errcode = '22023';
  end if;
  if p_sold_at is not null and (p_sold_at > now() + interval '1 day' or p_sold_at < now() - interval '1 year') then
    raise exception 'Fecha de venta fuera de rango' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un producto' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Demasiados ítems en una venta' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name  := nullif(btrim(v_item->>'product_name'), '');
    v_qty   := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price_cents')::bigint;
    v_type  := nullif(v_item->>'chlorine_type', '');

    if v_name is null or v_qty is null or v_qty <= 0 or v_qty > 100000
       or v_price is null or v_price < 0 or v_price > 100000000000
       or (v_type is not null and v_type not in ('liquido', 'granulado', 'pastilla'))
       or (v_type is null and nullif(v_item->>'product_id', '') is null and v_qty <> trunc(v_qty))
       or round(v_qty, 3) <> v_qty then
      raise exception 'Ítem de venta inválido' using errcode = '22023';
    end if;
    v_total := v_total + round(v_qty * v_price);
  end loop;

  if v_total > 1000000000000 then
    raise exception 'El total de la venta es demasiado alto' using errcode = '22023';
  end if;

  insert into public.manual_sales (client_id, walkin_name, sold_by, notes, total_cents, sold_at)
  values (p_client_id, case when p_client_id is null then nullif(btrim(p_walkin_name), '') end,
          auth.uid(), nullif(btrim(p_notes), ''), v_total, coalesce(p_sold_at, now()))
  returning id, segment into v_sale_id, v_segment;

  insert into public.manual_sale_items (manual_sale_id, product_id, product_name, quantity, unit_price_cents, chlorine_type)
  select v_sale_id,
         nullif(e->>'product_id', '')::uuid,
         btrim(e->>'product_name'),
         (e->>'quantity')::numeric,
         (e->>'unit_price_cents')::bigint,
         case when nullif(e->>'product_id', '') is null then nullif(e->>'chlorine_type', '') end
  from jsonb_array_elements(p_items) e;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_name',  product_name,
           'quantity',      quantity,
           'missing',       stock_shortfall,
           'chlorine_type', chlorine_type,
           'missing_chlorine', case when chlorine_amount is null then null
                                    else round(chlorine_amount * stock_shortfall / quantity, 3) end
         )), '[]'::jsonb)
  into v_shortages
  from public.manual_sale_items
  where manual_sale_id = v_sale_id and stock_shortfall > 0;

  return jsonb_build_object('sale_id', v_sale_id, 'total_cents', v_total, 'segment', v_segment, 'shortages', v_shortages);
end;
$$;

revoke execute on function public.crear_venta_manual(uuid, text, timestamptz, jsonb, text) from public, anon;
grant execute on function public.crear_venta_manual(uuid, text, timestamptz, jsonb, text) to authenticated;

-- ─── 6. Pedidos online: las presentaciones descuentan del depósito ──────────────────────────────

create or replace function public.deduct_stock_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old     int;
  v_new     int;
  v_stock   integer;
  v_take    numeric;
  v_amount  numeric;
  v_segment text;
  r         record;
  m         record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'Un pedido cancelado no se puede reactivar' using errcode = '23514';
  end if;

  v_old := case old.status when 'pending' then 0 when 'paid' then 1 when 'preparing' then 2
                           when 'shipped' then 3 when 'delivered' then 4 end;
  v_new := case new.status when 'pending' then 0 when 'paid' then 1 when 'preparing' then 2
                           when 'shipped' then 3 when 'delivered' then 4 end; -- 'cancelled' → null

  if new.status <> 'cancelled' and v_new < v_old then
    raise exception 'El estado de un pedido no puede retroceder' using errcode = '23514';
  end if;

  -- Cancelación: se devuelve exactamente lo que se había descontado
  if new.status = 'cancelled' then
    if old.stock_deducted_at is not null then
      for r in select oi.id, oi.product_id, oi.stock_deducted from public.order_items oi
               where oi.order_id = new.id loop
        select coalesce(sum(quantity), 0) q, coalesce(sum(consumed), 0) c, coalesce(sum(amount_cents), 0) a,
               max(chlorine_type) t, max(product_name) n, max(segment) s, max(client_id::text)::uuid cl
          into m
          from public.stock_movements where order_item_id = r.id;
        if m.t is not null then
          if m.q < 0 then
            perform public.sumar_al_deposito(m.t, -m.q);
          end if;
          if m.c <> 0 then
            insert into public.stock_movements (kind, chlorine_type, product_id, product_name, quantity, consumed,
              amount_cents, segment, client_id, order_item_id, created_by)
            values ('pedido_cancelado', m.t, r.product_id, m.n, -m.q, -m.c, -m.a, m.s, m.cl, r.id, auth.uid());
          end if;
        elsif r.stock_deducted > 0 then
          update public.products set stock_units = stock_units + r.stock_deducted where id = r.product_id;
          if m.c <> 0 then
            insert into public.stock_movements (kind, product_id, product_name, quantity, consumed, amount_cents,
              segment, client_id, order_item_id, created_by)
            values ('pedido_cancelado', r.product_id, m.n, r.stock_deducted, -m.c, -m.a, m.s, m.cl, r.id, auth.uid());
          end if;
        end if;
        update public.order_items set stock_deducted = 0 where id = r.id;
      end loop;
      new.stock_deducted_at := null;
    end if;
    return new;
  end if;

  -- Primera vez que el pedido llega a "pagado" o más allá: se descuenta una sola vez
  if new.stock_deducted_at is null and v_new >= 1 then
    v_segment := public.segmento_cliente(new.client_id);
    for r in select oi.id, oi.product_id, oi.product_name, oi.quantity, oi.unit_price_cents,
                    p.chlorine_type, p.chlorine_content
             from public.order_items oi left join public.products p on p.id = oi.product_id
             where oi.order_id = new.id loop
      if r.chlorine_content is not null then
        v_amount := r.quantity * r.chlorine_content;
        v_take := public.sacar_del_deposito(r.chlorine_type, v_amount);
        update public.order_items set stock_deducted = r.quantity where id = r.id;
        insert into public.stock_movements (kind, chlorine_type, product_id, product_name, quantity, consumed, shortfall,
          amount_cents, segment, client_id, order_item_id, created_by)
        values ('pedido', r.chlorine_type, r.product_id, r.product_name, -v_take, v_amount, v_amount - v_take,
          r.quantity::bigint * r.unit_price_cents, v_segment, new.client_id, r.id, auth.uid());
      else
        select stock_units into v_stock from public.products where id = r.product_id for update;
        v_take := least(coalesce(v_stock, 0), r.quantity);
        update public.products set stock_units = stock_units - v_take::integer where id = r.product_id;
        update public.order_items set stock_deducted = v_take::integer where id = r.id;
        insert into public.stock_movements (kind, product_id, product_name, quantity, consumed, shortfall,
          amount_cents, segment, client_id, order_item_id, created_by)
        values ('pedido', r.product_id, r.product_name, -v_take, r.quantity, r.quantity - v_take,
          r.quantity::bigint * r.unit_price_cents, v_segment, new.client_id, r.id, auth.uid());
      end if;
    end loop;
    new.stock_deducted_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function public.deduct_stock_on_payment() from public, anon, authenticated;

-- ─── 7. Services: el cloro aplicado sale del depósito ────────────────────────────────────────────

create or replace function public.stock_por_service()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m        record;
  v_amount numeric;
  v_take   numeric;
  v_price  bigint;
  v_kind   text;
begin
  -- 1. Si es corrección o borrado, devolver lo que ese registro había descontado
  if tg_op in ('UPDATE', 'DELETE') then
    if tg_op = 'UPDATE'
       and new.chlorine_applied is not distinct from old.chlorine_applied
       and new.chlorine_type    is not distinct from old.chlorine_type
       and new.chlorine_amount  is not distinct from old.chlorine_amount
       and new.client_id        is not distinct from old.client_id
       and new.date             is not distinct from old.date then
      return null;
    end if;

    -- Por tipo: si el registro se corrigió de un cloro a otro, cada depósito recupera lo suyo
    for m in select chlorine_type t, coalesce(sum(quantity), 0) q, coalesce(sum(consumed), 0) c,
                    coalesce(sum(amount_cents), 0) a
               from public.stock_movements
              where service_log_id = old.id and chlorine_type is not null
              group by chlorine_type loop
      if m.q <> 0 or m.c <> 0 or m.a <> 0 then
        if m.q < 0 then
          perform public.sumar_al_deposito(m.t, -m.q);
        end if;
        insert into public.stock_movements (kind, chlorine_type, quantity, consumed, amount_cents, segment, client_id,
          service_log_id, occurred_on, created_by, note)
        values ('service_corregido', m.t, -m.q, -m.c, -m.a, 'service', old.client_id, old.id, old.date, auth.uid(),
          case when tg_op = 'DELETE' then 'Registro borrado' else 'Registro corregido' end);
      end if;
    end loop;
  end if;

  if tg_op = 'DELETE' then
    return null;
  end if;

  -- 2. Descontar lo que dice el registro (nuevo o corregido)
  if new.chlorine_applied and new.chlorine_type in ('liquido', 'granulado', 'pastilla')
     and coalesce(new.chlorine_amount, 0) > 0 then
    v_amount := public.cloro_service_en_deposito(new.chlorine_type, new.chlorine_amount);
    v_take := public.sacar_del_deposito(new.chlorine_type, v_amount);
    v_kind := 'cloro_' || new.chlorine_type;
    v_price := public.precio_vigente(new.client_id, v_kind, new.date);
    insert into public.stock_movements (kind, chlorine_type, quantity, consumed, shortfall, amount_cents, segment,
      client_id, service_log_id, occurred_on, created_by)
    values ('service', new.chlorine_type, -v_take, v_amount, v_amount - v_take,
      case when v_price is null then null else round(v_amount * v_price) end,
      'service', new.client_id, new.id, new.date, auth.uid());
  end if;

  return null;
end;
$$;

revoke execute on function public.stock_por_service() from public, anon, authenticated;

drop trigger if exists tr_stock_por_service on public.service_logs;
create trigger tr_stock_por_service
  after insert or update or delete on public.service_logs
  for each row execute function public.stock_por_service();

-- El trigger es security definer: aunque registre un empleado, el precio del cliente se lee (el empleado
-- nunca lo ve: stock_movements es solo del dueño). Ver tests/db/stock-cloro.test.ts.

-- ─── 8. Acciones del dueño: ingreso, conteo, merma, precio y aviso ──────────────────────────────

-- Ingreso de mercadería. Cloro: p_chlorine_type + p_product_id (presentación, cantidad entera) o solo
-- p_chlorine_type (a granel, cantidad en litros/kilos/pastillas). Otros productos: p_product_id sin contenido.
create or replace function public.ingresar_stock(
  p_chlorine_type text, p_product_id uuid, p_quantity numeric,
  p_cost_cents bigint default null, p_supplier text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pid    uuid;
  v_pname  text;
  v_ptype  text;
  v_pcont  numeric;
  v_amount numeric;
  v_type   text := nullif(p_chlorine_type, '');
  v_name   text;
  v_new    numeric;
begin
  if not public.es_dueno_activo() then
    raise exception 'No tenés permisos para esta acción' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 or round(p_quantity, 3) <> p_quantity then
    raise exception 'La cantidad tiene que ser mayor a 0' using errcode = '22023';
  end if;
  if p_cost_cents is not null and (p_cost_cents < 0 or p_cost_cents > 10000000000) then
    raise exception 'El costo no es válido' using errcode = '22023';
  end if;
  if (p_supplier is not null and char_length(p_supplier) > 120) or (p_note is not null and char_length(p_note) > 500) then
    raise exception 'El proveedor o la nota son demasiado largos' using errcode = '22023';
  end if;

  if p_product_id is not null then
    select id, name, chlorine_type, chlorine_content into v_pid, v_pname, v_ptype, v_pcont
      from public.products where id = p_product_id for update;
    if not found then
      raise exception 'Producto no encontrado o sin permisos' using errcode = 'P0002';
    end if;
    if p_quantity <> trunc(p_quantity) then
      raise exception 'Los productos se cargan por unidad entera' using errcode = '22023';
    end if;
  end if;

  if v_pid is not null and v_pcont is not null then
    v_type := v_ptype;
    v_amount := p_quantity * v_pcont;
    v_name := trim(to_char(p_quantity, 'FM999999990')) || ' × ' || v_pname;
  elsif v_pid is not null then
    update public.products set stock_units = stock_units + p_quantity::integer where id = p_product_id
      returning stock_units into v_new;
    insert into public.stock_movements (kind, product_id, product_name, quantity, cost_cents, supplier, note, created_by)
    values ('ingreso', p_product_id, v_pname, p_quantity, p_cost_cents,
      nullif(btrim(p_supplier), ''), nullif(btrim(p_note), ''), auth.uid());
    return jsonb_build_object('product_id', p_product_id, 'stock', v_new);
  else
    if v_type is null or v_type not in ('liquido', 'granulado', 'pastilla') then
      raise exception 'Elegí qué cloro llegó' using errcode = '22023';
    end if;
    if v_type = 'pastilla' and p_quantity * 2 <> trunc(p_quantity * 2) then
      raise exception 'Las pastillas se cargan enteras o por mitades' using errcode = '22023';
    end if;
    v_amount := p_quantity;
    v_name := 'A granel';
  end if;

  perform public.sumar_al_deposito(v_type, v_amount);
  insert into public.stock_movements (kind, chlorine_type, product_id, product_name, quantity, cost_cents, supplier, note, created_by)
  values ('ingreso', v_type, p_product_id, v_name, v_amount, p_cost_cents,
    nullif(btrim(p_supplier), ''), nullif(btrim(p_note), ''), auth.uid());

  select quantity into v_new from public.chlorine_stock where chlorine_type = v_type;
  return jsonb_build_object('chlorine_type', v_type, 'added', v_amount, 'stock', v_new);
end;
$$;

revoke execute on function public.ingresar_stock(text, uuid, numeric, bigint, text, text) from public, anon;
grant execute on function public.ingresar_stock(text, uuid, numeric, bigint, text, text) to authenticated;

-- Conteo: el dueño cuenta lo que hay y el sistema ajusta la diferencia (movimiento 'ajuste').
-- Merma: sale cloro sin venta (se rompió, se regaló, se usó en casa): movimiento 'merma'.
create or replace function public.contar_cloro(p_chlorine_type text, p_quantity numeric, p_note text default null)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_have numeric;
begin
  if not public.es_dueno_activo() then
    raise exception 'No tenés permisos para esta acción' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 100000000 or round(p_quantity, 3) <> p_quantity then
    raise exception 'La cantidad no es válida' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'El proveedor o la nota son demasiado largos' using errcode = '22023';
  end if;
  select quantity into v_have from public.chlorine_stock where chlorine_type = p_chlorine_type for update;
  if not found then
    raise exception 'Tipo de cloro inválido' using errcode = '22023';
  end if;
  if v_have = p_quantity then
    return v_have;
  end if;
  update public.chlorine_stock set quantity = p_quantity, updated_at = now() where chlorine_type = p_chlorine_type;
  insert into public.stock_movements (kind, chlorine_type, product_name, quantity, note, created_by)
  values ('ajuste', p_chlorine_type, 'Conteo', p_quantity - v_have, coalesce(nullif(btrim(p_note), ''), 'Conteo del depósito'), auth.uid());
  return p_quantity;
end;
$$;

create or replace function public.sacar_merma(p_chlorine_type text, p_quantity numeric, p_note text)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_take numeric;
begin
  if not public.es_dueno_activo() then
    raise exception 'No tenés permisos para esta acción' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 or round(p_quantity, 3) <> p_quantity then
    raise exception 'La cantidad tiene que ser mayor a 0' using errcode = '22023';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'Contá por qué sale ese cloro' using errcode = '22023';
  end if;
  if char_length(p_note) > 500 then
    raise exception 'El proveedor o la nota son demasiado largos' using errcode = '22023';
  end if;
  v_take := public.sacar_del_deposito(p_chlorine_type, p_quantity);
  insert into public.stock_movements (kind, chlorine_type, product_name, quantity, consumed, shortfall, note, created_by)
  values ('merma', p_chlorine_type, 'Merma', -v_take, p_quantity, p_quantity - v_take, btrim(p_note), auth.uid());
  return (select quantity from public.chlorine_stock where chlorine_type = p_chlorine_type);
end;
$$;

create or replace function public.configurar_deposito(p_chlorine_type text, p_bulk_price_cents bigint, p_low_alert numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_dueno_activo() then
    raise exception 'No tenés permisos para esta acción' using errcode = '42501';
  end if;
  if (p_bulk_price_cents is not null and (p_bulk_price_cents < 0 or p_bulk_price_cents > 10000000000))
     or (p_low_alert is not null and (p_low_alert < 0 or p_low_alert > 100000000)) then
    raise exception 'El precio o el aviso no son válidos' using errcode = '22023';
  end if;
  update public.chlorine_stock
     set bulk_price_cents = p_bulk_price_cents, low_alert = p_low_alert, updated_at = now()
   where chlorine_type = p_chlorine_type;
  if not found then
    raise exception 'Tipo de cloro inválido' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.contar_cloro(text, numeric, text) from public, anon;
revoke execute on function public.sacar_merma(text, numeric, text) from public, anon;
revoke execute on function public.configurar_deposito(text, bigint, numeric) from public, anon;
grant execute on function public.contar_cloro(text, numeric, text) to authenticated;
grant execute on function public.sacar_merma(text, numeric, text) to authenticated;
grant execute on function public.configurar_deposito(text, bigint, numeric) to authenticated;

-- El ajuste +1/−1 de productos con stock propio también queda en el historial. Pasa a security definer
-- (el historial no se escribe desde afuera), con los mismos permisos y mensajes que antes.
create or replace function public.adjust_stock(p_product_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old   integer;
  v_stock integer;
  v_name  text;
begin
  if public.get_my_role() = 'marketing' and not public.is_blocked() then
    raise exception 'Marketing no puede cambiar el stock' using errcode = '42501';
  end if;
  if not public.es_dueno_activo() then
    raise exception 'Producto no encontrado o sin permisos' using errcode = 'P0002';
  end if;

  select stock_units, name into v_old, v_name from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Producto no encontrado o sin permisos' using errcode = 'P0002';
  end if;

  update public.products
  set stock_units = greatest(0, stock_units + p_delta)
  where id = p_product_id
  returning stock_units into v_stock;

  if v_stock <> v_old then
    insert into public.stock_movements (kind, product_id, product_name, quantity, note, created_by)
    values ('ajuste', p_product_id, v_name, v_stock - v_old, 'Ajuste manual', auth.uid());
  end if;

  return v_stock;
end;
$$;

revoke execute on function public.adjust_stock(uuid, integer) from public, anon;
grant execute on function public.adjust_stock(uuid, integer) to authenticated;

-- ─── 9. Reporte del cloro ────────────────────────────────────────────────────────────────────────

-- Por tipo de cloro y canal: service (aplicado en services), venta_service (vendido a clientes de
-- service), venta_cloro (clientes solo de cloro), mostrador. Cantidad en la unidad del depósito.
-- origen: manual | online | service. Otros productos: chlorine_type null, con su categoría.
create or replace function public.reporte_cloro(p_desde date, p_hasta date)
returns table (
  chlorine_type text, category text, product_name text, canal text, origen text,
  cantidad numeric, importe_cents bigint, movimientos bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_dueno_activo() then
    raise exception 'Solo el dueño puede ver el reporte' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El período no es válido' using errcode = '22023';
  end if;

  return query
  select m.chlorine_type,
         case when m.chlorine_type is not null then 'cloro' else coalesce(p.category, 'otros') end,
         case when m.chlorine_type is not null then null else coalesce(p.name, m.product_name) end,
         case when m.kind in ('service', 'service_corregido') then 'service'
              when m.segment = 'service' then 'venta_service'
              when m.segment = 'cloro' then 'venta_cloro'
              else 'mostrador' end,
         case when m.kind in ('service', 'service_corregido') then 'service'
              when m.kind in ('pedido', 'pedido_cancelado') then 'online'
              else 'manual' end,
         sum(m.consumed),
         sum(coalesce(m.amount_cents, 0))::bigint,
         count(*) filter (where m.kind in ('service', 'venta', 'pedido'))
  from public.stock_movements m
  left join public.products p on p.id = m.product_id
  where m.occurred_on between p_desde and p_hasta
    and m.kind in ('service', 'service_corregido', 'venta', 'pedido', 'pedido_cancelado')
  group by 1, 2, 3, 4, 5
  having sum(m.consumed) <> 0 or sum(coalesce(m.amount_cents, 0)) <> 0;
end;
$$;

revoke execute on function public.reporte_cloro(date, date) from public, anon;
grant execute on function public.reporte_cloro(date, date) to authenticated;
