/* =============================================================================
   CLORO Y PILETAS PANCHO — Ventas manuales atómicas y faltante de stock
   Migración: 20261003000016

   Problemas:
   - La venta y sus ítems se insertaban por separado, con un borrado
     "compensatorio" si fallaban los ítems (no era una transacción).
   - El descuento usaba greatest(0, stock - cantidad): al vender más de lo que
     había, el faltante se perdía sin dejar rastro.

   Decisión de negocio: SE PERMITE vender más de lo que figura en stock (el
   stock real casi siempre va desfasado del sistema), pero el stock no baja de
   0 y el faltante queda registrado en manual_sale_items.stock_shortfall y se
   informa a quien carga la venta.

   1. manual_sale_items.stock_shortfall: unidades vendidas sin respaldo en stock.
   2. Trigger BEFORE INSERT: bloquea el producto, calcula el faltante y descuenta
      (dos ventas simultáneas del último stock se serializan por el bloqueo).
   3. crear_venta_manual(): crea venta + ítems en una sola transacción, valida
      cantidades y precios y calcula el total en el servidor.

   Security invoker: RLS sigue aplicando (solo owner / super_admin escriben).
   Idempotente.
============================================================================= */

alter table public.manual_sale_items
  add column if not exists stock_shortfall integer not null default 0;

alter table public.manual_sale_items
  drop constraint if exists ck_manual_sale_items_shortfall;
alter table public.manual_sale_items
  add constraint ck_manual_sale_items_shortfall check (stock_shortfall >= 0 and stock_shortfall <= quantity);


-- 2) Descuento de stock con registro del faltante
create or replace function public.deduct_stock_on_manual_sale()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
begin
  if new.product_id is not null then
    select stock_units into v_stock
    from public.products
    where id = new.product_id
    for update;

    if found then
      new.stock_shortfall := greatest(0, new.quantity - v_stock);
      update public.products
      set stock_units = greatest(0, v_stock - new.quantity)
      where id = new.product_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_deduct_stock_manual on public.manual_sale_items;
create trigger tr_deduct_stock_manual
  before insert on public.manual_sale_items
  for each row execute function public.deduct_stock_on_manual_sale();


-- 3) Venta atómica
--    p_items: [{ "product_id": uuid|null, "product_name": text, "quantity": int, "unit_price_cents": int }]
create or replace function public.crear_venta_manual(
  p_client_id uuid,
  p_notes     text,
  p_sold_at   timestamptz,
  p_items     jsonb
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item      jsonb;
  v_qty       integer;
  v_price     bigint;
  v_name      text;
  v_total     bigint := 0;
  v_sale_id   uuid;
  v_shortages jsonb;
begin
  if p_client_id is null then
    raise exception 'Seleccioná un cliente' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un producto' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Demasiados ítems en una venta' using errcode = '22023';
  end if;

  -- Validación y total calculados acá, no en el navegador
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_name  := nullif(btrim(v_item->>'product_name'), '');
    v_qty   := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price_cents')::bigint;

    if v_name is null or v_qty is null or v_qty <= 0 or v_qty > 100000
       or v_price is null or v_price < 0 or v_price > 100000000000 then
      raise exception 'Ítem de venta inválido' using errcode = '22023';
    end if;
    v_total := v_total + v_qty * v_price;
  end loop;

  insert into public.manual_sales (client_id, sold_by, notes, total_cents, sold_at)
  values (p_client_id, auth.uid(), nullif(btrim(p_notes), ''), v_total, coalesce(p_sold_at, now()))
  returning id into v_sale_id;

  insert into public.manual_sale_items (manual_sale_id, product_id, product_name, quantity, unit_price_cents)
  select v_sale_id,
         nullif(e->>'product_id', '')::uuid,
         btrim(e->>'product_name'),
         (e->>'quantity')::integer,
         (e->>'unit_price_cents')::bigint
  from jsonb_array_elements(p_items) e;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_name', product_name,
           'quantity',     quantity,
           'missing',      stock_shortfall
         )), '[]'::jsonb)
  into v_shortages
  from public.manual_sale_items
  where manual_sale_id = v_sale_id and stock_shortfall > 0;

  return jsonb_build_object('sale_id', v_sale_id, 'total_cents', v_total, 'shortages', v_shortages);
end;
$$;

revoke execute on function public.crear_venta_manual(uuid, text, timestamptz, jsonb) from public, anon;
grant  execute on function public.crear_venta_manual(uuid, text, timestamptz, jsonb) to authenticated;
