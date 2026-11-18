/* =============================================================================
   CLORO Y PILETAS PANCHO — Piletas compartidas y alta de cliente en un paso
   Migración: 20261108000024

   Etapa 3c (spec dueño/empleado del 2026-11-04):
   1. pool_clients: una pileta puede tener varios clientes (una pareja, hermanos, un
      consorcio) y un cliente varias piletas. Uno de los clientes de cada pileta es el
      titular (is_primary).
      pools.client_id sigue existiendo y ES el titular: la base mantiene pool_clients
      sincronizado con él. Así el itinerario, los registros de service y la planilla
      siguen leyendo pools.client_id sin cambios.
      - Al crear una pileta, su cliente queda como titular en pool_clients.
      - Cambiar pools.client_id cambia el titular; el anterior queda como co-cliente.
      - Desde la API, en pool_clients solo se suman co-clientes (siempre con rol
        cliente) o se quitan; el titular no se quita (primero se elige otro).
   2. El cliente ve las piletas en las que figura (titular o co-cliente) y sus services.
   3. create_client_with_pool(): alta de un cliente sin cuenta web (solo el nombre es
      obligatorio) junto con una pileta nueva, o sumándolo a una pileta que ya existe,
      en una sola transacción: se guarda todo o nada.

   Idempotente.
============================================================================= */

-- ============================================================================
-- 1) pool_clients
-- ============================================================================

create table if not exists public.pool_clients (
  id          uuid        primary key default gen_random_uuid(),
  pool_id     uuid        not null references public.pools(id) on delete cascade,
  client_id   uuid        not null references public.profiles(id) on delete cascade,
  is_primary  boolean     not null default false,
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint ux_pool_clients_pool_client unique (pool_id, client_id)
);

create unique index if not exists ux_pool_clients_primary
  on public.pool_clients (pool_id)
  where is_primary;

create index if not exists ix_pool_clients_client on public.pool_clients (client_id);

comment on table public.pool_clients is 'Clientes de cada pileta. El titular (is_primary) es siempre pools.client_id: lo sincroniza la base.';

-- Las piletas que ya existen: su cliente actual es el titular
insert into public.pool_clients (pool_id, client_id, is_primary, created_by)
select p.id, p.client_id, true, p.created_by
from public.pools p
on conflict (pool_id, client_id) do update set is_primary = true;


-- ============================================================================
-- 2) Sincronización: pools.client_id → titular de pool_clients
-- ============================================================================

create or replace function public.sync_pool_primary_client()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.client_id is not distinct from old.client_id then
    return null;
  end if;

  -- El titular anterior queda como co-cliente
  update public.pool_clients
  set is_primary = false
  where pool_id = new.id and is_primary and client_id <> new.client_id;

  insert into public.pool_clients (pool_id, client_id, is_primary, created_by)
  values (new.id, new.client_id, true, auth.uid())
  on conflict (pool_id, client_id) do update set is_primary = true;

  return null;
end;
$$;

revoke execute on function public.sync_pool_primary_client() from public, anon, authenticated;

drop trigger if exists tr_sync_pool_primary_client on public.pools;
create trigger tr_sync_pool_primary_client
  after insert or update of client_id on public.pools
  for each row execute function public.sync_pool_primary_client();


-- ============================================================================
-- 3) Guardián de pool_clients (escrituras desde la API)
-- ============================================================================

create or replace function public.guard_pool_client_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Service role, o la sincronización de arriba (corre dentro de otro trigger)
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  -- Roles sin permiso de escritura: los niega RLS (los triggers BEFORE corren antes que RLS,
  -- así no se tapa su error con otro mensaje)
  if not public.is_owner_or_above() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- El titular se cambia desde la pileta (pools.client_id), nunca acá
    new.is_primary := false;
    new.created_by := auth.uid();
    if not exists (select 1 from public.profiles where id = new.client_id and role = 'client') then
      raise exception 'Solo se pueden sumar clientes a una pileta' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Los clientes de una pileta no se editan: se agregan o se quitan' using errcode = '42501';
  end if;

  -- DELETE: el titular no se quita mientras la pileta exista (al borrar la pileta se van todos)
  if old.is_primary and exists (select 1 from public.pools where id = old.pool_id) then
    raise exception 'No se puede quitar al titular de la pileta: primero hacé titular a otro cliente' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists tr_guard_pool_client_write on public.pool_clients;
