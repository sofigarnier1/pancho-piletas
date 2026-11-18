/* =============================================================================
   CLORO Y PILETAS PANCHO — Sincronizar el copy del hero y Nosotros con el CMS
   Migración: 20261001000012

   El rediseño de la landing (enfocada en cloro en pastillas) dejó el texto del
   hero y de "Nosotros" escrito en el código, y la semilla original del CMS
   (20260502000008) guarda textos viejos ("Cloro y mantenimiento de piletas...").
   Ahora la landing lee esos valores del CMS, así que hay que alinearlos.

   Solo pisa filas que NADIE editó desde el CMS (updated_by is null): si marketing
   ya cambió un texto, se respeta. Idempotente.
============================================================================= */

insert into public.landing_content (section, key, value) values
  ('hero',     'headline',    '"Agua clara, con la cantidad justa"'),
  ('hero',     'subheadline', '"Cloro en pastillas con orientación según tu pileta y entrega coordinada en Zona Norte."'),
  ('hero',     'cta_text',    '"Pedir cloro por WhatsApp"'),
  ('nosotros', 'titulo',      '"Atención directa, sin intermediarios"'),
  ('nosotros', 'cuerpo',      '"Hablás con Pancho para resolver qué comprar y coordinar la entrega en Zona Norte."')
on conflict (section, key) do update
  set value = excluded.value,
      updated_at = now()
  where public.landing_content.updated_by is null;
