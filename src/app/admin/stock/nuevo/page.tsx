import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapSupabaseUserToAppUser } from '@/lib/supabase/user';
import { PageHeader } from '@/components/admin/bo';
import { NuevoProductoForm } from './NuevoProductoForm';
import { getLandingProducts } from '@/lib/supabase/landing-products';

export default async function NuevoProductoPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const siblings = await getLandingProducts();
  const role = user ? mapSupabaseUserToAppUser(user).role : null;

  return (
    <div className="bo-page">
      <PageHeader back={{ href: '/admin/stock', label: 'Volver a stock' }} eyebrow="Productos y existencias" title="Nuevo producto" />
      <NuevoProductoForm canSetStock={role === 'super_admin' || role === 'owner'} siblings={siblings} />
    </div>
  );
}
