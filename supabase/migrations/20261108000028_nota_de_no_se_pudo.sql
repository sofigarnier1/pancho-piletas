/*
  Migración 28 — Nota cuando una visita "no se pudo"

  Desde la pantalla nueva del empleado (2026-11-07), al marcar una pileta como "No estaba el cliente"
  o "Saltear por hoy" se puede dejar una nota con el motivo ("portón cerrado", "llovía"...).
  La nota es de la visita (itinerary_items.status_note), no de un registro de service: una visita
  que no se pudo no tiene registro.

  Reglas:
  1. Hasta 500 caracteres.
  2. Solo tiene sentido mientras la visita está salteada o "no estaba": si vuelve a pendiente o se
     da por hecha (al registrar el service), la base la borra sola.
  3. El empleado la puede escribir porque es parte de marcar el estado (el guard de la migración 22
     no la bloquea); el resto de las columnas sigue protegido como antes.
*/

alter table public.itinerary_items add column if not exists status_note text;

alter table public.itinerary_items drop constraint if exists ck_itinerary_items_status_note;
alter table public.itinerary_items
  add constraint ck_itinerary_items_status_note check (status_note is null or char_length(status_note) <= 500);

comment on column public.itinerary_items.status_note is
  'Motivo cuando la visita no se pudo (salteada o "no estaba"). La base la borra si la visita vuelve a pendiente o queda hecha.';

-- La nota vive solo mientras la visita está salteada o "no estaba"
create or replace function public.clear_item_status_note()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('skipped', 'no_client') then
    new.status_note := null;
  elsif new.status_note is not null then
    new.status_note := nullif(btrim(new.status_note), '');
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_item_status_note() from public, anon, authenticated;

drop trigger if exists tr_clear_item_status_note on public.itinerary_items;
create trigger tr_clear_item_status_note
  before insert or update on public.itinerary_items
  for each row execute function public.clear_item_status_note();
