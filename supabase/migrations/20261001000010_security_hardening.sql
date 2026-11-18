/* =============================================================================
   CLORO Y PILETAS PANCHO — Endurecimiento de seguridad
   Migración: 20261001000010

   Cierra los agujeros detectados en la auditoría del 2026-09-30:
   1. profiles: un usuario podía editar su propio role / puntos / nivel / status
   2. Trigger de puntos sin security definer (marketing no actualizaba saldos)
   3. search_path fijo en funciones security definer
   4. orders / order_items: el cliente ya no inserta directo (checkout por servidor)
   5. products: marketing solo puede tocar campos de visualización
   6. service_logs: el empleado solo registra sobre items/piletas asignados
   7. itinerary_items: empleados solo cambian estado; UNIQUE(día, pileta)
   8. manual_sale_items: el cliente ya no puede escribir sobre sus ítems
   9. client_levels: marketing administra niveles (coherente con el negocio)
   10. adjust_stock(): ajuste atómico de stock

   Idempotente: se puede correr más de una vez.
   NOTA: no toca datos salvo la deduplicación de itinerary_items (punto 7).
============================================================================= */


-- ============================================================================
-- 1) profiles — guardián de columnas sensibles
--    - auth.uid() null  → service role / SQL editor / migraciones: permitido
--    - pg_trigger_depth() > 1 → cambio hecho por otro trigger (ej. puntos): permitido
--    - role: solo super_admin
--    - points_balance / client_level_id / status: solo owner o superior
-- ============================================================================

create or replace function public.guard_profile_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.get_my_role() <> 'super_admin' then
      new.role            := 'client';
      new.points_balance  := 0;
      new.client_level_id := null;
      new.status          := 'active';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     and public.get_my_role() <> 'super_admin' then
    raise exception 'Solo un super_admin puede cambiar roles' using errcode = '42501';
  end if;

  if (new.points_balance  is distinct from old.points_balance
      or new.client_level_id is distinct from old.client_level_id
      or new.status          is distinct from old.status)
     and not public.is_owner_or_above() then
    raise exception 'No tenés permisos para modificar puntos, nivel o estado' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_guard_profile_write on public.profiles;
create trigger tr_guard_profile_write
  before insert or update on public.profiles
  for each row execute function public.guard_profile_write();


-- ============================================================================
-- 2) Puntos: el recálculo corre con permisos de sistema
--    (marketing inserta la transacción; el saldo lo actualiza el trigger)
-- ============================================================================

create or replace function public.update_client_points_and_level()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance  integer;
  v_level_id uuid;
begin
  select coalesce(sum(points), 0)
  into v_balance
  from public.point_transactions
  where client_id = new.client_id;

  select id
  into v_level_id
  from public.client_levels
  where min_points <= v_balance
  order by min_points desc
  limit 1;

  update public.profiles
  set points_balance = v_balance, client_level_id = v_level_id
  where id = new.client_id;

  return new;
end;
$$;


-- ============================================================================
-- 3) search_path fijo + permisos de ejecución en funciones security definer
-- ============================================================================

alter function public.sync_role_to_app_metadata() set search_path = public, auth, pg_temp;
alter function public.handle_new_user()           set search_path = public, pg_temp;
alter function public.get_my_role()               set search_path = public, pg_temp;
alter function public.is_admin()                  set search_path = public, pg_temp;
alter function public.is_owner_or_above()         set search_path = public, pg_temp;

revoke execute on function public.sync_role_to_app_metadata()     from public, anon, authenticated;
revoke execute on function public.handle_new_user()               from public, anon, authenticated;
revoke execute on function public.update_client_points_and_level() from public, anon, authenticated;


-- ============================================================================
-- 4) orders / order_items — el cliente no inserta directo.
--    El checkout se hace desde el servidor (service role), que calcula
--    precios y totales. Las políticas de lectura se mantienen.
-- ============================================================================

drop policy if exists "orders: client insert own"       on public.orders;
drop policy if exists "order_items: client insert with order" on public.order_items;


-- ============================================================================
-- 5) products — marketing solo toca campos de visualización
-- ============================================================================

create or replace function public.guard_product_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if public.get_my_role() = 'marketing' and (
       new.name          is distinct from old.name
    or new.description   is distinct from old.description
    or new.chlorine_type is distinct from old.chlorine_type
    or new.price_cents   is distinct from old.price_cents
    or new.stock_units   is distinct from old.stock_units
    or new.unit          is distinct from old.unit
    or new.weight_kg     is distinct from old.weight_kg
    or new.is_active     is distinct from old.is_active
  ) then
    raise exception 'Marketing solo puede modificar orden, etiqueta promo, destacado e imagen'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_guard_product_update on public.products;
