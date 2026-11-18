/*
  Migración 35 — Reportes de error de la app

  Cuando algo falla en la pantalla de alguien (una pantalla que se rompe, un error del navegador),
  la app anota el error acá y le muestra un cartel con un código corto y un botón para avisar por
  WhatsApp. Después se consulta esta tabla para ver qué falló.

  - code: código corto que ve la persona y viaja en el mensaje de WhatsApp (lo genera la app).
  - Se guarda lo técnico (mensaje, detalle, pantalla, navegador), nunca contraseñas ni datos de
    clientes: la app recorta y no manda formularios.
  - Escribe cualquiera (incluso sin sesión: un error en el login también importa), pero solo
    entra una fila por vez y con largos acotados. Quién la escribió (user_id y rol) lo pone la base,
    no la app: no se puede falsear.
  - Leen y marcan como resuelto solo owner y super_admin.
*/

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  user_role text,
  source text not null default 'pantalla',
  path text,
  message text not null,
  details text,
  digest text,
  user_agent text,
  resolved_at timestamptz,
  constraint ck_error_reports_source check (source in ('pantalla', 'navegador', 'promesa')),
  constraint ck_error_reports_code check (code ~ '^[A-Z0-9]{4,12}$'),
  constraint ck_error_reports_largos check (
    char_length(message) between 1 and 1000
    and (details is null or char_length(details) <= 6000)
    and (path is null or char_length(path) <= 300)
    and (digest is null or char_length(digest) <= 100)
    and (user_agent is null or char_length(user_agent) <= 300)
  )
);

comment on table public.error_reports is 'Errores que vio una persona en la app. Los escribe la app sola; los lee el dueño o el súper admin.';
comment on column public.error_reports.code is 'Código corto que ve la persona y viaja en el mensaje de WhatsApp.';

create index if not exists idx_error_reports_created on public.error_reports (created_at desc);

-- Quién lo escribió lo pone la base: la app no puede mentir sobre el usuario ni el rol.
create or replace function public.error_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  new.user_role := case when auth.uid() is null then null else public.get_my_role()::text end;
  new.created_at := now();
  new.resolved_at := null;
  return new;
end;
$$;

drop trigger if exists trg_error_reports_before_insert on public.error_reports;
create trigger trg_error_reports_before_insert
  before insert on public.error_reports
  for each row execute function public.error_reports_before_insert();

alter table public.error_reports enable row level security;

drop policy if exists "error_reports: cualquiera anota" on public.error_reports;
create policy "error_reports: cualquiera anota"
  on public.error_reports for insert
  to anon, authenticated
  with check (char_length(message) between 1 and 1000 and char_length(code) between 4 and 12);

drop policy if exists "error_reports: owner lee" on public.error_reports;
create policy "error_reports: owner lee"
  on public.error_reports for select
  to authenticated
  using (public.is_owner_or_above());

drop policy if exists "error_reports: owner marca resuelto" on public.error_reports;
create policy "error_reports: owner marca resuelto"
  on public.error_reports for update
  to authenticated
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "error_reports: owner borra" on public.error_reports;
create policy "error_reports: owner borra"
  on public.error_reports for delete
  to authenticated
  using (public.is_owner_or_above());

drop policy if exists "blocked denied" on public.error_reports;
create policy "blocked denied" on public.error_reports as restrictive for all
  using (not (select public.is_blocked()));

revoke all on public.error_reports from anon, authenticated;
grant insert on public.error_reports to anon, authenticated;
grant select, update, delete on public.error_reports to authenticated;
