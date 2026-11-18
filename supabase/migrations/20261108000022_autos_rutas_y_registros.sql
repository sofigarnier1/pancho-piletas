/* =============================================================================
   CLORO Y PILETAS PANCHO — Autos, rutas, service o desagote, cloro por unidad,
   clientes sin cuenta e historial de registros
   Migración: 20261108000022

   Spec acordada el 2026-11-04 (roles dueño y empleado):
   1. Clientes sin cuenta web: un perfil ya no necesita un usuario de Supabase Auth.
      Solo el nombre es obligatorio. Al habilitarle el acceso se crea el usuario con
      el mismo id (handle_new_user marca has_account). N° de cliente y notas en
      client_profiles; la dirección de la pileta pasa a ser opcional.
   2. Autos (vehicles) y equipos por día (itinerary_day_crews: día × auto × persona).
      Cada visita del itinerario va en un auto (vehicle_id) y es 'service' o 'desagote'.
      El empleado ve las visitas del auto en el que trabaja ese día. Las visitas sin
      auto siguen la regla anterior (assigned_employee_id null = todos).
   3. Registros de service: varios por visita (se elimina el único por visita y el
      error PA001), se pueden editar y borrar, y todo cambio queda en
      service_log_history (quién, qué, cuándo, antes/después; lo ve el dueño).
   4. Fechas: el empleado registra hasta 7 días atrás; dueño y super_admin cualquier
      fecha pasada; nunca a futuro (reemplaza "hoy o ayer" de la migración 17).
   5. Cloro por unidad según el tipo: líquido en litros, granulado en gramos,
      pastillas por cantidad con medias (chlorine_amount + chlorine_unit).

   Transición: cleaning_done, vacuum_done, painting_done y chlorine_amount_kg quedan
   OBSOLETAS pero no se borran todavía (la pantalla actual del empleado las usa).
   Lo que llegue en chlorine_amount_kg se convierte solo a la unidad nueva. Se
   eliminarán en una migración posterior, cuando la UI use las columnas nuevas.

   Idempotente. No borra datos de negocio.
============================================================================= */

-- ============================================================================
-- 1) Clientes sin cuenta
-- ============================================================================

-- 1a) profiles.id deja de depender de auth.users
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'f'
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', c);
  end loop;
end $$;

alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists has_account boolean not null default false;

update public.profiles p
set has_account = exists (select 1 from auth.users u where u.id = p.id)
where has_account is distinct from exists (select 1 from auth.users u where u.id = p.id);

-- Solo el nombre es obligatorio (rige para lo nuevo)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_profiles_full_name') then
    alter table public.profiles
      add constraint ck_profiles_full_name check (btrim(full_name) <> '') not valid;
  end if;
end $$;

-- 1b) has_account lo fija la base: true solo si existe el usuario de Auth
create or replace function public.set_profile_has_account()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  new.has_account := exists (select 1 from auth.users u where u.id = new.id);
  return new;
end;
$$;

revoke execute on function public.set_profile_has_account() from public, anon, authenticated;

drop trigger if exists tr_set_profile_has_account on public.profiles;
create trigger tr_set_profile_has_account
  before insert on public.profiles
  for each row execute function public.set_profile_has_account();

-- 1c) Alta de usuario: si el perfil ya existía (cliente cargado por el dueño), se le
--     habilita la cuenta conservando sus datos y su rol.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'nombre'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Usuario'
    ),
    'client'
  )
  on conflict (id) do update set has_account = true;

  -- Si el perfil ya existía, su rol se copia a la cuenta nueva
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', (select role::text from public.profiles where id = new.id))
  where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 1d) Borrar el usuario de Auth sigue borrando su perfil (antes lo hacía la FK en cascada)
create or replace function public.delete_profile_on_auth_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

revoke execute on function public.delete_profile_on_auth_delete() from public, anon, authenticated;

drop trigger if exists tr_on_auth_user_deleted on auth.users;
create trigger tr_on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.delete_profile_on_auth_delete();

-- 1e) Guardián de profiles: has_account no se escribe desde la API
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
    return new; -- has_account lo fija tr_set_profile_has_account
  end if;

  if new.has_account is distinct from old.has_account then
    raise exception 'La cuenta web de un perfil no se puede cambiar a mano' using errcode = '42501';
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

-- 1f) Datos del cliente: N° de cliente y notas; la dirección de la pileta es opcional
alter table public.client_profiles add column if not exists client_number integer;
alter table public.client_profiles add column if not exists notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_client_profiles_number') then
    alter table public.client_profiles
      add constraint ck_client_profiles_number check (client_number is null or client_number > 0);
  end if;
