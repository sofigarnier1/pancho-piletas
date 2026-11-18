/*
  Migración 33 — Frecuencia de visita y ubicación de cada pileta (roadmap de Pancho, etapa 6)

  Para que el asistente del itinerario (sin IA: por reglas) sepa cuándo le toca a cada pileta y cuáles
  quedan cerca entre sí:

  1. pools.frequency: semanal (por defecto), quincenal o mensual.
  2. pools.lat / pools.lng ya existen (migración 2). Se suma pools.located_at (cuándo se ubicó) y
     pools.location_source: 'auto' (se buscó la dirección en OpenStreetMap/Nominatim) o 'manual' (el
     dueño pegó las coordenadas o un link del mapa). Las coordenadas tienen que caer en un rango válido.
  3. Lo escribe el dueño, como el resto de la pileta (las políticas de pools no cambian).
*/

alter table public.pools add column if not exists frequency text not null default 'semanal';
alter table public.pools drop constraint if exists ck_pools_frequency;
alter table public.pools add constraint ck_pools_frequency check (frequency in ('semanal', 'quincenal', 'mensual'));
comment on column public.pools.frequency is 'Cada cuánto se visita: semanal, quincenal o mensual. Lo usa la sugerencia del itinerario.';

alter table public.pools add column if not exists located_at timestamptz;
alter table public.pools add column if not exists location_source text;
alter table public.pools drop constraint if exists ck_pools_location_source;
alter table public.pools add constraint ck_pools_location_source check (location_source is null or location_source in ('auto', 'manual'));

alter table public.pools drop constraint if exists ck_pools_lat_lng;
alter table public.pools add constraint ck_pools_lat_lng check (
  (lat is null and lng is null)
  or (lat between -90 and 90 and lng between -180 and 180)
) not valid;
