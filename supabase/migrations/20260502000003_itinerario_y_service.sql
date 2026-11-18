/* =============================================================================
   CLORO Y PILETAS PANCHO — Itinerario y registros de service
   Migración: 20260502000003

   Decisiones:
   - Sin recurrencia automática. El owner carga cada día manualmente.
   - "Copiar semana anterior" es una función del app (no de la DB).
   - assigned_employee_id nullable: null = todos los empleados activos.
     El primero en marcar como hecha la cierra para el equipo.
============================================================================= */

-- ============================================================================
-- 1) Días de itinerario
-- ============================================================================

create table if not exists public.itinerary_days (
  id                        uuid        primary key default gen_random_uuid(),
  date                      date        not null unique,
  notes                     text,
  google_calendar_event_id  text,
  created_by                uuid        references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

drop trigger if exists tr_itinerary_days_updated_at on public.itinerary_days;
create trigger tr_itinerary_days_updated_at
  before update on public.itinerary_days
  for each row execute function public.set_updated_at();

create index if not exists ix_itinerary_days_date on public.itinerary_days(date);


-- ============================================================================
-- 2) Items del itinerario (piletas del día)
-- ============================================================================

create table if not exists public.itinerary_items (
  id                        uuid        primary key default gen_random_uuid(),
  itinerary_day_id          uuid        not null references public.itinerary_days(id) on delete cascade,
  pool_id                   uuid        not null references public.pools(id),
  sort_order                integer     not null default 0,
  -- null = todos los empleados; con valor = empleado específico (futuro)
  assigned_employee_id      uuid        references public.profiles(id),
  -- Estado
  status                    text        not null default 'pending',
  completed_by              uuid        references public.profiles(id),
  completed_at              timestamptz,
  -- Google Calendar
  google_calendar_event_id  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint ck_itinerary_items_status
    check (status in ('pending', 'done', 'skipped', 'no_client'))
);

drop trigger if exists tr_itinerary_items_updated_at on public.itinerary_items;
create trigger tr_itinerary_items_updated_at
  before update on public.itinerary_items
  for each row execute function public.set_updated_at();

create index if not exists ix_itinerary_items_day_id     on public.itinerary_items(itinerary_day_id);
create index if not exists ix_itinerary_items_pool_id    on public.itinerary_items(pool_id);
create index if not exists ix_itinerary_items_employee   on public.itinerary_items(assigned_employee_id);
create index if not exists ix_itinerary_items_status     on public.itinerary_items(status);


-- ============================================================================
-- 3) Registros de trabajo por pileta (service logs)
-- ============================================================================

create table if not exists public.service_logs (
  id                  uuid        primary key default gen_random_uuid(),
  itinerary_item_id   uuid        references public.itinerary_items(id),
  employee_id         uuid        not null references public.profiles(id),
  pool_id             uuid        not null references public.pools(id),
  client_id           uuid        not null references public.profiles(id),
  date                date        not null default current_date,
  -- Trabajo realizado
  cleaning_done       boolean     not null default false,   -- limpieza general
  vacuum_done         boolean     not null default false,   -- barrefondo
  painting_done       boolean     not null default false,   -- pintado
  -- Cloro aplicado (circuito separado del stock de venta)
  chlorine_applied    boolean     not null default false,
  chlorine_type       text,
  chlorine_amount_kg  numeric(6,2),
  -- Extras
  notes               text,
  photos              text[],
  created_at          timestamptz not null default now(),
  constraint ck_service_logs_chlorine_type
    check (chlorine_type in ('pastilla', 'granulado', 'liquido') or chlorine_type is null)
);

create index if not exists ix_service_logs_employee_id on public.service_logs(employee_id);
create index if not exists ix_service_logs_pool_id     on public.service_logs(pool_id);
create index if not exists ix_service_logs_client_id   on public.service_logs(client_id);
create index if not exists ix_service_logs_date        on public.service_logs(date);


-- ============================================================================
-- 4) Trigger: marcar itinerary_item como done al crear el service log
-- ============================================================================

create or replace function public.close_itinerary_item_on_log()
returns trigger language plpgsql as $$
begin
  if new.itinerary_item_id is not null then
    update public.itinerary_items
    set
      status       = 'done',
      completed_by = new.employee_id,
      completed_at = now()
    where id = new.itinerary_item_id
      and status = 'pending';   -- solo si aún está pendiente (el primero que la hace la cierra)
  end if;
  return new;
end;
$$;

drop trigger if exists tr_close_item_on_log on public.service_logs;
create trigger tr_close_item_on_log
  after insert on public.service_logs
  for each row execute function public.close_itinerary_item_on_log();
