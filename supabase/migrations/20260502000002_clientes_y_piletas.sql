/* =============================================================================
   CLORO Y PILETAS PANCHO — Clientes y piletas
   Migración: 20260502000002
============================================================================= */

-- ============================================================================
-- 1) Perfil extendido de clientes
-- ============================================================================

create table if not exists public.client_profiles (
  id              uuid        primary key references public.profiles(id) on delete cascade,
  address         text,
  neighborhood    text,
  city            text        not null default 'Buenos Aires',
  shipping_notes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists tr_client_profiles_updated_at on public.client_profiles;
create trigger tr_client_profiles_updated_at
  before update on public.client_profiles
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2) Perfil extendido de empleados
-- ============================================================================

create table if not exists public.employee_profiles (
  id          uuid        primary key references public.profiles(id) on delete cascade,
  vehicle     text,
  zone        text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists tr_employee_profiles_updated_at on public.employee_profiles;
create trigger tr_employee_profiles_updated_at
  before update on public.employee_profiles
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 3) Piletas (asociadas a clientes)
-- ============================================================================

create table if not exists public.pools (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references public.profiles(id) on delete cascade,
  -- Identificación
  nickname     text,                          -- "Casa de Sarmiento", "Country"
  address      text        not null,
  neighborhood text,
  city         text        not null default 'Buenos Aires',
  -- Geolocalización (para link a Google Maps)
  lat          numeric(10,7),
  lng          numeric(10,7),
  -- Características
  pool_type    text,                          -- fibra, hormigon, liner, otro
  notes        text,
  is_active    boolean     not null default true,
  -- Auditoría
  created_by   uuid        references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists tr_pools_updated_at on public.pools;
create trigger tr_pools_updated_at
  before update on public.pools
  for each row execute function public.set_updated_at();

create index if not exists ix_pools_client_id on public.pools(client_id);
create index if not exists ix_pools_is_active  on public.pools(is_active);
