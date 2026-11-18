/* =============================================================================
   CLORO Y PILETAS PANCHO — updated_at automático en landing_content
   Migración: 20261002000013

   landing_content tenía la columna updated_at pero, a diferencia de las demás tablas,
   ningún trigger la mantenía: solo la actualizaba a mano la acción del CMS, así que un
   cambio hecho desde cualquier otro lado (SQL, otra acción) dejaba la fecha vieja.
   Idempotente.
============================================================================= */

drop trigger if exists tr_landing_content_updated_at on public.landing_content;
create trigger tr_landing_content_updated_at
  before update on public.landing_content
  for each row execute function public.set_updated_at();
