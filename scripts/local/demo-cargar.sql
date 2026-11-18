-- Datos de ejemplo SOLO para la base LOCAL (13 clientes N° 101-113 —el 113 solo compra cloro—, stock de cloro y ventas, itinerario del 2 al 13/11/2026, Palio = empleado, Kangoo = dueño).
-- Marca: client_profiles.notes = 'DEMO'. Se sacan con scripts/local/demo-quitar.sql. Necesita los autos "Palio" y "Kangoo".
-- Uso: docker exec -i supabase_db_pancho-test psql -U postgres -v ON_ERROR_STOP=1 -q < scripts/local/demo-cargar.sql
begin;
-- Los usuarios de prueba cambian de id cuando se recrean: se buscan por email
create temp table demo_ids on commit drop as
select (select id from auth.users where email = 'test-owner@piletaspancho.test') as owner_id,
       (select id from auth.users where email = 'test-employee@piletaspancho.test') as employee_id;
grant select on demo_ids to authenticated;
-- Los autos del ejemplo (los tests de la base pueden borrarlos)
insert into vehicles (name, plate, sort_order)
select v.name, v.plate, v.ord from (values ('Palio', 'AA122YA', 1), ('Kangoo', 'HHH555', 2)) v(name, plate, ord)
where not exists (select 1 from vehicles x where x.name = v.name);
create temp table demo_pools(n int, pool_id uuid) on commit drop;
grant all on demo_pools to authenticated;

-- 1) Clientes con su pileta, como el dueño
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from demo_ids), 'role', 'authenticated')::text, true);
insert into demo_pools
select n, (public.create_client_with_pool(nombre, 100+n, tel, 'DEMO', 'new', null, dir, barrio, null, tipo, null)->>'pool_id')::uuid
from (values
 (1,'Marta Gómez','11 4455-1201','Los Ceibos 120','San Isidro','fibra'),
 (2,'Jorge Pereyra','11 4455-1202','Av. Centenario 845','San Isidro','hormigon'),
 (3,'Familia Rossi','11 4455-1203','Belgrano 2310','Martínez','liner'),
 (4,'Laura Benítez','11 4455-1204','Alvear 56','Martínez','fibra'),
 (5,'Club El Ombú','11 4455-1205','Ruta 27 km 4','Tigre','hormigon'),
 (6,'Carlos Sosa','11 4455-1206','Liniers 1450','Tigre','fibra'),
 (7,'Ana Fernández','11 4455-1207','Paraná 3300','Olivos','liner'),
 (8,'Ricardo Díaz','11 4455-1208','Corrientes 777','Olivos','fibra'),
 (9,'Silvia Moreno','11 4455-1209','Santa Fe 1900','Acassuso','hormigon'),
 (10,'Pablo Romero','11 4455-1210','Pueyrredón 410','Beccar','fibra'),
 (11,'Inés Álvarez','11 4455-1211','Uruguay 2600','Beccar','otro'),
 (12,'Diego Herrera','11 4455-1212','Ituzaingó 98','San Fernando','fibra')
) v(n,nombre,tel,dir,barrio,tipo);
-- Cliente 113: solo compra cloro (su pileta queda dada de baja, así sus ventas van al segmento "cloro")
insert into demo_pools
select 13, (public.create_client_with_pool('Gustavo Ledesma', 113, '11 4455-1213', 'DEMO', 'new', null, 'Sarmiento 1500', 'Victoria', null, 'fibra', null)->>'pool_id')::uuid;
update pools set is_active = false where id = (select pool_id from demo_pools where n = 13);

-- 1b) Stock de cloro: presentaciones y otros productos (description = 'DEMO'), ingreso a granel, precio y aviso del depósito.
-- Va ANTES del itinerario: el cloro de los services de ejemplo sale de este depósito (movimiento 'service').
insert into products (name, description, chlorine_type, price_cents, stock_units, unit, chlorine_content, category, low_stock_alert, is_active)
values
 ('Bidón cloro líquido 5 L',  'DEMO', 'liquido',   800000,  0, 'litro',  5,    'cloro', null, true),
 ('Bidón cloro líquido 10 L', 'DEMO', 'liquido',   1500000, 0, 'litro',  10,   'cloro', null, true),
 ('Balde cloro granulado 10 kg', 'DEMO', 'granulado', 8000000, 0, 'kg',  10,   'cloro', null, true),
 ('Pastillas de cloro x50',   'DEMO', 'pastilla',  5500000, 0, 'unidad', 50,  'cloro', null, true),
 ('Alguicida 1 L',            'DEMO', 'otro',      450000,  12, 'litro', null, 'quimicos', 5, true),
 ('Barrefondo',               'DEMO', 'otro',      3500000, 2,  'unidad', null, 'accesorios', 3, true);