end $$;

create unique index if not exists ux_client_profiles_number
  on public.client_profiles (client_number)
  where client_number is not null;

alter table public.pools alter column address drop not null;


-- ============================================================================
-- 2) Autos y equipos por día
-- ============================================================================

create table if not exists public.vehicles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  plate       text,
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ck_vehicles_name check (btrim(name) <> '')
);

create unique index if not exists ux_vehicles_name on public.vehicles (lower(btrim(name)));

drop trigger if exists tr_vehicles_updated_at on public.vehicles;
create trigger tr_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- Quién va en cada auto cada día. Una persona va en un solo auto por día.
create table if not exists public.itinerary_day_crews (
  id                uuid        primary key default gen_random_uuid(),
  itinerary_day_id  uuid        not null references public.itinerary_days(id) on delete cascade,
  vehicle_id        uuid        not null references public.vehicles(id),
  employee_id       uuid        not null references public.profiles(id) on delete cascade,
  created_by        uuid        references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint ux_itinerary_day_crews_person unique (itinerary_day_id, employee_id)
);

create index if not exists ix_itinerary_day_crews_vehicle  on public.itinerary_day_crews (itinerary_day_id, vehicle_id);
create index if not exists ix_itinerary_day_crews_employee on public.itinerary_day_crews (employee_id);

-- En un auto va gente del equipo (empleado, dueño o super_admin); created_by lo fija la base
create or replace function public.guard_day_crew_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Roles sin permiso de escritura: los niega RLS (no se tapa su error con otro mensaje)
  if auth.uid() is not null and not public.is_owner_or_above() then
    return new;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = new.employee_id and role in ('employee', 'owner', 'super_admin')
  ) then
    raise exception 'En un auto solo puede ir alguien del equipo' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_day_crew_write() from public, anon, authenticated;

drop trigger if exists tr_guard_day_crew_write on public.itinerary_day_crews;
create trigger tr_guard_day_crew_write
  before insert or update on public.itinerary_day_crews
  for each row execute function public.guard_day_crew_write();

-- Cada visita: en qué auto va y si es service o desagote (se elige al planificar)
alter table public.itinerary_items add column if not exists vehicle_id uuid references public.vehicles(id);
alter table public.itinerary_items add column if not exists service_type text not null default 'service';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_itinerary_items_service_type') then
    alter table public.itinerary_items
      add constraint ck_itinerary_items_service_type check (service_type in ('service', 'desagote'));
  end if;
end $$;

create index if not exists ix_itinerary_items_vehicle on public.itinerary_items (itinerary_day_id, vehicle_id);


-- ============================================================================
-- 3) Qué visitas ve el empleado: las del auto en el que trabaja ese día.
--    Visitas sin auto: regla anterior (sin asignar = todos, o la persona asignada).
-- ============================================================================

create or replace function public.employee_can_see_item(p_day_id uuid, p_vehicle_id uuid, p_assigned uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_vehicle_id is null then (p_assigned is null or p_assigned = auth.uid())
    else exists (
      select 1 from public.itinerary_day_crews c
      where c.itinerary_day_id = p_day_id
        and c.vehicle_id = p_vehicle_id
        and c.employee_id = auth.uid()
    )
  end;
$$;

revoke execute on function public.employee_can_see_item(uuid, uuid, uuid) from public, anon;
grant  execute on function public.employee_can_see_item(uuid, uuid, uuid) to authenticated;

create or replace function public.employee_can_see_pool(p_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.itinerary_items ii
    where ii.pool_id = p_pool_id
      and public.employee_can_see_item(ii.itinerary_day_id, ii.vehicle_id, ii.assigned_employee_id)
  );
$$;

drop policy if exists "itinerary_items: employee read assigned" on public.itinerary_items;
create policy "itinerary_items: employee read assigned"
  on public.itinerary_items for select
  using (
    public.get_my_role() = 'employee'
    and public.employee_can_see_item(itinerary_day_id, vehicle_id, assigned_employee_id)
  );

drop policy if exists "itinerary_items: employee update assigned" on public.itinerary_items;
create policy "itinerary_items: employee update assigned"
  on public.itinerary_items for update
  using (
    public.get_my_role() = 'employee'
    and public.employee_can_see_item(itinerary_day_id, vehicle_id, assigned_employee_id)
  );


-- ============================================================================
-- 4) RLS de autos y equipos
-- ============================================================================

alter table public.vehicles            enable row level security;
alter table public.itinerary_day_crews enable row level security;

drop policy if exists "vehicles: staff read" on public.vehicles;
create policy "vehicles: staff read"
  on public.vehicles for select
  using (public.is_admin() or public.get_my_role() = 'employee');

