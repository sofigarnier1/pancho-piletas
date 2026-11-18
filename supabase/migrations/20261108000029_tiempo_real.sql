/*
  Migración 29 — Tiempo real para el dueño y el equipo

  Las pantallas del dueño (Dashboard, día del itinerario, visita, Services) y la ruta del empleado se
  actualizan solas cuando alguien marca o registra una pileta. Usan Supabase Realtime ("postgres_changes"),
  que manda los cambios de estas tablas a quien los está mirando.

  Seguridad: Realtime respeta las políticas (RLS) de cada tabla con la sesión de quien mira: el empleado
  solo recibe los cambios de las visitas y registros que ya puede ver; el cliente y la persona sin sesión,
  nada. De un borrado solo se manda el id de la fila (sin datos).
*/

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'itinerary_items'
  ) then
    alter publication supabase_realtime add table public.itinerary_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_logs'
  ) then
    alter publication supabase_realtime add table public.service_logs;
  end if;
end;
$$;
