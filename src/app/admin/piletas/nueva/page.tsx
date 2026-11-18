import { PageHeader } from '@/components/admin/bo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NuevaPiletaForm } from './NuevaPiletaForm';

async function getClientes() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'client')
    .eq('status', 'active')
    .order('full_name');
  return data ?? [];
}

type Props = { searchParams: Promise<{ cliente?: string }> };

export default async function NuevaPiletaPage({ searchParams }: Props) {
  const { cliente } = await searchParams;
  const clientes = await getClientes();

  return (
    <div className="bo-page bo-page-form">
      <PageHeader back={{ href: '/admin/clientes', label: 'Volver a clientes y piletas' }} eyebrow="Cartera de service" title="Nueva pileta" />
      <NuevaPiletaForm clientes={clientes} defaultClientId={cliente} />
    </div>
  );
}