drop policy if exists "vehicles: owner write" on public.vehicles;
create policy "vehicles: owner write"
  on public.vehicles for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "itinerary_day_crews: staff read" on public.itinerary_day_crews;
create policy "itinerary_day_crews: staff read"
  on public.itinerary_day_crews for select
  using (public.is_admin() or public.get_my_role() = 'employee');

drop policy if exists "itinerary_day_crews: owner write" on public.itinerary_day_crews;
create policy "itinerary_day_crews: owner write"
  on public.itinerary_day_crews for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());


-- ============================================================================
-- 5) Registros de service: cloro por unidad, varios por visita, editar y borrar
-- ============================================================================

-- 5a) Cloro: la unidad sale del tipo (líquido → litros, granulado → gramos, pastillas → unidades)
alter table public.service_logs add column if not exists chlorine_amount numeric(10,2);
alter table public.service_logs add column if not exists chlorine_unit text
  generated always as (
    case chlorine_type
      when 'liquido'   then 'l'
      when 'granulado' then 'g'
      when 'pastilla'  then 'u'
    end
  ) stored;
alter table public.service_logs add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_service_logs_chlorine_by_unit') then
    alter table public.service_logs
      add constraint ck_service_logs_chlorine_by_unit check (
        chlorine_amount is null
        or (
          chlorine_amount > 0
          and case chlorine_type
                when 'liquido'   then chlorine_amount <= 500
                when 'granulado' then chlorine_amount <= 50000 and chlorine_amount = trunc(chlorine_amount)
                when 'pastilla'  then chlorine_amount <= 100 and chlorine_amount * 2 = trunc(chlorine_amount * 2)
                else false -- una cantidad sin tipo de cloro no se acepta
              end
        )
      );
  end if;
end $$;

comment on column public.service_logs.chlorine_amount    is 'Cantidad de cloro en la unidad de chlorine_unit: l (líquido), g (granulado), u (pastillas, paso 0,5).';
comment on column public.service_logs.chlorine_unit      is 'Unidad de chlorine_amount, derivada de chlorine_type.';
comment on column public.service_logs.chlorine_amount_kg is 'OBSOLETA (migración 22): usar chlorine_amount. Se convierte sola y se eliminará.';
comment on column public.service_logs.cleaning_done      is 'OBSOLETA (migración 22): el tipo de visita sale de itinerary_items.service_type.';
comment on column public.service_logs.vacuum_done        is 'OBSOLETA (migración 22): el tipo de visita sale de itinerary_items.service_type.';
comment on column public.service_logs.painting_done      is 'OBSOLETA (migración 22): ya no se registra pintado.';

-- Conversión de lo existente: granulado kg → g (× 1000) y líquido kg ≈ litros (1:1).
-- Pastillas: los kg no dicen cuántas pastillas eran; chlorine_amount queda vacío y el dato
-- original se conserva en chlorine_amount_kg.
update public.service_logs
set chlorine_amount = case chlorine_type
                        when 'granulado' then round(chlorine_amount_kg * 1000)
                        when 'liquido'   then round(chlorine_amount_kg, 2)
                      end
where chlorine_amount is null
  and chlorine_amount_kg > 0
  and chlorine_type in ('granulado', 'liquido')
  and (chlorine_type <> 'granulado' or chlorine_amount_kg <= 50)
  and (chlorine_type <> 'liquido'   or chlorine_amount_kg <= 500);

-- 5b) Varios registros por visita: fuera el índice único (migración 14)
drop index if exists public.ux_service_logs_item;
create index if not exists ix_service_logs_item on public.service_logs (itinerary_item_id);

-- 5c) Guardián de alta y edición (reemplaza guard_service_log_insert de las migraciones 14 y 17)
drop trigger if exists tr_guard_service_log_insert on public.service_logs;
drop function if exists public.guard_service_log_insert();

