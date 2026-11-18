/* =============================================================================
   CLORO Y PILETAS PANCHO — Sistema de puntos y niveles
   Migración: 20260502000007

   Decisiones:
   - Niveles y reglas son dinámicos (marketing los configura).
   - Puntos auto-asignados en compras online al confirmar pago.
   - Puntos manuales asignados por marketing en ventas por WhatsApp.
   - Trigger actualiza points_balance y client_level_id en profiles.
============================================================================= */

-- ============================================================================
-- 1) Niveles de cliente
-- ============================================================================

create table if not exists public.client_levels (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  min_points  integer     not null default 0 check (min_points >= 0),
  benefits    jsonb       not null default '[]',   -- array de strings
  sort_order  integer     not null default 0,
  color       text        not null default '#1B5FA8',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists tr_client_levels_updated_at on public.client_levels;
create trigger tr_client_levels_updated_at
  before update on public.client_levels
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 2) Agregar campos de puntos a profiles
-- ============================================================================

alter table public.profiles
  add column if not exists points_balance   integer not null default 0,
  add column if not exists client_level_id  uuid references public.client_levels(id);


-- ============================================================================
-- 3) Reglas de acumulación de puntos
-- ============================================================================

create table if not exists public.point_rules (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,
  description         text,
  trigger_type        text        not null,
  -- Cuántos puntos por cada $100 ARS gastados (o fijo si monto_base = null)
  points_per_100_ars  integer     not null default 1 check (points_per_100_ars > 0),
  min_amount_cents    bigint      not null default 0,
  is_active           boolean     not null default true,
  starts_at           timestamptz,
  ends_at             timestamptz,
  created_by          uuid        references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ck_point_rules_trigger
    check (trigger_type in ('purchase_online', 'purchase_manual', 'service', 'manual_grant'))
);

drop trigger if exists tr_point_rules_updated_at on public.point_rules;
create trigger tr_point_rules_updated_at
  before update on public.point_rules
  for each row execute function public.set_updated_at();

create index if not exists ix_point_rules_active on public.point_rules(is_active);


-- ============================================================================
-- 4) Transacciones de puntos
-- ============================================================================

create table if not exists public.point_transactions (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.profiles(id),
  points      integer     not null,                   -- positivo = suma, negativo = resta
  rule_id     uuid        references public.point_rules(id),
  source_type text        not null,
  source_id   uuid,                                   -- id de la orden, venta manual, etc.
  notes       text,
  created_by  uuid        references public.profiles(id),
  created_at  timestamptz not null default now(),
  constraint ck_point_transactions_source
    check (source_type in ('order', 'manual_sale', 'service', 'manual_grant', 'adjustment'))
);

create index if not exists ix_point_transactions_client_id on public.point_transactions(client_id);
create index if not exists ix_point_transactions_created   on public.point_transactions(created_at);


-- ============================================================================
-- 5) Trigger: actualizar balance y nivel al agregar puntos
-- ============================================================================

create or replace function public.update_client_points_and_level()
returns trigger language plpgsql as $$
declare
  v_balance integer;
  v_level_id uuid;
begin
  -- Calcular nuevo balance total
  select coalesce(sum(points), 0)
  into v_balance
  from public.point_transactions
  where client_id = new.client_id;

  -- Determinar el nivel correspondiente
  select id
  into v_level_id
  from public.client_levels
  where min_points <= v_balance
  order by min_points desc
  limit 1;

  -- Actualizar el perfil
  update public.profiles
  set
    points_balance  = v_balance,
    client_level_id = v_level_id
  where id = new.client_id;

  return new;
end;
$$;

drop trigger if exists tr_update_points_and_level on public.point_transactions;
create trigger tr_update_points_and_level
  after insert on public.point_transactions
  for each row execute function public.update_client_points_and_level();


-- ============================================================================
-- 6) Seed: niveles iniciales
-- ============================================================================

insert into public.client_levels (name, min_points, benefits, sort_order, color)
values
  ('Bronce', 0,    '["Acceso a ofertas exclusivas"]',                                              1, '#CD7F32'),
  ('Plata',  500,  '["5% descuento en compras", "Acceso a ofertas exclusivas"]',                   2, '#A0A0A0'),
  ('Oro',    1500, '["10% descuento en compras", "Envío gratis", "Prioridad en atención"]',        3, '#FFD700')
on conflict do nothing;
