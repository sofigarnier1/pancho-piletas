/* =============================================================================
   CLORO Y PILETAS PANCHO — Endurecimiento tras la ronda de equipo rojo (2026-10-19)
   Migración: 20261019000017

   Hallazgos que cierra (todos reproducidos contra una copia aislada):
   M1  Un empleado cerraba visitas de cualquier día (y las dejaba "hechas" sin registro,
       con hora de cierre inventada). El cloro aceptaba cantidades negativas.
   M2  Marketing escribía el itinerario y el historial de service (reabrir, falsificar, borrar).
   B1  Un pedido que volvía a "pagado" descontaba el stock otra vez; cancelar no lo reponía.
   B2  Marketing podía darse puntos sin tope y sin dejar rastro de quién los dio.
   B3  Ventas manuales a cuentas que no son clientes, con fecha del año 9999, importes
       desmedidos y totales que se podían reescribir después.

   Idempotente. No borra ni reescribe datos de negocio (las restricciones nuevas se crean
   NOT VALID: rigen para lo que se escriba de ahora en más).
============================================================================= */

-- ============================================================================
-- 0) Hoy en Argentina (la fecha de negocio no es la UTC del servidor)
-- ============================================================================

create or replace function public.today_ar()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;


-- ============================================================================
-- 1) M2 — Itinerario y service logs: solo el dueño escribe.
--    Marketing conserva la LECTURA del itinerario (el tablero cuenta las visitas de hoy),
--    pero no ve ni toca los registros de service.
-- ============================================================================

drop policy if exists "itinerary_days: admin full" on public.itinerary_days;
create policy "itinerary_days: admin read"
  on public.itinerary_days for select
  using (public.is_admin());
create policy "itinerary_days: owner write"
  on public.itinerary_days for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "itinerary_items: admin full" on public.itinerary_items;
create policy "itinerary_items: admin read"
  on public.itinerary_items for select
  using (public.is_admin());
create policy "itinerary_items: owner write"
  on public.itinerary_items for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "service_logs: admin full" on public.service_logs;
create policy "service_logs: owner full"
  on public.service_logs for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());


-- ============================================================================
-- 2) M1 — El empleado solo registra visitas de hoy o de ayer
-- ============================================================================

-- 2a) Registro de service: ventana de fechas y fecha fijada por la base
create or replace function public.guard_service_log_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_date   date;
begin
  if new.itinerary_item_id is null then
    return new;
  end if;

  -- FOR UPDATE: el segundo insert concurrente espera acá hasta que el primero termine
  select i.status, d.date
  into v_status, v_date
  from public.itinerary_items i
  join public.itinerary_days d on d.id = i.itinerary_day_id
  where i.id = new.itinerary_item_id
  for update of i;

  if found then
    if v_status <> 'pending' then
      raise exception 'La pileta ya fue resuelta' using errcode = 'PA001';
    end if;

    if auth.uid() is not null and public.get_my_role() = 'employee' then
      if v_date < public.today_ar() - 1 or v_date > public.today_ar() then
        raise exception 'Solo se puede registrar el service de hoy o de ayer' using errcode = 'PA002';
      end if;
      new.date := v_date; -- la fecha del registro es la de la visita, no la que mande el cliente
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_service_log_insert() from public, anon, authenticated;

-- 2b) Cambios directos del empleado sobre una visita
create or replace function public.guard_itinerary_item_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_date date;
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.get_my_role() = 'employee' then
    if new.itinerary_day_id     is distinct from old.itinerary_day_id
       or new.pool_id              is distinct from old.pool_id
       or new.sort_order           is distinct from old.sort_order
       or new.assigned_employee_id is distinct from old.assigned_employee_id
    then
      raise exception 'Los empleados solo pueden marcar el estado del item'
        using errcode = '42501';
    end if;

    if old.status <> 'pending' and new.status is distinct from old.status then
      raise exception 'La pileta ya fue resuelta' using errcode = 'PA001';
    end if;

    -- Profundidad 1 = el empleado tocó la visita directamente. (Cuando la visita se cierra por el
    -- trigger del registro de service, la profundidad es 2 y ya se validó en el registro.)
    if pg_trigger_depth() = 1 then
      select d.date into v_date from public.itinerary_days d where d.id = old.itinerary_day_id;
      if v_date is null or v_date < public.today_ar() - 1 or v_date > public.today_ar() then
        raise exception 'Solo se puede marcar el estado de visitas de hoy o de ayer' using errcode = 'PA002';
      end if;

      -- "Hecha" solo se da registrando el service: una visita hecha siempre tiene su registro
      if new.status = 'done' and old.status is distinct from 'done' then
        raise exception 'Una visita se da por hecha al registrar el service' using errcode = '42501';
      end if;

      -- Quién y cuándo cerró lo fija la base, no el cliente
      if new.status is distinct from old.status then
        new.completed_by := auth.uid();
        new.completed_at := now();
      else
        new.completed_by := old.completed_by;
        new.completed_at := old.completed_at;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 2c) Cantidad de cloro razonable (rige para lo nuevo; no revalida el historial)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_service_logs_chlorine_amount') then
    alter table public.service_logs
      add constraint ck_service_logs_chlorine_amount
      check (chlorine_amount_kg is null or (chlorine_amount_kg >= 0 and chlorine_amount_kg <= 500))
      not valid;
  end if;
end $$;


-- ============================================================================
-- 3) B2 — Puntos manuales: tope, solo a clientes, a nombre de quien los da
-- ============================================================================

