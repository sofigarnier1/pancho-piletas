-- Saca los datos de ejemplo (marca client_profiles.notes = 'DEMO') de la base LOCAL
begin;
create temp table dclients as select id from client_profiles where notes = 'DEMO';
create temp table dpools as select id from pools where client_id in (select id from dclients);
delete from manual_sale_items where manual_sale_id in (select id from manual_sales where notes = 'DEMO');
delete from manual_sales where notes = 'DEMO';
delete from payments where client_id in (select id from dclients);
delete from client_prices where client_id in (select id from dclients);
delete from service_logs where pool_id in (select id from dpools);
delete from itinerary_items where pool_id in (select id from dpools);
delete from itinerary_day_crews c using itinerary_days d where d.id = c.itinerary_day_id and d.date between '2026-11-02' and '2026-11-13';
delete from pool_clients where pool_id in (select id from dpools) or client_id in (select id from dclients);
delete from pools where id in (select id from dpools);
delete from client_profiles where id in (select id from dclients);
delete from profiles where id in (select id from dclients);
delete from itinerary_days d where d.date between '2026-11-02' and '2026-11-13'
  and not exists (select 1 from itinerary_items i where i.itinerary_day_id = d.id)
  and not exists (select 1 from itinerary_day_crews c where c.itinerary_day_id = d.id);
delete from products where description = 'DEMO';
-- Depósito: en la base LOCAL todo el stock de cloro es del ejemplo, así que se vacía entero
-- (borrar los services y ventas de arriba deja movimientos de corrección que tampoco sirven).
delete from stock_movements;
update chlorine_stock set quantity = 0, bulk_price_cents = null, low_alert = null;
commit;
