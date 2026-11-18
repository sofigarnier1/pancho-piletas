/*
  Migración 31 — Precios por cliente (roadmap de Pancho, etapa 4)

  Cada cliente tiene su precio del service, del desagote y del cloro (por litro de líquido, por kilo de
  granulado y por pastilla). Los precios cambian con el tiempo: cada precio rige desde una fecha
  (valid_from) hasta que otro del mismo tipo empieza a regir. Así la deuda (etapa 5) cobra cada visita
  con el precio que valía ese día.

  Reglas:
  1. Solo owner y super_admin leen y escriben (ni empleado, ni marketing, ni el cliente).
  2. Solo para cuentas con rol cliente.
  3. Un precio por cliente, tipo y fecha (unique). Entre 0 y $100.000.000 (en centavos).
  4. created_by lo fija la base; updated_at, el trigger de siempre (set_updated_at).
  6. Cuenta bloqueada: política restrictiva "blocked denied", como el resto de las tablas privadas.
  5. precio_vigente(cliente, tipo, fecha): el precio que rige ese día (null si no hay).
*/

create table if not exists public.client_prices (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  price_cents bigint not null,
  valid_from  date not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ck_client_prices_kind check (kind in ('service', 'desagote', 'cloro_liquido', 'cloro_granulado', 'cloro_pastilla')),
  constraint ck_client_prices_amount check (price_cents >= 0 and price_cents <= 10000000000),
  constraint ck_client_prices_valid_from check (valid_from >= date '2000-01-01' and valid_from <= date '2100-12-31'),
  constraint ux_client_prices unique (client_id, kind, valid_from)
);

comment on table public.client_prices is
  'Precio de cada cliente por tipo (service, desagote y cloro por litro/kilo/pastilla), desde una fecha. Solo owner y super_admin.';
comment on column public.client_prices.price_cents is
  'Centavos. Service y desagote: por visita. cloro_liquido: por litro. cloro_granulado: por kilo. cloro_pastilla: por pastilla.';

create index if not exists ix_client_prices_lookup on public.client_prices (client_id, kind, valid_from desc);

alter table public.client_prices enable row level security;

drop policy if exists "client_prices: owner all" on public.client_prices;
create policy "client_prices: owner all"
  on public.client_prices for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "blocked denied" on public.client_prices;
create policy "blocked denied" on public.client_prices as restrictive for all using (not (select public.is_blocked()));

revoke all on public.client_prices from anon;
grant select, insert, update, delete on public.client_prices to authenticated;

-- Solo para clientes; autor y fecha de cambio los pone la base
create or replace function public.guard_client_price_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.client_id is distinct from old.client_id then
    raise exception 'El cliente de un precio no se puede cambiar' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = new.client_id and role = 'client') then
    raise exception 'Los precios son solo para clientes' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_client_price_write() from public, anon, authenticated;

drop trigger if exists tr_guard_client_price_write on public.client_prices;
create trigger tr_guard_client_price_write
  before insert or update on public.client_prices
  for each row execute function public.guard_client_price_write();

drop trigger if exists tr_client_prices_updated_at on public.client_prices;
create trigger tr_client_prices_updated_at
  before update on public.client_prices
  for each row execute function public.set_updated_at();

-- El precio que rige un día (security invoker: RLS sigue valiendo, así que fuera del dueño devuelve null)
create or replace function public.precio_vigente(p_client uuid, p_kind text, p_date date)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $$
  select cp.price_cents
    from public.client_prices cp
   where cp.client_id = p_client and cp.kind = p_kind and cp.valid_from <= p_date
   order by cp.valid_from desc
   limit 1;
$$;

revoke execute on function public.precio_vigente(uuid, text, date) from public, anon;
grant execute on function public.precio_vigente(uuid, text, date) to authenticated;
