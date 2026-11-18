/*
  Migración 27 — Notas del mes por pileta (pantalla Services)

  El dueño anota lo que quiera de cada pileta para un mes ("cobrar", "cambiar el filtro", "pidió desagote"...)
  directamente en el control de services. Una nota por pileta y por mes; se ve en la planilla de Services y en la de
  Desagotes, y sale en el Excel. Acordado el 2026-11-07.

  - month: siempre el día 1 del mes (la base lo exige).
  - notes: de 1 a 2000 caracteres (una nota vacía se borra desde la aplicación).
  - updated_by lo fija la base; updated_at, el trigger de siempre (set_updated_at).
  - Una cuenta bloqueada no la ve ni la toca (política restrictiva "blocked denied", como toda tabla privada).
  - Solo el dueño y el súper admin la ven y la escriben (Services es solo de ellos). Ni marketing, ni empleados, ni
    clientes.
*/

create table if not exists public.pool_month_notes (
  id         uuid primary key default gen_random_uuid(),
  pool_id    uuid not null references public.pools (id) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  notes      text not null check (char_length(btrim(notes)) between 1 and 2000),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, month)
);

comment on table public.pool_month_notes is
  'Notas del dueño por pileta y por mes (pantalla Services). Una por pileta y mes.';

create index if not exists pool_month_notes_month_idx on public.pool_month_notes (month);

-- Quién la escribió: lo fija la base, no lo que mande la aplicación
create or replace function public.stamp_pool_month_note()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists tr_stamp_pool_month_note on public.pool_month_notes;
create trigger tr_stamp_pool_month_note
  before insert or update on public.pool_month_notes
  for each row execute function public.stamp_pool_month_note();

drop trigger if exists tr_pool_month_notes_updated_at on public.pool_month_notes;
create trigger tr_pool_month_notes_updated_at
  before update on public.pool_month_notes
  for each row execute function public.set_updated_at();

alter table public.pool_month_notes enable row level security;

drop policy if exists "pool_month_notes: owner manages" on public.pool_month_notes;
create policy "pool_month_notes: owner manages"
  on public.pool_month_notes for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "blocked denied" on public.pool_month_notes;
create policy "blocked denied" on public.pool_month_notes as restrictive for all using (not (select public.is_blocked()));

revoke all on public.pool_month_notes from anon;
grant select, insert, update, delete on public.pool_month_notes to authenticated;