select public.ingresar_stock('liquido',   null, 400, 45000000, 'Química del Norte', 'DEMO');
select public.ingresar_stock('granulado', null, 120, 60000000, 'Química del Norte', 'DEMO');
select public.ingresar_stock('pastilla',  null, 600, 30000000, 'Distribuidora Tigre', 'DEMO');
select public.ingresar_stock(null, (select id from products where name = 'Bidón cloro líquido 5 L' and description = 'DEMO'), 10, 5000000, 'Química del Norte', 'DEMO');
select public.configurar_deposito('liquido',   150000, 50);
select public.configurar_deposito('granulado', 850000, 20);
select public.configurar_deposito('pastilla',  120000, 100);

-- 2) Itinerario: semana pasada (2 al 6), hoy (7) y la semana próxima (9 al 13). Palio = empleado, Kangoo = dueño.
create temp table demo_plan(fecha date, auto text, n int, orden int, tipo text) on commit drop;
grant all on demo_plan to authenticated;
insert into demo_plan
select d::date, auto, n, orden, case when n in (5,12) and auto='Kangoo' then 'desagote' else 'service' end
from generate_series('2026-11-02'::date, '2026-11-13'::date, '1 day') d
cross join lateral (values
  ('Palio',1,1),('Palio',2,2),('Palio',3,3),('Palio',4,4),('Palio',9,5),
  ('Kangoo',5,1),('Kangoo',6,2),('Kangoo',7,3),('Kangoo',8,4)
) r(auto,n,orden)
where extract(isodow from d) <= 5 or d::date = '2026-11-07';
-- los viernes también Beccar y San Fernando
insert into demo_plan select d, 'Palio', n, 5+n-9, 'service' from (values ('2026-11-06'::date),('2026-11-13'::date)) x(d), (values (10),(11)) y(n);
insert into demo_plan select d, 'Kangoo', 12, 5, 'desagote' from (values ('2026-11-06'::date),('2026-11-13'::date)) x(d);

insert into itinerary_days(date, created_by)
select distinct fecha, (select owner_id from demo_ids) from demo_plan
on conflict (date) do nothing;

insert into itinerary_day_crews(itinerary_day_id, vehicle_id, employee_id, created_by)
select d.id, v.id, case v.name when 'Palio' then (select employee_id from demo_ids) else (select owner_id from demo_ids) end, (select owner_id from demo_ids)
from itinerary_days d cross join vehicles v
where d.date in (select distinct fecha from demo_plan)
  and not exists (select 1 from itinerary_day_crews c where c.itinerary_day_id=d.id and c.vehicle_id=v.id);

insert into itinerary_items(itinerary_day_id, pool_id, sort_order, vehicle_id, service_type)
select d.id, p.pool_id, pl.orden + 10, v.id, pl.tipo
from demo_plan pl join itinerary_days d on d.date=pl.fecha join demo_pools p on p.n=pl.n join vehicles v on v.name=pl.auto;

-- 3) La semana pasada, como el empleado (Palio): registros con cloro, una salteada y una "no estaba"
reset role;
create temp table demo_items as
select i.id, i.pool_id, d.date, p.n, v.name auto
from itinerary_items i join itinerary_days d on d.id=i.itinerary_day_id join demo_pools p on p.pool_id=i.pool_id join vehicles v on v.id=i.vehicle_id
where d.date between '2026-11-02' and '2026-11-06';
grant all on demo_items to authenticated;
set local role authenticated;
-- Los carga el dueño a nombre del empleado: el empleado solo puede registrar los últimos 7 días y la semana del ejemplo ya pasó
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from demo_ids), 'role', 'authenticated')::text, true);
insert into service_logs(itinerary_item_id, employee_id, pool_id, client_id, chlorine_applied, chlorine_type, chlorine_amount, notes)
select di.id, (select employee_id from demo_ids), di.pool_id, pl.client_id, true,
  (array['liquido','granulado','pastilla'])[1 + (di.n % 3)],
  case (di.n % 3) when 0 then 5 + di.n when 1 then 500 + 50*di.n else 1.5 + (di.n % 2) end,
  case when di.n = 3 and di.date = '2026-11-04' then 'Agua un poco verde, volver a revisar' end
from demo_items di join pools pl on pl.id = di.pool_id
where di.auto = 'Palio' and not (di.n = 2 and di.date = '2026-11-03') and not (di.n = 4 and di.date = '2026-11-05');
update itinerary_items set status = 'skipped' where id in (select id from demo_items where n=2 and date='2026-11-03');
update itinerary_items set status = 'no_client' where id in (select id from demo_items where n=4 and date='2026-11-05');

