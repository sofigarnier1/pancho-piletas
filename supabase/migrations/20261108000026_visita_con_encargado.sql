/*
  Migración 26 — Visita con encargado ("Lo tiene que hacer X")

  El dueño puede indicar en una visita del itinerario quién la tiene que hacer
  (itinerary_items.assigned_employee_id, columna que ya existía). Regla acordada el 2026-11-07:

  1. La visita sigue en la ruta de su auto: todo el equipo del auto la ve (con "Le toca a X").
  2. Solo X la puede registrar (service_logs) o marcar (salteada / no estaba / pendiente).
  3. Si X no va en ese auto ese día (o la visita no tiene auto), X la ve igual.
  4. El encargado tiene que ser alguien del equipo que sale a hacer piletas: empleado o dueño,
     no bloqueado. Lo valida la base al guardar.

  El dueño y el súper admin no cambian: registran cualquier visita a nombre de cualquiera.
*/

-- 1) Ver: el equipo del auto, o el encargado aunque no vaya en el auto ---------------------------
create or replace function public.employee_can_see_item(p_day_id uuid, p_vehicle_id uuid, p_assigned uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (p_assigned is not null and p_assigned = auth.uid())
    or case
      when p_vehicle_id is null then p_assigned is null
      else exists (
        select 1 from public.itinerary_day_crews c
        where c.itinerary_day_id = p_day_id
          and c.vehicle_id = p_vehicle_id
          and c.employee_id = auth.uid()
      )
    end;
$$;

-- 2) Registrar o marcar: lo de arriba y, si tiene encargado, solo el encargado ------------------
create or replace function public.employee_can_work_item(p_day_id uuid, p_vehicle_id uuid, p_assigned uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.employee_can_see_item(p_day_id, p_vehicle_id, p_assigned)
     and (p_assigned is null or p_assigned = auth.uid());
$$;

revoke execute on function public.employee_can_work_item(uuid, uuid, uuid) from public, anon;
grant  execute on function public.employee_can_work_item(uuid, uuid, uuid) to authenticated;

drop policy if exists "itinerary_items: employee update assigned" on public.itinerary_items;
create policy "itinerary_items: employee update assigned"
  on public.itinerary_items for update
  using (
    public.get_my_role() = 'employee'
    and public.employee_can_work_item(itinerary_day_id, vehicle_id, assigned_employee_id)
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
        and public.employee_can_work_item(ii.itinerary_day_id, ii.vehicle_id, ii.assigned_employee_id)
    )
    and exists (
      select 1
      from public.pools p
      where p.id = service_logs.pool_id
        and p.client_id = service_logs.client_id
    )
  );

-- 3) El encargado tiene que ser del equipo que sale a hacer piletas ------------------------------
create or replace function public.check_item_assignee()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_employee_id is not null
     and (tg_op = 'INSERT' or new.assigned_employee_id is distinct from old.assigned_employee_id)
     and not exists (
       select 1 from public.profiles p
       where p.id = new.assigned_employee_id
         and p.role in ('employee', 'owner')
         and p.status <> 'blocked'
     )
  then
    raise exception 'La visita solo se le puede asignar a alguien del equipo (empleado o dueño)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_check_item_assignee on public.itinerary_items;
create trigger tr_check_item_assignee
  before insert or update of assigned_employee_id on public.itinerary_items
  for each row execute function public.check_item_assignee();

comment on column public.itinerary_items.assigned_employee_id is
  'Encargado de la visita ("Lo tiene que hacer X"): todo el auto la ve, solo esta persona la registra. Null = cualquiera del auto.';
