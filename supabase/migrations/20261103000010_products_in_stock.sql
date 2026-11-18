-- ============================================================================
-- Disponibilidad simple para la landing ("Hay" / "No hay")
-- ============================================================================
-- Las ventas por WhatsApp no siempre se registran, así que stock_units no
-- alcanza para decir en la landing si hay o no. in_stock lo marca a mano
-- marketing u owner; stock_units sigue siendo el conteo interno.

alter table public.products
  add column if not exists in_stock boolean not null default true;
