/* =============================================================================
   CLORO Y PILETAS PANCHO — Pedidos por WhatsApp de la landing
   Migración: 20261107000021

   La landing registra cada toque a un botón de WhatsApp (qué botón, en qué
   sección y de dónde vino la visita: Instagram, directo, etc.) para que
   marketing y el dueño vean qué funciona. No guarda datos personales ni la
   consulta: solo el botón, la sección y el origen.

   - Cualquier visitante (anónimo) puede REGISTRAR; los largos están acotados.
   - Solo super_admin, owner y marketing pueden LEER. Nadie edita ni borra.
   Idempotente.
============================================================================= */

create table if not exists public.landing_clicks (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  boton      text not null check (char_length(boton) between 1 and 60),
  seccion    text not null check (char_length(seccion) between 1 and 30),
  origen     text not null default 'directo' check (char_length(origen) between 1 and 30)
);

create index if not exists ix_landing_clicks_created_at on public.landing_clicks (created_at desc);

alter table public.landing_clicks enable row level security;

drop policy if exists "landing_clicks: cualquiera registra" on public.landing_clicks;
create policy "landing_clicks: cualquiera registra"
  on public.landing_clicks for insert
  to anon, authenticated
  with check (char_length(boton) between 1 and 60 and char_length(seccion) between 1 and 30 and char_length(origen) between 1 and 30);

drop policy if exists "landing_clicks: equipo lee" on public.landing_clicks;
create policy "landing_clicks: equipo lee"
  on public.landing_clicks for select
  using (public.get_my_role() in ('super_admin', 'owner', 'marketing'));