drop policy if exists "point_transactions: admin insert" on public.point_transactions;
create policy "point_transactions: staff insert manual"
  on public.point_transactions for insert
  with check (
    public.is_admin()
    and source_type = 'manual_grant'
    and points <> 0
    and points between -100000 and 100000
    and exists (
      select 1 from public.profiles p
      where p.id = point_transactions.client_id and p.role = 'client'
    )
  );

create or replace function public.set_point_tx_created_by()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid(); -- quien da los puntos queda registrado; no se puede falsear
  end if;
  return new;
end;
$$;

revoke execute on function public.set_point_tx_created_by() from public, anon, authenticated;

drop trigger if exists tr_point_tx_created_by on public.point_transactions;
create trigger tr_point_tx_created_by
  before insert on public.point_transactions
  for each row execute function public.set_point_tx_created_by();


-- ============================================================================
-- 4) B3 — Ventas manuales coherentes
-- ============================================================================

-- 4a) Topes (rigen para lo nuevo)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_manual_sales_total_cap') then
    alter table public.manual_sales
      add constraint ck_manual_sales_total_cap
      check (total_cents <= 1000000000000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_manual_sale_items_caps') then
    alter table public.manual_sale_items
      add constraint ck_manual_sale_items_caps
      check (quantity <= 100000 and unit_price_cents <= 100000000000) not valid;
  end if;
end $$;

-- 4b) Una venta es de un cliente, con fecha razonable; cliente, vendedor y total no se reescriben
create or replace function public.guard_manual_sale_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Procesos del sistema (service role) y roles sin permiso de escritura: estos últimos los niega RLS
  -- (los triggers BEFORE corren antes que RLS: no se les tapa su error con otro mensaje).
  if auth.uid() is null or not public.is_owner_or_above() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles where id = new.client_id and role = 'client') then
      raise exception 'El destinatario de la venta no es un cliente' using errcode = '22023';
    end if;
  else
    if new.client_id   is distinct from old.client_id
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

drop trigger if exists tr_guard_manual_sale on public.manual_sales;
create trigger tr_guard_manual_sale
  before insert or update on public.manual_sales
  for each row execute function public.guard_manual_sale_write();

-- 4c) El total siempre es la suma de los ítems. Se comprueba al cerrar la transacción, así la
--     función que crea la venta (venta primero, ítems después) pasa, pero agregar, quitar o
--     cambiar ítems de una venta ya creada no.
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

  select coalesce(sum(quantity::numeric * unit_price_cents), 0) into v_sum
  from public.manual_sale_items where manual_sale_id = v_sale;

  if v_sum <> v_total then
    raise exception 'El total de la venta no coincide con la suma de sus ítems' using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function public.check_manual_sale_total() from public, anon, authenticated;

drop trigger if exists tr_manual_sale_total on public.manual_sale_items;
create constraint trigger tr_manual_sale_total
  after insert or update or delete on public.manual_sale_items
  deferrable initially deferred
  for each row execute function public.check_manual_sale_total();

-- 4d) La función que crea la venta valida igual (mensajes claros) y suma topes
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
  if not exists (select 1 from public.profiles where id = p_client_id and role = 'client') then
    raise exception 'El destinatario de la venta no es un cliente' using errcode = '22023';
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

  if v_total > 1000000000000 then
    raise exception 'El total de la venta es demasiado alto' using errcode = '22023';
  end if;

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


-- ============================================================================
-- 5) B1 — Pedidos: el stock se descuenta una vez y se repone al cancelar; los estados no
--    retroceden. (El webhook de pagos puede repetirse sin descontar dos veces.)
-- ============================================================================

alter table public.orders      add column if not exists stock_deducted_at timestamptz;
alter table public.order_items add column if not exists stock_deducted    integer not null default 0;

-- Pedidos que ya estaban pagados: su stock ya se descontó con la regla anterior
update public.orders
set stock_deducted_at = coalesce(paid_at, updated_at)
where status in ('paid', 'preparing', 'shipped', 'delivered') and stock_deducted_at is null;

update public.order_items oi
set stock_deducted = oi.quantity
from public.orders o
where o.id = oi.order_id and o.stock_deducted_at is not null and oi.stock_deducted = 0;

create or replace function public.deduct_stock_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old   int;
  v_new   int;
  v_stock integer;
  v_take  integer;
  r       record;
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
      for r in select id, product_id, stock_deducted from public.order_items
               where order_id = new.id and stock_deducted > 0 loop
        update public.products set stock_units = stock_units + r.stock_deducted where id = r.product_id;
        update public.order_items set stock_deducted = 0 where id = r.id;
      end loop;
      new.stock_deducted_at := null;
    end if;
    return new;
  end if;

  -- Primera vez que el pedido llega a "pagado" o más allá: se descuenta una sola vez
  if new.stock_deducted_at is null and v_new >= 1 then
    for r in select id, product_id, quantity from public.order_items where order_id = new.id loop
      select stock_units into v_stock from public.products where id = r.product_id for update;
      v_take := least(coalesce(v_stock, 0), r.quantity);
      update public.products set stock_units = stock_units - v_take where id = r.product_id;
      update public.order_items set stock_deducted = v_take where id = r.id;
    end loop;
    new.stock_deducted_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function public.deduct_stock_on_payment() from public, anon, authenticated;

drop trigger if exists tr_deduct_stock on public.orders;
create trigger tr_deduct_stock
  before update of status on public.orders
  for each row execute function public.deduct_stock_on_payment();
