/* =============================================================================
   CLORO Y PILETAS PANCHO — Cuentas bloqueadas
   Migración: 20261003000015

   Hasta ahora profiles.status = 'blocked' era solo una etiqueta: nada la
   consultaba. Ahora significa "no puede usar el sistema":

   1. my_account_status(): estado de la cuenta actual (security definer, para
      que el proxy y las acciones lo lean aunque RLS le niegue el perfil).
   2. is_blocked(): booleano para RLS.
   3. Política RESTRICTIVA "blocked denied" en todas las tablas privadas: se
      combina (AND) con las políticas existentes, así que no hay que tocarlas.
      Quedan fuera las tablas de lectura pública de la landing (products,
      landing_content, client_levels) para que el sitio público no se rompa.
   4. Al bloquear a alguien se cierran todas sus sesiones.
   5. get_my_role() lee el rol de profiles y no del JWT: un cambio de rol (o una
      degradación) rige en la próxima consulta, sin esperar a que el token (1 h)
      venza. Antes, un owner degradado conservaba permisos de base hasta entonces.

   'inactive' NO bloquea el acceso (cliente que dejó de comprar, por ejemplo).
   Idempotente.
============================================================================= */

create or replace function public.my_account_status()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select status from public.profiles where id = auth.uid();
$$;

create or replace function public.is_blocked()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select status = 'blocked' from public.profiles where id = auth.uid()), false);
$$;

-- is_blocked() también lo evalúa 'anon' (las políticas restrictivas corren en toda consulta,
-- p. ej. la lectura pública de point_rules): sin sesión devuelve false.
revoke execute on function public.my_account_status() from public, anon;
grant  execute on function public.my_account_status() to authenticated;
grant  execute on function public.is_blocked()        to anon, authenticated;


-- 3) Política restrictiva en las tablas privadas
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'client_profiles', 'employee_profiles', 'pools',
    'itinerary_days', 'itinerary_items', 'service_logs',
    'orders', 'order_items', 'manual_sales', 'manual_sale_items',
    'point_rules', 'point_transactions'
  ] loop
    execute format('drop policy if exists "blocked denied" on public.%I', t);
    execute format(
      'create policy "blocked denied" on public.%I as restrictive for all using (not (select public.is_blocked()))',
      t
    );
  end loop;
end;
$$;


-- 4) Bloquear = cerrar sesiones abiertas
create or replace function public.revoke_sessions_on_block()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.status = 'blocked' and old.status is distinct from 'blocked' then
    delete from auth.sessions where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.revoke_sessions_on_block() from public, anon, authenticated;

drop trigger if exists tr_revoke_sessions_on_block on public.profiles;
create trigger tr_revoke_sessions_on_block
  after update of status on public.profiles
  for each row execute function public.revoke_sessions_on_block();


-- 5) El rol sale de la base (fuente de verdad), no del token firmado
--    Sin perfil (service role, anónimo) devuelve 'client', igual que antes.
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'client');
$$;
