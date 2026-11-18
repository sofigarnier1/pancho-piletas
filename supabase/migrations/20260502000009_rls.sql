/* =============================================================================
   CLORO Y PILETAS PANCHO — Row Level Security (RLS)
   Migración: 20260502000009

   Patrón general:
   - Cada usuario ve y edita solo sus propios datos
   - is_admin() = super_admin | owner | marketing → acceso de lectura amplio
   - is_owner_or_above() = super_admin | owner → acceso de escritura operativo
   - marketing puede editar landing_content y point_rules
   - employee puede ver itinerario y registrar service_logs propios
============================================================================= */

-- ============================================================================
-- 0) Habilitar RLS en todas las tablas
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.client_profiles   enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.pools             enable row level security;
alter table public.itinerary_days    enable row level security;
alter table public.itinerary_items   enable row level security;
alter table public.service_logs      enable row level security;
alter table public.products          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.manual_sales      enable row level security;
alter table public.manual_sale_items enable row level security;
alter table public.client_levels     enable row level security;
alter table public.point_rules       enable row level security;
alter table public.point_transactions enable row level security;
alter table public.landing_content   enable row level security;


-- ============================================================================
-- 1) PROFILES
-- ============================================================================

create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin() or public.get_my_role() = 'employee');

create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id or public.is_owner_or_above());

create policy "profiles: insert own or admin"
  on public.profiles for insert
  with check (auth.uid() = id or public.is_owner_or_above());


-- ============================================================================
-- 2) CLIENT PROFILES & EMPLOYEE PROFILES
-- ============================================================================

create policy "client_profiles: own or admin"
  on public.client_profiles for all
  using (auth.uid() = id or public.is_admin());

create policy "employee_profiles: own or owner"
  on public.employee_profiles for all
  using (auth.uid() = id or public.is_owner_or_above());


-- ============================================================================
-- 3) POOLS
-- ============================================================================

create policy "pools: client sees own"
  on public.pools for select
  using (client_id = auth.uid() or public.is_admin() or public.get_my_role() = 'employee');

create policy "pools: owner manages"
  on public.pools for all
  using (public.is_owner_or_above());


-- ============================================================================
-- 4) ITINERARIO
-- ============================================================================

create policy "itinerary_days: admin full"
  on public.itinerary_days for all
  using (public.is_admin());

create policy "itinerary_days: employee read"
  on public.itinerary_days for select
  using (public.get_my_role() = 'employee');

create policy "itinerary_items: admin full"
  on public.itinerary_items for all
  using (public.is_admin());

-- Empleado ve las piletas que tiene asignadas (null = todos, o su id)
create policy "itinerary_items: employee read assigned"
  on public.itinerary_items for select
  using (
    public.get_my_role() = 'employee'
    and (assigned_employee_id is null or assigned_employee_id = auth.uid())
  );

-- Empleado puede actualizar (marcar hecha) piletas asignadas
create policy "itinerary_items: employee update assigned"
  on public.itinerary_items for update
  using (
    public.get_my_role() = 'employee'
    and (assigned_employee_id is null or assigned_employee_id = auth.uid())
  );


-- ============================================================================
-- 5) SERVICE LOGS
-- ============================================================================

create policy "service_logs: admin full"
  on public.service_logs for all
  using (public.is_admin());

create policy "service_logs: employee own"
  on public.service_logs for all
  using (public.get_my_role() = 'employee' and employee_id = auth.uid());

create policy "service_logs: client read own"
  on public.service_logs for select
  using (client_id = auth.uid());


-- ============================================================================
-- 6) PRODUCTS
-- ============================================================================

create policy "products: public read active"
  on public.products for select
  using (is_active = true or public.is_admin());

create policy "products: owner manages"
  on public.products for all
  using (public.is_owner_or_above());

-- Marketing puede actualizar visualización (display_order, promo_label, is_featured)
create policy "products: marketing update display"
  on public.products for update
  using (public.get_my_role() in ('super_admin', 'marketing'));


-- ============================================================================
-- 7) ORDERS
-- ============================================================================

create policy "orders: client own select"
  on public.orders for select
  using (client_id = auth.uid() or public.is_admin());

create policy "orders: client insert own"
  on public.orders for insert
  with check (client_id = auth.uid());

create policy "orders: owner update"
  on public.orders for update
  using (public.is_owner_or_above());

create policy "order_items: client own select"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_id
        and (orders.client_id = auth.uid() or public.is_admin())
    )
  );

create policy "order_items: client insert with order"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_id
        and orders.client_id = auth.uid()
    )
  );


-- ============================================================================
-- 8) VENTAS MANUALES
-- ============================================================================

create policy "manual_sales: owner manages"
  on public.manual_sales for all
  using (public.is_owner_or_above());

create policy "manual_sales: client read own"
  on public.manual_sales for select
  using (client_id = auth.uid());

create policy "manual_sale_items: follow sale"
  on public.manual_sale_items for all
  using (
    exists (
      select 1 from public.manual_sales
      where manual_sales.id = manual_sale_id
        and (manual_sales.client_id = auth.uid() or public.is_owner_or_above())
    )
  );


-- ============================================================================
-- 9) SISTEMA DE PUNTOS
-- ============================================================================

create policy "client_levels: public read"
  on public.client_levels for select
  using (true);

create policy "client_levels: owner manages"
  on public.client_levels for all
  using (public.is_owner_or_above());

create policy "point_rules: read active or admin"
  on public.point_rules for select
  using (is_active = true or public.is_admin());

create policy "point_rules: marketing manages"
  on public.point_rules for all
  using (public.get_my_role() in ('super_admin', 'marketing'));

create policy "point_transactions: own or admin"
  on public.point_transactions for select
  using (client_id = auth.uid() or public.is_admin());

create policy "point_transactions: admin insert"
  on public.point_transactions for insert
  with check (public.is_admin());


-- ============================================================================
-- 10) LANDING CONTENT
-- ============================================================================

create policy "landing_content: public read"
  on public.landing_content for select
  using (true);

create policy "landing_content: marketing manages"
  on public.landing_content for all
  using (public.get_my_role() in ('super_admin', 'marketing'));
