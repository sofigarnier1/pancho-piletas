/* =============================================================================
   CLORO Y PILETAS PANCHO — Textos de la landing con el diseño V3
   Migración: 20261026000018

   La landing pasó al diseño V3 (cloro + service + Mi cuenta). Los textos del
   hero y de "Nosotros" que cargó la migración 12 eran los de la landing
   anterior, solo de cloro; además se suma la sección "service" al CMS.

   Igual que la 12: solo pisa filas que NADIE editó desde el CMS
   (updated_by is null). Si marketing ya cambió un texto, se respeta.
   No toca el esquema. Idempotente.
============================================================================= */

insert into public.landing_content (section, key, value) values
  ('hero',     'headline',    '"Tu pileta lista. Tu tiempo para vos."'),
  ('hero',     'subheadline', '"Cloro, mantenimiento y un lugar para consultar tus compras y visitas registradas. El cuidado de tu pileta, con Pancho en Zona Norte."'),
  ('nosotros', 'titulo',      '"Atención directa. Cuidado de verdad."'),
  ('nosotros', 'cuerpo',      '"Nos contás cómo está tu pileta. Te orientamos, coordinamos y te dejamos indicaciones claras. Sin intermediarios."'),
  ('service',  'titulo',      '"Vos hacé planes. Nosotros, el mantenimiento."'),
  ('service',  'bajada',      '"Desde el cuidado de cada semana hasta una puesta a punto. Elegí qué necesitás y conocé cómo podemos ayudarte."'),
  ('service',  'exclusiones', '"No realizamos arreglos de pérdidas ni instalación de piletas de plástico."')
on conflict (section, key) do update
  set value = excluded.value,
      updated_at = now()
  where public.landing_content.updated_by is null;