create or replace function public.guard_service_log_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_date date;
begin
  -- Compatibilidad con la pantalla actual: lo que llega en kg se pasa a la unidad nueva
  if new.chlorine_amount is null and new.chlorine_amount_kg is not null
     and (tg_op = 'INSERT' or new.chlorine_amount_kg is distinct from old.chlorine_amount_kg) then
    new.chlorine_amount := case new.chlorine_type
                             when 'granulado' then round(new.chlorine_amount_kg * 1000)
                             when 'liquido'   then round(new.chlorine_amount_kg, 2)
                           end;
  end if;

  -- Procesos del sistema (service role, migraciones, seed): sin reglas de fecha
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.get_my_role();

  -- Roles sin permiso de escritura: los niega RLS (los triggers BEFORE corren antes que RLS,
  -- así no se tapa su error con otro mensaje)
  if v_role not in ('employee', 'owner', 'super_admin') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.itinerary_item_id is distinct from old.itinerary_item_id
       or new.pool_id        is distinct from old.pool_id
       or new.client_id      is distinct from old.client_id
    then
      raise exception 'La visita, la pileta y el cliente de un registro no se pueden cambiar' using errcode = '42501';
    end if;

    if v_role = 'employee'
       and (new.employee_id is distinct from old.employee_id or new.date is distinct from old.date) then
      raise exception 'El empleado no puede cambiar quién hizo la visita ni su fecha' using errcode = '42501';
    end if;
  end if;

  -- Quien figura como autor es alguien del equipo
  if (tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id)
     and not exists (
       select 1 from public.profiles
       where id = new.employee_id and role in ('employee', 'owner', 'super_admin')
     ) then
    raise exception 'El registro tiene que ser de alguien del equipo' using errcode = '22023';
  end if;

  -- Fecha: la de la visita si hay visita; nunca futura; el empleado, hasta 7 días atrás
  if new.itinerary_item_id is not null then
    select d.date into v_date
    from public.itinerary_items i
    join public.itinerary_days d on d.id = i.itinerary_day_id
    where i.id = new.itinerary_item_id;
    if v_date is not null then
      new.date := v_date;
    end if;
  end if;

  if tg_op = 'INSERT' or new.date is distinct from old.date then
    if new.date > public.today_ar() then
      raise exception 'No se pueden registrar visitas de días que todavía no llegaron' using errcode = 'PA002';
    end if;
    if v_role = 'employee' and new.date < public.today_ar() - 7 then
      raise exception 'Solo se pueden registrar visitas de los últimos 7 días' using errcode = 'PA002';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_service_logs_updated_at on public.service_logs;
create trigger tr_service_logs_updated_at
  before update on public.service_logs
  for each row execute function public.set_updated_at();

revoke execute on function public.guard_service_log_write() from public, anon, authenticated;

drop trigger if exists tr_guard_service_log_write on public.service_logs;
create trigger tr_guard_service_log_write
  before insert or update on public.service_logs
  for each row execute function public.guard_service_log_write();

-- 5d) Un registro da la visita por hecha (aunque estuviera salteada); borrar el último la reabre
create or replace function public.close_itinerary_item_on_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.itinerary_item_id is not null then
    update public.itinerary_items
    set status       = 'done',
        completed_by = new.employee_id,
        completed_at = now()
    where id = new.itinerary_item_id
      and status <> 'done'; -- si ya estaba hecha, conserva quién la cerró primero
  end if;
  return new;
end;
$$;

revoke execute on function public.close_itinerary_item_on_log() from public, anon, authenticated;

create or replace function public.reopen_itinerary_item_on_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.itinerary_item_id is not null
     and not exists (select 1 from public.service_logs where itinerary_item_id = old.itinerary_item_id) then
    update public.itinerary_items
    set status = 'pending', completed_by = null, completed_at = null
    where id = old.itinerary_item_id and status = 'done';
  end if;
  return old;
end;
$$;

revoke execute on function public.reopen_itinerary_item_on_log_delete() from public, anon, authenticated;

drop trigger if exists tr_reopen_item_on_log_delete on public.service_logs;
create trigger tr_reopen_item_on_log_delete
  after delete on public.service_logs
  for each row execute function public.reopen_itinerary_item_on_log_delete();

-- 5e) Cambios directos del empleado sobre una visita (reemplaza la versión de la migración 17)
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
       or new.vehicle_id           is distinct from old.vehicle_id
       or new.service_type         is distinct from old.service_type
    then
      raise exception 'Los empleados solo pueden marcar el estado del item'
        using errcode = '42501';
    end if;

    -- Profundidad 1 = el empleado tocó la visita directamente. (Si la cambia el trigger de un
    -- registro de service, la profundidad es mayor y el registro ya se validó.)
    if pg_trigger_depth() = 1 then
      select d.date into v_date from public.itinerary_days d where d.id = old.itinerary_day_id;
      if v_date is null or v_date < public.today_ar() - 7 or v_date > public.today_ar() then
        raise exception 'Solo se puede marcar el estado de visitas de los últimos 7 días' using errcode = 'PA002';
      end if;

      -- "Hecha" solo se da registrando el service: una visita hecha siempre tiene su registro
      if new.status = 'done' and old.status is distinct from 'done' then
        raise exception 'Una visita se da por hecha al registrar el service' using errcode = '42501';
      end if;
      if old.status = 'done' and new.status is distinct from 'done' then
        raise exception 'Una visita hecha se corrige editando o borrando sus registros' using errcode = '42501';
      end if;

      -- Quién y cuándo cerró lo fija la base, no el cliente
      if new.status is distinct from old.status then
        new.completed_by := case when new.status = 'pending' then null else auth.uid() end;
        new.completed_at := case when new.status = 'pending' then null else now() end;
      else
        new.completed_by := old.completed_by;
        new.completed_at := old.completed_at;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 5f) Políticas: el empleado ve sus registros y los de las visitas de su auto;
