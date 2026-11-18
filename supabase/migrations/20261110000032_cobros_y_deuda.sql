/*
  Migración 32 — Cobros y deuda por cliente (roadmap de Pancho, etapa 5)

  Pancho pasa horas a fin de mes calculando cuánto le debe cada cliente. Desde ahora la deuda es un saldo
  corrido por cliente, que se calcula solo:

      lo hecho (cada visita hecha × el precio de ese cliente y tipo que regía ese día
                + el cloro registrado × su precio por litro / kilo / pastilla)
      − lo pagado

  1. payments: cada pago de un cliente.
     - El EMPLEADO anota solo el monto que le dieron, desde una visita suya de los últimos 7 días ("Cobré").
       La base pone el cliente (el titular de la pileta), la fecha (la de la visita), quién cobró y el estado
       "con_empleado" (la plata la tiene él). Para el cliente ya cuenta como pagado. No ve precios ni deuda:
       solo lee los pagos que anotó él, y puede borrar los suyos mientras sigan "con_empleado".
     - El DUEÑO confirma cuando el empleado le entrega la plata (pasa a "recibido": la base pone quién y cuándo),
       o carga un pago directo (ya "recibido"). Puede corregir monto, fecha y nota, y borrar.
     - Entre $0,01 y $100.000.000. Nota hasta 500 caracteres. request_id evita duplicar un doble toque.
     - Marketing y el cliente no ven nada.
  2. movimientos_cuenta(cliente | null, hasta): cada cargo (visita, cloro) y cada pago, con su precio.
     Si falta el precio, el cargo va en 0 y sin_precio = true (la pantalla avisa).
  3. deuda_clientes(hasta): el saldo de cada cliente con movimientos, y cuánto de lo pagado lo tiene un empleado.
  Las dos funciones son solo para owner y super_admin (security invoker: RLS sigue valiendo).
*/

create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.profiles(id) on delete restrict,
  amount_cents      bigint not null,
  paid_at           date not null default public.today_ar(),
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  received_by       uuid references public.profiles(id) on delete set null,
  status            text not null default 'recibido',
  confirmed_by      uuid references public.profiles(id) on delete set null,
  confirmed_at      timestamptz,
  notes             text,
  request_id        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint ck_payments_amount check (amount_cents > 0 and amount_cents <= 10000000000),
  constraint ck_payments_status check (status in ('con_empleado', 'recibido')),
  constraint ck_payments_notes check (notes is null or char_length(notes) <= 500),
  constraint ck_payments_paid_at check (paid_at >= date '2000-01-01' and paid_at <= date '2100-12-31')
);

comment on table public.payments is
  'Pagos de clientes. con_empleado = lo cobró un empleado y todavía no se lo entregó al dueño; recibido = lo tiene el dueño. Para la deuda, los dos cuentan como pagado.';

create unique index if not exists ux_payments_request_id on public.payments (request_id) where request_id is not null;
create index if not exists ix_payments_client on public.payments (client_id, paid_at);
create index if not exists ix_payments_pending on public.payments (received_by) where status = 'con_empleado';
create index if not exists ix_payments_item on public.payments (itinerary_item_id) where itinerary_item_id is not null;

alter table public.payments enable row level security;

drop policy if exists "payments: owner all" on public.payments;
create policy "payments: owner all"
  on public.payments for all
  using (public.is_owner_or_above())
  with check (public.is_owner_or_above());

drop policy if exists "payments: employee read own" on public.payments;
create policy "payments: employee read own"
  on public.payments for select
  using (public.get_my_role() = 'employee' and received_by = auth.uid());

drop policy if exists "payments: employee insert own" on public.payments;
create policy "payments: employee insert own"
  on public.payments for insert
  with check (
    public.get_my_role() = 'employee'
    and received_by = auth.uid()
    and status = 'con_empleado'
    and itinerary_item_id is not null
  );

drop policy if exists "payments: employee delete own pending" on public.payments;
create policy "payments: employee delete own pending"
  on public.payments for delete
  using (
    public.get_my_role() = 'employee'
    and received_by = auth.uid()
    and status = 'con_empleado'
    and created_at > now() - interval '7 days'
  );

