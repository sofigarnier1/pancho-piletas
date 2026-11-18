/* =============================================================================
   CLORO Y PILETAS PANCHO — Un solo registro de service por visita
   Migración: 20261003000014

   Problema: el trigger de cierre conservaba quién cerró primero, pero nada
   impedía insertar un segundo service_log sobre un item ya resuelto (dos
   empleados a la vez, o el formulario reenviado).

   1. Índice único parcial: un item del itinerario tiene como máximo un log.
   2. Guardián BEFORE INSERT: bloquea la fila del item y rechaza el log si ya
      no está 'pending'. El bloqueo serializa a dos empleados simultáneos: el
      segundo espera, ve el item cerrado y recibe un error claro (PA001).
   3. Los empleados no pueden cambiar el estado de un item ya resuelto
      (owner / super_admin sí, para corregir).

   Idempotente. NO borra datos: si ya hubiera logs duplicados sobre el mismo
   item, el más antiguo conserva el vínculo y los demás quedan sin item
   (itinerary_item_id = null) para poder revisarlos a mano.
============================================================================= */

-- 1) Desvincular duplicados existentes (sin borrarlos) y crear el índice único
with ranked as (
  select id,
         row_number() over (partition by itinerary_item_id order by created_at, id) as rn
  from public.service_logs
  where itinerary_item_id is not null
)
update public.service_logs sl
set itinerary_item_id = null
from ranked r
where sl.id = r.id and r.rn > 1;

create unique index if not exists ux_service_logs_item
  on public.service_logs (itinerary_item_id)
  where itinerary_item_id is not null;


-- 2) Guardián: solo se registra el service de un item que sigue pendiente
create or replace function public.guard_service_log_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if new.itinerary_item_id is null then
    return new;
  end if;

  -- FOR UPDATE: el segundo insert concurrente espera acá hasta que el primero termine
  select status into v_status
  from public.itinerary_items
  where id = new.itinerary_item_id
  for update;

  if found and v_status <> 'pending' then
    raise exception 'La pileta ya fue resuelta' using errcode = 'PA001';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_service_log_insert() from public, anon, authenticated;

drop trigger if exists tr_guard_service_log_insert on public.service_logs;
create trigger tr_guard_service_log_insert
  before insert on public.service_logs
  for each row execute function public.guard_service_log_insert();


-- 3) Empleados: un item resuelto no se reabre ni cambia de estado
create or replace function public.guard_itinerary_item_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.get_my_role() = 'employee' then
    if new.itinerary_day_id     is distinct from old.itinerary_day_id
       or new.pool_id              is distinct from old.pool_id
       or new.sort_order           is distinct from old.sort_order
       or new.assigned_employee_id is distinct from old.assigned_employee_id
       or (new.completed_by is not null and new.completed_by <> auth.uid())
    then
      raise exception 'Los empleados solo pueden marcar el estado del item'
        using errcode = '42501';
    end if;

    if old.status <> 'pending' and new.status is distinct from old.status then
      raise exception 'La pileta ya fue resuelta' using errcode = 'PA001';
    end if;
  end if;

  return new;
end;
$$;