--     edita y borra los suyos de los últimos 7 días. El dueño, todo (política de la 17).
drop policy if exists "service_logs: employee read own" on public.service_logs;
create policy "service_logs: employee read own"
  on public.service_logs for select
  using (
    public.get_my_role() = 'employee'
    and (
      employee_id = auth.uid()
      or exists (
        select 1 from public.itinerary_items ii
        where ii.id = service_logs.itinerary_item_id
          and public.employee_can_see_item(ii.itinerary_day_id, ii.vehicle_id, ii.assigned_employee_id)
      )
    )
  );

drop policy if exists "service_logs: employee insert assigned" on public.service_logs;
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
        and public.employee_can_see_item(ii.itinerary_day_id, ii.vehicle_id, ii.assigned_employee_id)
    )
    and exists (
      select 1
      from public.pools p
      where p.id = service_logs.pool_id
        and p.client_id = service_logs.client_id
    )
  );

drop policy if exists "service_logs: employee update own recent" on public.service_logs;
create policy "service_logs: employee update own recent"
  on public.service_logs for update
  using (public.get_my_role() = 'employee' and employee_id = auth.uid() and date >= public.today_ar() - 7)
  with check (public.get_my_role() = 'employee' and employee_id = auth.uid() and date >= public.today_ar() - 7);

drop policy if exists "service_logs: employee delete own recent" on public.service_logs;
create policy "service_logs: employee delete own recent"
  on public.service_logs for delete
  using (public.get_my_role() = 'employee' and employee_id = auth.uid() and date >= public.today_ar() - 7);


-- ============================================================================
-- 6) Historial de registros de service (lo escribe solo el trigger; lo lee el dueño)
-- ============================================================================

create table if not exists public.service_log_history (
  id              uuid        primary key default gen_random_uuid(),
  service_log_id  uuid        not null, -- sin FK: el historial sobrevive al borrado del registro
  action          text        not null,
  changed_by      uuid        references public.profiles(id) on delete set null,
  changed_at      timestamptz not null default now(),
  old_data        jsonb,
  new_data        jsonb,
  constraint ck_service_log_history_action check (action in ('insert', 'update', 'delete'))
);

create index if not exists ix_service_log_history_log  on public.service_log_history (service_log_id, changed_at);
create index if not exists ix_service_log_history_when on public.service_log_history (changed_at desc);
create index if not exists ix_service_log_history_by   on public.service_log_history (changed_by);

create or replace function public.record_service_log_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_by uuid := auth.uid();
begin
  -- Quien cambia tiene que tener perfil; si no (service role), queda sin autor
  if v_by is not null and not exists (select 1 from public.profiles where id = v_by) then
    v_by := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.service_log_history (service_log_id, action, changed_by, new_data)
    values (new.id, 'insert', v_by, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      insert into public.service_log_history (service_log_id, action, changed_by, old_data, new_data)
      values (new.id, 'update', v_by, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    insert into public.service_log_history (service_log_id, action, changed_by, old_data)
    values (old.id, 'delete', v_by, to_jsonb(old));
    return old;
  end if;
end;
$$;

revoke execute on function public.record_service_log_history() from public, anon, authenticated;

drop trigger if exists tr_service_log_history on public.service_logs;
create trigger tr_service_log_history
  after insert or update or delete on public.service_logs
  for each row execute function public.record_service_log_history();

alter table public.service_log_history enable row level security;

drop policy if exists "service_log_history: owner read" on public.service_log_history;
create policy "service_log_history: owner read"
  on public.service_log_history for select
  using (public.is_owner_or_above());


-- ============================================================================
-- 7) Cuentas bloqueadas: también en las tablas nuevas (migración 15)
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['vehicles', 'itinerary_day_crews', 'service_log_history'] loop
    execute format('drop policy if exists "blocked denied" on public.%I', t);
    execute format(
      'create policy "blocked denied" on public.%I as restrictive for all using (not (select public.is_blocked()))',
      t
    );
  end loop;
end;
$$;
