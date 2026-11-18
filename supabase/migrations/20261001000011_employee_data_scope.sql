/* =============================================================================
   CLORO Y PILETAS PANCHO — Alcance de datos del empleado (opcional)
   Migración: 20261001000011

   Hasta ahora un empleado leía TODOS los perfiles y TODAS las piletas.
   Esta migración lo limita a las piletas presentes en itinerarios que puede
   ver (asignadas a él o a "todos") y a los clientes dueños de esas piletas.

   Se aplica por separado de la 10 a propósito: si algo del flujo del
   empleado se rompe, se puede revertir sin tocar el hardening crítico.
   Revertir: recrear las políticas originales de 20260502000009_rls.sql.
============================================================================= */

-- ¿El empleado actual puede ver esta pileta a través del itinerario?
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
      and (ii.assigned_employee_id is null or ii.assigned_employee_id = auth.uid())
  );
$$;

revoke execute on function public.employee_can_see_pool(uuid) from public, anon;
grant  execute on function public.employee_can_see_pool(uuid) to authenticated;

-- pools
drop policy if exists "pools: client sees own" on public.pools;
create policy "pools: client sees own"
  on public.pools for select
  using (
    client_id = auth.uid()
    or public.is_admin()
    or (public.get_my_role() = 'employee' and public.employee_can_see_pool(id))
  );

-- profiles
drop policy if exists "profiles: own read" on public.profiles;
create policy "profiles: own read"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.is_admin()
    or (
      public.get_my_role() = 'employee'
      and exists (
        select 1
        from public.pools p
        where p.client_id = profiles.id
          and public.employee_can_see_pool(p.id)
      )
    )
  );
