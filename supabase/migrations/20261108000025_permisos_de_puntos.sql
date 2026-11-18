/* ============================================================================
   Migración 25: permisos de puntos según cómo trabaja el negocio.
   (Antes era la 22 de la rama del dueño/empleado, que también abría el stock a
   marketing; esa parte se descartó: el stock queda como lo dejó la 19
   marketing_crea_productos, marketing no cambia la cantidad.)

   Puntos: los edita marketing; el dueño solo los mira.
   - point_transactions: el insert manual queda para super_admin y marketing (antes: cualquier admin).
     Las demás condiciones de la migración 17 (manual_grant, tope, solo a clientes) se mantienen.
   - client_levels: escriben super_admin y marketing (antes también el dueño). Leer, todos.
   - point_rules ya era de marketing; el dueño las sigue leyendo (is_admin).
   ============================================================================ */

-- Puntos --------------------------------------------------------------------

create or replace function public.can_edit_points()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.get_my_role() in ('super_admin', 'marketing');
$$;

revoke execute on function public.can_edit_points() from public, anon;
grant  execute on function public.can_edit_points() to authenticated;

drop policy if exists "point_transactions: staff insert manual" on public.point_transactions;
create policy "point_transactions: staff insert manual"
  on public.point_transactions for insert
  with check (
    public.can_edit_points()
    and source_type = 'manual_grant'
    and points <> 0
    and points between -100000 and 100000
    and exists (
      select 1 from public.profiles p
      where p.id = point_transactions.client_id and p.role = 'client'
    )
  );

drop policy if exists "client_levels: staff manages" on public.client_levels;
drop policy if exists "client_levels: marketing manages" on public.client_levels;
create policy "client_levels: marketing manages"
  on public.client_levels for all
  using (public.can_edit_points())
  with check (public.can_edit_points());