-- 4) La Kangoo de la semana pasada la registra el dueño
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from demo_ids), 'role', 'authenticated')::text, true);
insert into service_logs(itinerary_item_id, employee_id, pool_id, client_id, chlorine_applied, chlorine_type, chlorine_amount)
select di.id, (select owner_id from demo_ids), di.pool_id, pl.client_id, di.n <> 12, case when di.n <> 12 then 'liquido' end, case when di.n <> 12 then 8 end
from demo_items di join pools pl on pl.id = di.pool_id
where di.auto = 'Kangoo' and di.date < '2026-11-06';
reset role;
-- Ejemplo de encargado: Belgrano 2310 (Palio, el 7/11) le toca al dueño
update itinerary_items i set assigned_employee_id = (select owner_id from demo_ids)
from itinerary_days d, pools p
where d.id = i.itinerary_day_id and p.id = i.pool_id and d.date = '2026-11-07' and p.address = 'Belgrano 2310';

-- 5) Precios INVENTADOS (hasta tener la planilla real de Pancho) y algunos cobros, como el dueño
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from demo_ids), 'role', 'authenticated')::text, true);
insert into client_prices (client_id, kind, price_cents, valid_from)
select pl.client_id, k.kind, k.base + 50000 * (dp.n % 4), '2026-10-01'
from demo_pools dp join pools pl on pl.id = dp.pool_id
cross join (values ('service', 2500000), ('desagote', 6000000), ('cloro_liquido', 180000), ('cloro_granulado', 900000), ('cloro_pastilla', 150000)) k(kind, base)
where dp.n <> 12; -- el 112 queda sin precios, para ver el aviso
-- Un aumento del service desde el 1/11 para el 101
insert into client_prices (client_id, kind, price_cents, valid_from)
select pl.client_id, 'service', 2800000, '2026-11-01' from demo_pools dp join pools pl on pl.id = dp.pool_id where dp.n = 1;
-- Pagos directos al dueño
insert into payments (client_id, amount_cents, paid_at, status, notes)
select pl.client_id, v.monto, v.dia::date, 'recibido', v.nota
from (values (1, 5000000, '2026-11-05', 'Transferencia'), (3, 2500000, '2026-11-04', null), (5, 20000000, '2026-11-06', 'Pagó el mes')) v(n, monto, dia, nota)
join demo_pools dp on dp.n = v.n join pools pl on pl.id = dp.pool_id;
-- Cobros del empleado que todavía no le entregó al dueño (los anota la base como del empleado; acá, directo)
reset role;
insert into payments (client_id, amount_cents, paid_at, itinerary_item_id, received_by, status)
select pl.client_id, 2500000, di.date, di.id, (select employee_id from demo_ids), 'con_empleado'
from demo_items di join pools pl on pl.id = di.pool_id
where di.auto = 'Palio' and di.date = '2026-11-06' and di.n in (2, 6);

-- 6) Ventas de ejemplo (notes = 'DEMO'), como el dueño: una por segmento (mostrador, service, solo cloro)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from demo_ids), 'role', 'authenticated')::text, true);
-- Mostrador a granel: 20 L con nombre del comprador
select public.crear_venta_manual(null, 'DEMO', '2026-11-03 11:00-03',
  '[{"product_name":"Cloro líquido a granel","quantity":20,"unit_price_cents":150000,"chlorine_type":"liquido"}]'::jsonb, 'Vecino de la esquina');
-- Cliente de service (101): 2 bidones de 5 L
select public.crear_venta_manual((select pl.client_id from demo_pools dp join pools pl on pl.id = dp.pool_id where dp.n = 1), 'DEMO', '2026-11-05 17:30-03',
  jsonb_build_array(jsonb_build_object('product_id', (select id from products where name = 'Bidón cloro líquido 5 L' and description = 'DEMO'),
    'product_name', 'Bidón cloro líquido 5 L', 'quantity', 2, 'unit_price_cents', 800000)));
-- Cliente solo de cloro (113): 5 kg de granulado a granel + un alguicida
select public.crear_venta_manual((select pl.client_id from demo_pools dp join pools pl on pl.id = dp.pool_id where dp.n = 13), 'DEMO', '2026-11-09 10:15-03',
  jsonb_build_array(
    jsonb_build_object('product_name', 'Cloro granulado a granel', 'quantity', 5, 'unit_price_cents', 850000, 'chlorine_type', 'granulado'),
    jsonb_build_object('product_id', (select id from products where name = 'Alguicida 1 L' and description = 'DEMO'),
      'product_name', 'Alguicida 1 L', 'quantity', 1, 'unit_price_cents', 450000)));
-- Mostrador sin nombre: pastillas x50 + un barrefondo (queda 1: stock bajo)
select public.crear_venta_manual(null, 'DEMO', '2026-11-10 12:00-03',
  jsonb_build_array(
    jsonb_build_object('product_id', (select id from products where name = 'Pastillas de cloro x50' and description = 'DEMO'),
      'product_name', 'Pastillas de cloro x50', 'quantity', 1, 'unit_price_cents', 5500000),
    jsonb_build_object('product_id', (select id from products where name = 'Barrefondo' and description = 'DEMO'),
      'product_name', 'Barrefondo', 'quantity', 1, 'unit_price_cents', 3500000)));
reset role;
commit;
