/* =============================================================================
   CLORO Y PILETAS PANCHO — Roles y perfiles
   Migración: 20260502000001

   Convenciones:
   - Montos: bigint en centavos. $ 1.500,00 = 150000
   - Fechas: timestamptz UTC
   - updated_at: mantenido por trigger set_updated_at()
   - Roles: 5 niveles — super_admin, owner, marketing, employee, client
   - Rol sincronizado a auth.users.raw_app_meta_data.role por trigger
============================================================================= */

-- ============================================================================
-- 0) Extensiones
-- ============================================================================

create extension if not exists pgcrypto;


-- ============================================================================
-- 1) Funciones utilitarias
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ============================================================================
-- 2) Enum de roles
-- ============================================================================

do $$ begin
  create type public.user_role as enum (
    'super_admin',
    'owner',
    'marketing',
    'employee',
    'client'
  );
exception
  when duplicate_object then null;
end $$;


-- ============================================================================
-- 3) Tabla profiles (1:1 con auth.users)
-- ============================================================================

create table if not exists public.profiles (
  id          uuid          primary key references auth.users(id) on delete cascade,
  full_name   text          not null default '',
  phone       text,
  role        public.user_role not null default 'client',
  status      text          not null default 'active',
  avatar_url  text,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  constraint ck_profiles_status check (status in ('active', 'inactive', 'blocked'))
);

drop trigger if exists tr_profiles_updated_at on public.profiles;
create trigger tr_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create index if not exists ix_profiles_role on public.profiles(role);


-- ============================================================================
-- 4) Trigger: sincronizar rol a app_metadata de Supabase Auth
-- ============================================================================

create or replace function public.sync_role_to_app_metadata()
returns trigger language plpgsql security definer as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('role', new.role::text)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists tr_sync_role on public.profiles;
create trigger tr_sync_role
  after insert or update of role on public.profiles
  for each row execute function public.sync_role_to_app_metadata();


-- ============================================================================
-- 5) Trigger: auto-crear profile cuando se registra un nuevo usuario
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'nombre',
      split_part(new.email, '@', 1),
      'Usuario'
    ),
    'client'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists tr_on_auth_user_created on auth.users;
create trigger tr_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 6) Funciones helper de roles (usadas en RLS)
-- ============================================================================

create or replace function public.get_my_role()
returns text language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'client'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.get_my_role() in ('super_admin', 'owner', 'marketing');
$$;

create or replace function public.is_owner_or_above()
returns boolean language sql stable as $$
  select public.get_my_role() in ('super_admin', 'owner');
$$;
