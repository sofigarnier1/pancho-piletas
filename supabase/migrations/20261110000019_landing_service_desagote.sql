/* =============================================================================
   CLORO Y PILETAS PANCHO — Textos del service y "equipo" (reunión 10/11/2026)
   Migración: 20261110000019

   Pancho pidió: dos servicios (mantenimiento y desagote), frecuencia semanal o
   quincenal, la aclaración "No hacemos arreglos de pérdidas ni instalación de
   piletas" (sin "de plástico") y que se note que trabaja con un equipo.

   - Título y bajada del service: solo si nadie los editó desde el CMS.
   - Aclaración: se cambia si todavía dice "de plástico", aunque la hayan editado.
   - "Nosotros": solo si sigue con uno de los textos viejos conocidos.
   No toca el esquema. Idempotente.
============================================================================= */

update public.landing_content
   set value = '"Mantenimiento y desagote de piletas."', updated_at = now()
 where section = 'service' and key = 'titulo' and updated_by is null;

update public.landing_content
   set value = '"Nuestro equipo cuida tu pileta cada semana o cada quince días. Y si hace falta, la vaciamos y la dejamos limpia para empezar de nuevo."', updated_at = now()
 where section = 'service' and key = 'bajada' and updated_by is null;

update public.landing_content
   set value = '"No hacemos arreglos de pérdidas ni instalación de piletas."', updated_at = now()
 where section = 'service' and key = 'exclusiones' and value::text ilike '%plástico%';

update public.landing_content
   set value = '"Pancho y su equipo te atienden directo para pedir cloro o coordinar el service de tu pileta."', updated_at = now()
 where section = 'nosotros' and key = 'cuerpo'
   and value in ('"Hablás directo con él para pedir cloro o coordinar el service de tu pileta."'::jsonb,
                 '"Nos contás cómo está tu pileta. Te orientamos, coordinamos y te dejamos indicaciones claras. Sin intermediarios."'::jsonb);
