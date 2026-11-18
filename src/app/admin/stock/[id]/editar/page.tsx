import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapSupabaseUserToAppUser } from '@/lib/supabase/user';
import { isUuid } from '@/lib/validators';
import { PageHeader } from '@/components/admin/bo';
import { getLandingProducts } from '@/lib/supabase/landing-products';
import { EditarProductoForm, type EditableProduct } from './EditarProductoForm';

export default async function EditarProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from('products')
    .select('id, name, description, image_url, promo_label, is_featured, display_order, price_cents, in_stock, chlorine_type, unit, weight_kg, chlorine_content, category, low_stock_alert')
    .eq('id', id)
    .maybeSingle();
  if (!product) notFound();
  const siblings = await getLandingProducts();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user ? mapSupabaseUserToAppUser(user).role : null;

  return (
    <div className="bo-page">
      <PageHeader back={{ href: '/admin/stock', label: 'Volver a stock' }} eyebrow="Productos y existencias" title="Editar producto" />
      <EditarProductoForm product={product as EditableProduct} siblings={siblings} canSetContent={role === 'super_admin' || role === 'owner'} />
    </div>
  );
}