drop policy if exists "blocked denied" on public.payments;
create policy "blocked denied" on public.payments as restrictive for all using (not (select public.is_blocked()));

revoke all on public.payments from anon;
grant select, insert, update, delete on public.payments to authenticated;

create or replace function public.guard_payment_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_date date;
  v_client uuid;
  v_vehicle uuid;
  v_assigned uuid;
  v_day uuid;
begin
  -- Procesos del sistema (service role, seed): sin reglas
  if auth.uid() is null then
    return new;
  end if;
  v_role := public.get_my_role();

  if tg_op = 'UPDATE' then
    if new.client_id is distinct from old.client_id
       or new.itinerary_item_id is distinct from old.itinerary_item_id
       or new.received_by is distinct from old.received_by
       or new.request_id is distinct from old.request_id
       or new.created_at is distinct from old.created_at then
      raise exception 'El cliente, la visita y quién cobró un pago no se cambian' using errcode = '42501';
    end if;
    if old.status = 'recibido' and new.status = 'con_empleado' then
      raise exception 'Un pago recibido no vuelve a quedar en mano del empleado' using errcode = '42501';
    end if;
    if old.status = 'con_empleado' and new.status = 'recibido' then
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    else
      new.confirmed_by := old.confirmed_by;
      new.confirmed_at := old.confirmed_at;
    end if;
    new.notes := nullif(btrim(new.notes), '');
    return new;
  end if;

  -- INSERT
  new.received_by := auth.uid();
  new.created_at := now();
  new.notes := nullif(btrim(new.notes), '');

  if v_role = 'employee' then
    if new.itinerary_item_id is null then
      raise exception 'El cobro se anota desde la visita' using errcode = '42501';
    end if;
    select d.date, p.client_id, i.vehicle_id, i.assigned_employee_id, i.itinerary_day_id
      into v_date, v_client, v_vehicle, v_assigned, v_day
      from public.itinerary_items i
      join public.itinerary_days d on d.id = i.itinerary_day_id
      join public.pools p on p.id = i.pool_id
     where i.id = new.itinerary_item_id;
    if v_date is null or not public.employee_can_see_item(v_day, v_vehicle, v_assigned) then
      raise exception 'Esa visita no está en tu día' using errcode = '42501';
    end if;
    if v_date < public.today_ar() - 7 or v_date > public.today_ar() then
      raise exception 'Solo se anotan cobros de visitas de los últimos 7 días' using errcode = 'PA002';
    end if;
    -- Lo que mande la pantalla no importa: el cliente es el titular de la pileta y la fecha, la de la visita
    new.client_id := v_client;
    new.paid_at := v_date;
    new.status := 'con_empleado';
    new.confirmed_by := null;
    new.confirmed_at := null;
  else
    if new.status = 'recibido' then
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    else
      new.confirmed_by := null;
      new.confirmed_at := null;
    end if;
  end if;

  if not exists (select 1 from public.profiles where id = new.client_id and role = 'client') then
    raise exception 'Los pagos son solo de clientes' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_payment_write() from public, anon, authenticated;

drop trigger if exists tr_guard_payment_write on public.payments;
create trigger tr_guard_payment_write
  before insert or update on public.payments
  for each row execute function public.guard_payment_write();