create trigger tr_guard_product_update
  before update on public.products
  for each row execute function public.guard_product_update();


-- ============================================================================
-- 6) service_logs — el empleado registra solo sobre items que puede ver,
--    y pool / cliente deben coincidir con el item y con la pileta.
-- ============================================================================

drop policy if exists "service_logs: employee own" on public.service_logs;

create policy "service_logs: employee read own"
  on public.service_logs for select
  using (public.get_my_role() = 'employee' and employee_id = auth.uid());

create policy "service_logs: employee insert assigned"
  on public.service_logs for insert
  with check (
    public.get_my_role() = 'employee'
    and employee_id = auth.uid()
    and itinerary_item_id is not null
    and exists (
      select 1
      from public.itinerary_items ii
      where ii.id = itinerary_item_id
        and ii.pool_id = service_logs.pool_id
        and (ii.assigned_employee_id is null or ii.assigned_employee_id = auth.uid())
    )
    and exists (
      select 1
      from public.pools p
      where p.id = service_logs.pool_id
        and p.client_id = service_logs.client_id
    )
  );


-- ============================================================================
-- 7) itinerary_items — empleados solo cambian estado; sin duplicados
-- ============================================================================

create or replace function public.guard_itinerary_item_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.get_my_role() = 'employee' and (
       new.itinerary_day_id     is distinct from old.itinerary_day_id
    or new.pool_id              is distinct from old.pool_id
    or new.sort_order           is distinct from old.sort_order
    or new.assigned_employee_id is distinct from old.assigned_employee_id
    or (new.completed_by is not null and new.completed_by <> auth.uid())
  ) then
    raise exception 'Los empleados solo pueden marcar el estado del item'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_guard_itinerary_item_update on public.itinerary_items;
create trigger tr_guard_itinerary_item_update
  before update on public.itinerary_items
  for each row execute function public.guard_itinerary_item_update();

-- 7b) Deduplicar (conserva el item ya resuelto, o el más antiguo) y reapuntar service_logs
with ranked as (
  select id,
         first_value(id) over w as keep_id,
         row_number()    over w as rn
  from public.itinerary_items
  window w as (
    partition by itinerary_day_id, pool_id
    order by (status = 'pending'), created_at, id
  )
)
update public.service_logs sl
set itinerary_item_id = r.keep_id
from ranked r
where sl.itinerary_item_id = r.id and r.rn > 1;

with ranked as (
  select id,
         row_number() over (
           partition by itinerary_day_id, pool_id
           order by (status = 'pending'), created_at, id
         ) as rn
  from public.itinerary_items
)
delete from public.itinerary_items i
using ranked r
where i.id = r.id and r.rn > 1;

create unique index if not exists ux_itinerary_items_day_pool
  on public.itinerary_items (itinerary_day_id, pool_id);


-- ============================================================================
-- 8) manual_sale_items — el cliente solo lee; escribe el owner
-- ============================================================================

drop policy if exists "manual_sale_items: follow sale" on public.manual_sale_items;

create policy "manual_sale_items: read own or owner"
  on public.manual_sale_items for select
  using (
    exists (
      select 1 from public.manual_sales ms
      where ms.id = manual_sale_id
        and (ms.client_id = auth.uid() or public.is_owner_or_above())
    )
  );

create policy "manual_sale_items: owner writes"
  on public.manual_sale_items for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());


-- ============================================================================
-- 9) client_levels — marketing también administra niveles
-- ============================================================================

drop policy if exists "client_levels: owner manages" on public.client_levels;

create policy "client_levels: staff manages"
  on public.client_levels for all
  using (public.get_my_role() in ('super_admin', 'owner', 'marketing'))
  with check (public.get_my_role() in ('super_admin', 'owner', 'marketing'));


-- ============================================================================
-- 10) adjust_stock — ajuste atómico (evita read-modify-write)
--     security invoker: aplica RLS y el guardián de productos.
-- ============================================================================

create or replace function public.adjust_stock(p_product_id uuid, p_delta integer)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
begin
  update public.products
  set stock_units = greatest(0, stock_units + p_delta)
  where id = p_product_id
  returning stock_units into v_stock;

  if not found then
    raise exception 'Producto no encontrado o sin permisos' using errcode = 'P0002';
  end if;

  return v_stock;
end;
$$;

revoke execute on function public.adjust_stock(uuid, integer) from public, anon;
grant  execute on function public.adjust_stock(uuid, integer) to authenticated;
