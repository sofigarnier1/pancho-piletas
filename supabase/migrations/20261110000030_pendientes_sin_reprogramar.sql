/*
  Migración 30 — Que no se pase ningún cliente

  Pancho arma la semana a mano y a veces se le pasan visitas que quedaron sin hacer (salteadas,
  "no estaba el cliente" o pendientes). Esta migración deja todo listo para avisarle al armar el día:

  1. itinerary_items.rescheduled_from_item_id: la visita nueva recuerda de qué visita sin hacer viene.
     - Cada visita sin hacer se vuelve a agendar UNA sola vez (índice único).
     - Tiene que ser de la misma pileta, de un día anterior, y la original no puede estar hecha.
     - El empleado no la puede cambiar (guard_itinerary_item_update).
  2. pendientes_sin_reprogramar(fecha): las visitas sin hacer de los 7 días anteriores a "fecha" que
     todavía no se volvieron a agendar (las pendientes, solo si su día ya pasó). Una visita sale de la lista si:
       - ya se reprogramó (otra visita tiene rescheduled_from_item_id = ella), o
       - la pileta ya tiene otra visita posterior hasta "fecha" inclusive (ya se la va a ver), o
       - la pileta está inactiva.
     Solo owner y super_admin. Es security invoker: RLS sigue valiendo.
  3. Las funciones de trigger guard_* no se pueden llamar por la API (revoke execute), igual que
     guard_service_log_insert y clear_item_status_note.
*/

-- 1. De qué visita sin hacer viene esta
alter table public.itinerary_items
  add column if not exists rescheduled_from_item_id uuid references public.itinerary_items(id) on delete set null;

comment on column public.itinerary_items.rescheduled_from_item_id is
  'Visita sin hacer (de un día anterior, misma pileta) que esta vuelve a agendar. Una sola vez por visita.';

create unique index if not exists ux_itinerary_items_rescheduled_from
  on public.itinerary_items (rescheduled_from_item_id)
  where rescheduled_from_item_id is not null;

create or replace function public.check_item_rescheduled_from()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_src_pool uuid;
  v_src_status text;
  v_src_date date;
  v_new_date date;
begin
  if new.rescheduled_from_item_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.rescheduled_from_item_id is not distinct from old.rescheduled_from_item_id
     and new.pool_id is not distinct from old.pool_id and new.itinerary_day_id is not distinct from old.itinerary_day_id then
    return new;
  end if;

  select i.pool_id, i.status, d.date into v_src_pool, v_src_status, v_src_date
    from public.itinerary_items i join public.itinerary_days d on d.id = i.itinerary_day_id
   where i.id = new.rescheduled_from_item_id;
  select d.date into v_new_date from public.itinerary_days d where d.id = new.itinerary_day_id;

  if v_src_pool is null or v_src_pool is distinct from new.pool_id then
    raise exception 'La visita que se reprograma tiene que ser de la misma pileta' using errcode = '22023';
  end if;
  if v_src_date >= v_new_date then
    raise exception 'Solo se puede reprogramar una visita de un día anterior' using errcode = '22023';
  end if;
  if v_src_status = 'done' then
    raise exception 'Esa visita ya está hecha' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_item_rescheduled_from() from public, anon, authenticated;

drop trigger if exists tr_check_item_rescheduled_from on public.itinerary_items;
create trigger tr_check_item_rescheduled_from
  before insert or update on public.itinerary_items
  for each row execute function public.check_item_rescheduled_from();

-- El empleado tampoco puede tocar rescheduled_from_item_id (misma función que la migración 22 + esa columna)
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
       or new.rescheduled_from_item_id is distinct from old.rescheduled_from_item_id
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

-- 2. Visitas sin hacer de la semana anterior que nadie volvió a agendar
create or replace function public.pendientes_sin_reprogramar(p_fecha date)
returns table (
  item_id uuid,
  pool_id uuid,
  date date,
  status text,
  status_note text,
  service_type text,
  client_name text,
  client_number integer,
  nickname text,
  address text,
  neighborhood text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_fecha is null then
    raise exception 'Falta la fecha' using errcode = '22023';
  end if;
  if not public.is_owner_or_above() then
    raise exception 'Solo el dueño puede ver las visitas sin reprogramar' using errcode = '42501';
  end if;

  return query
  select i.id, i.pool_id, d.date, i.status::text, i.status_note, i.service_type::text,
         pr.full_name::text, cp.client_number::integer, p.nickname::text, p.address::text, p.neighborhood::text
    from public.itinerary_items i
    join public.itinerary_days d on d.id = i.itinerary_day_id
    join public.pools p on p.id = i.pool_id
    left join public.profiles pr on pr.id = p.client_id
    left join public.client_profiles cp on cp.id = p.client_id
   where d.date >= p_fecha - 7 and d.date < p_fecha
     and i.status <> 'done'
     -- una pendiente de hoy todavía se puede hacer: cuenta recién cuando pasó su día
     and (i.status <> 'pending' or d.date < public.today_ar())
     and p.is_active
     and not exists (select 1 from public.itinerary_items r where r.rescheduled_from_item_id = i.id)
     and not exists (
       select 1 from public.itinerary_items o
         join public.itinerary_days od on od.id = o.itinerary_day_id
        where o.pool_id = i.pool_id and o.id <> i.id and od.date > d.date and od.date <= p_fecha)
   order by d.date, cp.client_number nulls last, pr.full_name;
end;
$$;

revoke execute on function public.pendientes_sin_reprogramar(date) from public, anon;
grant execute on function public.pendientes_sin_reprogramar(date) to authenticated;

-- 3. Las funciones de trigger no se llaman por la API
revoke execute on function public.guard_itinerary_item_update() from public, anon, authenticated;
revoke execute on function public.guard_pool_client_write()    from public, anon, authenticated;
revoke execute on function public.guard_product_update()       from public, anon, authenticated;
revoke execute on function public.guard_profile_write()        from public, anon, authenticated;