drop trigger if exists tr_payments_updated_at on public.payments;
create trigger tr_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- 2. Cada cargo y cada pago de la cuenta de un cliente (o de todos, con p_client null), hasta una fecha
create or replace function public.movimientos_cuenta(p_client uuid, p_hasta date)
returns table (
  client_id    uuid,
  fecha        date,
  tipo         text,     -- service | desagote | cloro_liquido | cloro_granulado | cloro_pastilla | pago
  detalle      text,
  cantidad     numeric,  -- visitas: 1; cloro: litros, kilos o pastillas; pago: null
  precio_cents bigint,   -- precio por unidad que regía ese día (null = sin precio)
  cargo_cents  bigint,
  pago_cents   bigint,
  sin_precio   boolean,
  ref_id       uuid,     -- la visita, el registro de service o el pago
  estado       text      -- pagos: con_empleado | recibido
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_hasta is null then
    raise exception 'Falta la fecha' using errcode = '22023';
  end if;
  if not public.is_owner_or_above() then
    raise exception 'Solo el dueño puede ver las cuentas de los clientes' using errcode = '42501';
  end if;

  return query
  with visitas as (
    select p.client_id as cid, d.date as f, i.service_type as t, i.id as ref,
           coalesce(nullif(p.nickname, ''), nullif(p.address, ''), 'Pileta') as det,
           public.precio_vigente(p.client_id, i.service_type, d.date) as precio
      from public.itinerary_items i
      join public.itinerary_days d on d.id = i.itinerary_day_id
      join public.pools p on p.id = i.pool_id
     where i.status = 'done' and d.date <= p_hasta and p.client_id is not null
       and (p_client is null or p.client_id = p_client)
  ),
  cloro as (
    select l.client_id as cid, l.date as f, 'cloro_' || l.chlorine_type as t, l.id as ref,
           case when l.chlorine_type = 'granulado' then l.chlorine_amount / 1000 else l.chlorine_amount end as cant,
           public.precio_vigente(l.client_id, 'cloro_' || l.chlorine_type, l.date) as precio
      from public.service_logs l
     where l.chlorine_type in ('liquido', 'granulado', 'pastilla') and l.chlorine_amount > 0 and l.date <= p_hasta
       and (p_client is null or l.client_id = p_client)
  )
  select v.cid, v.f, v.t, v.det, 1::numeric, v.precio, coalesce(v.precio, 0), 0::bigint, v.precio is null, v.ref, null::text
    from visitas v
  union all
  select c.cid, c.f, c.t, null::text, c.cant, c.precio, coalesce(round(c.cant * c.precio)::bigint, 0), 0::bigint, c.precio is null, c.ref, null::text
    from cloro c
  union all
  select pa.client_id, pa.paid_at, 'pago', pa.notes, null::numeric, null::bigint, 0::bigint, pa.amount_cents, false, pa.id, pa.status
    from public.payments pa
   where pa.paid_at <= p_hasta and (p_client is null or pa.client_id = p_client)
  order by 2, 3, 10;
end;
$$;

revoke execute on function public.movimientos_cuenta(uuid, date) from public, anon;
grant execute on function public.movimientos_cuenta(uuid, date) to authenticated;

-- 3. El saldo de cada cliente (positivo = debe)
create or replace function public.deuda_clientes(p_hasta date)
returns table (
  client_id          uuid,
  full_name          text,
  client_number      integer,
  services           integer,
  desagotes          integer,
  cargos_cents       bigint,
  pagos_cents        bigint,
  saldo_cents        bigint,
  con_empleado_cents bigint,
  sin_precio         integer,
  ultimo_pago        date
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not public.is_owner_or_above() then
    raise exception 'Solo el dueño puede ver las cuentas de los clientes' using errcode = '42501';
  end if;

  return query
  select m.client_id, pr.full_name::text, cp.client_number::integer,
         count(*) filter (where m.tipo = 'service')::integer,
         count(*) filter (where m.tipo = 'desagote')::integer,
         coalesce(sum(m.cargo_cents), 0)::bigint,
         coalesce(sum(m.pago_cents), 0)::bigint,
         (coalesce(sum(m.cargo_cents), 0) - coalesce(sum(m.pago_cents), 0))::bigint,
         coalesce(sum(m.pago_cents) filter (where m.estado = 'con_empleado'), 0)::bigint,
         count(*) filter (where m.sin_precio)::integer,
         max(m.fecha) filter (where m.tipo = 'pago')
    from public.movimientos_cuenta(null, p_hasta) m
    join public.profiles pr on pr.id = m.client_id
    left join public.client_profiles cp on cp.id = m.client_id
   group by m.client_id, pr.full_name, cp.client_number
   order by 8 desc, 2;
end;
$$;

revoke execute on function public.deuda_clientes(date) from public, anon;
grant execute on function public.deuda_clientes(date) to authenticated;
