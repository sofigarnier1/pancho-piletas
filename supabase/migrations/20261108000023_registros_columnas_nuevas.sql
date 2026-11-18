/* =============================================================================
   CLORO Y PILETAS PANCHO — Registros de service: fuera las columnas viejas
   Migración: 20261108000023

   Etapa 2 (pantalla del empleado). La pantalla ya usa las columnas nuevas de la
   migración 22, así que:
   1. Se eliminan las columnas obsoletas cleaning_done, vacuum_done, painting_done y
      chlorine_amount_kg. Antes de borrar, los kg que no se pudieron pasar a la unidad
      nueva (pastillas, o valores fuera de rango) se copian a las observaciones del
      registro: no se pierde ningún dato.
   2. service_logs.service_type: el tipo de visita (service o desagote) queda guardado
      en el registro. Lo fija la base a partir de la visita (no se manda desde el
      navegador) y acompaña los cambios de tipo que haga el dueño al planificar. Así el
      cliente y la planilla mensual lo ven sin leer el itinerario.
   3. service_logs.request_id: clave del envío del formulario. Un mismo envío repetido
      (doble toque, reintento de la red) no crea un segundo registro.
   4. team_names(): nombres de la gente del equipo (empleado, dueño, super_admin) para
      que el empleado vea con quién va en el auto y quién hizo cada registro. Solo
      devuelve id y nombre, y solo a gente del equipo.

   Idempotente.
============================================================================= */

-- ============================================================================
-- 1) Rescatar los kg sin convertir y eliminar las columnas obsoletas
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_logs' and column_name = 'chlorine_amount_kg'
  ) then
    -- Sin triggers: es un traspaso de datos, no un cambio de una persona (no va al historial)
    execute 'alter table public.service_logs disable trigger user';
    execute $sql$
      update public.service_logs
      set notes = concat_ws(
            E'\n',
            nullif(btrim(notes), ''),
            format('Cloro anotado en kg (antes del cambio de unidades): %s kg', trim_scale(chlorine_amount_kg))
          )
      where chlorine_amount_kg is not null
        and chlorine_amount is null
    $sql$;
    execute 'alter table public.service_logs enable trigger user';
  end if;
end $$;

-- El guardián ya no convierte kg (se reemplaza ANTES de borrar la columna que leía)
create or replace function public.guard_service_log_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_date date;
  v_type text;
begin
  -- Fecha y tipo de visita salen de la visita (si la hay); sin visita, el tipo es 'service'
  if new.itinerary_item_id is not null then
    select d.date, i.service_type into v_date, v_type
    from public.itinerary_items i
    join public.itinerary_days d on d.id = i.itinerary_day_id
    where i.id = new.itinerary_item_id;
  end if;
  new.service_type := coalesce(v_type, case when tg_op = 'UPDATE' then old.service_type end, 'service');

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

    -- La clave del envío es de la creación: no cambia después
    new.request_id := old.request_id;
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
  if v_date is not null then
    new.date := v_date;
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

revoke execute on function public.guard_service_log_write() from public, anon, authenticated;

-- Las restricciones que usan estas columnas (ck_service_logs_chlorine_amount) se van con ellas
alter table public.service_logs drop column if exists cleaning_done;
alter table public.service_logs drop column if exists vacuum_done;
alter table public.service_logs drop column if exists painting_done;
alter table public.service_logs drop column if exists chlorine_amount_kg;


-- ============================================================================
-- 2) Tipo de visita en el registro
-- ============================================================================

alter table public.service_logs add column if not exists service_type text not null default 'service';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_service_logs_service_type') then
    alter table public.service_logs
      add constraint ck_service_logs_service_type check (service_type in ('service', 'desagote'));
  end if;
end $$;

comment on column public.service_logs.service_type is 'service o desagote. Lo fija la base desde itinerary_items.service_type.';

-- Lo existente toma el tipo de su visita (sin pasar por los triggers: no es un cambio de nadie)
alter table public.service_logs disable trigger user;
update public.service_logs sl
set service_type = i.service_type
from public.itinerary_items i
where i.id = sl.itinerary_item_id
  and sl.service_type is distinct from i.service_type;
alter table public.service_logs enable trigger user;

-- Si el dueño cambia el tipo de una visita, sus registros lo acompañan
create or replace function public.sync_service_type_to_logs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.service_logs
  set service_type = new.service_type
  where itinerary_item_id = new.id
    and service_type is distinct from new.service_type;
  return new;
end;
$$;

revoke execute on function public.sync_service_type_to_logs() from public, anon, authenticated;

drop trigger if exists tr_sync_service_type_to_logs on public.itinerary_items;
create trigger tr_sync_service_type_to_logs
  after update of service_type on public.itinerary_items
  for each row
  when (new.service_type is distinct from old.service_type)
  execute function public.sync_service_type_to_logs();


-- ============================================================================
-- 3) Un mismo envío del formulario no crea dos registros
-- ============================================================================

alter table public.service_logs add column if not exists request_id uuid;

create unique index if not exists ux_service_logs_request
  on public.service_logs (request_id)
  where request_id is not null;

comment on column public.service_logs.request_id is 'Clave del envío del formulario (la genera la pantalla). Repetir el envío no duplica el registro.';


-- ============================================================================
-- 4) Nombres del equipo (para el empleado: compañeros de auto y autores de registros)
-- ============================================================================

create or replace function public.team_names(p_ids uuid[])
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id = any (p_ids)
    and p.role in ('employee', 'owner', 'super_admin')
    and public.get_my_role() in ('employee', 'owner', 'super_admin')
    and not public.is_blocked();
$$;

revoke execute on function public.team_names(uuid[]) from public, anon;
grant  execute on function public.team_names(uuid[]) to authenticated;
