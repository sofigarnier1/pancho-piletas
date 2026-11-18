-- ============================================================================
-- Marketing arma el catálogo de la landing: crea productos y edita todo lo que
-- se ve en la web (nombre, descripción, tipo, precio, unidad, peso, foto,
-- etiqueta, destacado, orden, Hay/No hay).
-- También activa o desactiva productos (sacarlos de la web sin borrarlos).
-- Lo que sigue siendo solo del dueño: la cantidad en stock (stock_units) y borrar.
-- ============================================================================

-- 1) Marketing puede insertar, pero siempre con stock en 0 (el stock lo carga el dueño).
drop policy if exists "products: marketing insert" on public.products;
create policy "products: marketing insert"
  on public.products for insert
  with check (public.get_my_role() = 'marketing' and stock_units = 0);

-- 2) Guardián de actualización: marketing ya no tiene vedado el contenido visible.
create or replace function public.guard_product_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if public.get_my_role() = 'marketing' and new.stock_units is distinct from old.stock_units then
    raise exception 'Marketing no puede cambiar el stock'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