create trigger tr_guard_pool_client_write
  before insert or update or delete on public.pool_clients
  for each row execute function public.guard_pool_client_write();


-- ============================================================================
-- 4) Permisos
-- ============================================================================

-- ¿La persona con sesión figura en la pileta? (security definer: la usan las políticas de
-- pools y service_logs sin depender de las políticas de pool_clients)
create or replace function public.is_pool_client(p_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and exists (select 1 from public.pool_clients pc where pc.pool_id = p_pool_id and pc.client_id = auth.uid());
$$;

revoke execute on function public.is_pool_client(uuid) from public;
grant  execute on function public.is_pool_client(uuid) to anon, authenticated;

alter table public.pool_clients enable row level security;

drop policy if exists "pool_clients: own or admin read" on public.pool_clients;
create policy "pool_clients: own or admin read"
  on public.pool_clients for select
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists "pool_clients: owner manages" on public.pool_clients;
create policy "pool_clients: owner manages"
  on public.pool_clients for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "blocked denied" on public.pool_clients;
create policy "blocked denied" on public.pool_clients as restrictive for all using (not (select public.is_blocked()));

-- El cliente ve las piletas en las que figura (antes: solo las suyas como titular)
drop policy if exists "pools: client sees own" on public.pools;
create policy "pools: client sees own"
  on public.pools for select
  using (
    client_id = auth.uid()
    or public.is_pool_client(id)
    or public.is_admin()
    or (public.get_my_role() = 'employee' and public.employee_can_see_pool(id))
  );

-- ...y los services de esas piletas
drop policy if exists "service_logs: client read own" on public.service_logs;
create policy "service_logs: client read own"
  on public.service_logs for select
  using (client_id = auth.uid() or public.is_pool_client(pool_id));


-- ============================================================================
-- 5) Alta de cliente (sin cuenta web) + pileta, en una sola transacción
-- ============================================================================

create or replace function public.create_client_with_pool(
  p_full_name     text,
  p_client_number integer default null,
  p_phone         text    default null,
  p_notes         text    default null,
  p_pool_mode     text    default 'none',   -- 'new' | 'existing' | 'none'
  p_pool_id       uuid    default null,     -- con 'existing'
  p_address       text    default null,     -- con 'new'
  p_neighborhood  text    default null,
  p_nickname      text    default null,
  p_pool_type     text    default null,
  p_pool_notes    text    default null
)
returns jsonb
language plpgsql
security invoker   -- corre con los permisos (RLS) de quien llama
set search_path = public, pg_temp
as $$
declare
  v_client uuid;
  v_pool   uuid;
begin
  if not public.is_owner_or_above() then
    raise exception 'No tenés permisos para dar de alta clientes' using errcode = '42501';
  end if;
  if p_pool_mode not in ('new', 'existing', 'none') then
    raise exception 'Opción de pileta inválida' using errcode = '22023';
  end if;
  if p_pool_type is not null and p_pool_type not in ('fibra', 'hormigon', 'liner', 'otro') then
    raise exception 'Tipo de pileta inválido' using errcode = '22023';
  end if;

  insert into public.profiles (full_name, phone, role)
  values (btrim(p_full_name), nullif(btrim(p_phone), ''), 'client')
  returning id into v_client;

  insert into public.client_profiles (id, client_number, notes)
  values (v_client, p_client_number, nullif(btrim(p_notes), ''));

  if p_pool_mode = 'new' then
    insert into public.pools (client_id, address, neighborhood, nickname, pool_type, notes, created_by)
    values (
      v_client,
      nullif(btrim(p_address), ''),
      nullif(btrim(p_neighborhood), ''),
      nullif(btrim(p_nickname), ''),
      p_pool_type,
      nullif(btrim(p_pool_notes), ''),
      auth.uid()
    )
    returning id into v_pool;
  elsif p_pool_mode = 'existing' then
    if p_pool_id is null or not exists (select 1 from public.pools where id = p_pool_id) then
      raise exception 'La pileta elegida no existe' using errcode = '23503';
    end if;
    insert into public.pool_clients (pool_id, client_id) values (p_pool_id, v_client);
    v_pool := p_pool_id;
  end if;

  return jsonb_build_object('client_id', v_client, 'pool_id', v_pool);
end;
$$;

revoke execute on function public.create_client_with_pool(text, integer, text, text, text, uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.create_client_with_pool(text, integer, text, text, text, uuid, text, text, text, text, text) to authenticated;
