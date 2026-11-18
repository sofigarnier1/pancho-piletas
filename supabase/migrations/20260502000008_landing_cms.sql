/* =============================================================================
   CLORO Y PILETAS PANCHO — CMS de landing
   Migración: 20260502000008

   Almacena el contenido dinámico de la landing page.
   El rol 'marketing' lo edita desde el backoffice.
   La landing lo lee públicamente (sin auth).
============================================================================= */

create table if not exists public.landing_content (
  id          uuid        primary key default gen_random_uuid(),
  section     text        not null,  -- hero, footer, nosotros, config
  key         text        not null,  -- headline, subheadline, cta_text, ...
  value       jsonb       not null default '{}',
  updated_by  uuid        references public.profiles(id),
  updated_at  timestamptz not null default now(),
  unique (section, key)
);

create index if not exists ix_landing_content_section on public.landing_content(section);


-- ============================================================================
-- Seed: valores por defecto
-- ============================================================================

insert into public.landing_content (section, key, value) values
  -- Hero
  ('hero', 'headline',    '"Cloro y mantenimiento de piletas en Zona Norte"'),
  ('hero', 'subheadline', '"Delivery sin cargo. Servicio profesional."'),
  ('hero', 'cta_text',    '"Pedí tu cloro"'),
  -- Servicios (cards)
  ('servicios', 'limpieza_titulo',   '"Limpieza de pileta"'),
  ('servicios', 'limpieza_desc',     '"Limpieza general, retiro de hojas y barrefondo."'),
  ('servicios', 'desagote_titulo',   '"Desagote"'),
  ('servicios', 'desagote_desc',     '"Vaciado y limpieza profunda de la pileta."'),
  ('servicios', 'pintado_titulo',    '"Pintado de pileta"'),
  ('servicios', 'pintado_desc',      '"Renovamos el aspecto de tu pileta con pintura profesional."'),
  -- Nosotros
  ('nosotros', 'titulo',  '"¿Quiénes somos?"'),
  ('nosotros', 'cuerpo',  '"Somos Pancho y equipo. Años de experiencia en el cuidado de piletas en Zona Norte, Buenos Aires."'),
  -- Footer / Contacto
  ('footer', 'coverage_text', '"Zona Norte, Buenos Aires"'),
  ('footer', 'phone',         '"+54 9 11 5110-3245"'),
  ('footer', 'instagram',     '"@cloroypiletas.pancho"'),
  -- Config global
  ('config', 'wa_number',           '"5491100000000"'),
  ('config', 'shipping_cost_cents', '0'),
  ('config', 'delivery_days',       '"2-3 días hábiles"')
on conflict (section, key) do nothing;
