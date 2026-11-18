/* =============================================================================
   CLORO Y PILETAS PANCHO — Textos del hero y Instagram de la landing
   Migración: 20261107000020

   La landing ya no tiene "Mi cuenta": es de propaganda y para pedir cloro o
   service por WhatsApp. Se vuelve al título "Tu pileta limpia. Vos, quedate
   pancho." y el Instagram del negocio es @piletaspancho.

   Igual que la 18: solo pisa filas que NADIE editó desde el CMS
   (updated_by is null). No toca el esquema. Idempotente.
============================================================================= */

insert into public.landing_content (section, key, value) values
  ('hero',   'headline',    '"Tu pileta limpia. Vos, quedate pancho."'),
  ('hero',   'subheadline', '"Mantenimiento · Cloro a domicilio con envío gratis en Zona Norte"'),
  ('hero',   'cta_text',    '"Pedí cloro"'),
  ('service','titulo',      '"Mantenimiento y recuperación de piletas."'),
  ('service','bajada',      '"Desde la limpieza de cada semana hasta recuperar una pileta verde."'),
  ('nosotros','titulo',    '"Tu pileta, en manos de Pancho."'),
  ('footer', 'instagram',   '"@piletaspancho"')
on conflict (section, key) do update
  set value = excluded.value,
      updated_at = now()
  where public.landing_content.updated_by is null;

insert into public.landing_content (section,key,value) values
  ('nosotros','cuerpo','"Hablás directo con él para pedir cloro o coordinar el service de tu pileta."'),
  ('config','delivery_days','"inmediata"')
on conflict (section,key) do update set value=excluded.value, updated_at=now() where public.landing_content.updated_by is null;
