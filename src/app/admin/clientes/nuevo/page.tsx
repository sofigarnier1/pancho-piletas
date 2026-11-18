import { PageHeader } from '@/components/admin/bo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { embedOne, nextClientNumber } from '@/lib/clients';
import { NuevoClienteForm, type ClienteExistente, type PiletaExistente } from './NuevoClienteForm';

async function getDatos() {
  const supabase = await createSupabaseServerClient();
  const [{ data: clientes }, { data: piletas }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, client_profiles(client_number)')
      .eq('role', 'client')
      .order('full_name'),
    supabase
      .from('pools')
      .select('id, nickname, address, neighborhood, profiles!pools_client_id_fkey(full_name)')
      .eq('is_active', true)
      .order('address'),
  ]);

  const lista: ClienteExistente[] = (clientes ?? []).map((c) => {
    const cp = embedOne(c.client_profiles as unknown as { client_number: number | null } | null);
    return { id: c.id as string, full_name: c.full_name as string, client_number: cp?.client_number ?? null };
  });
  const pools: PiletaExistente[] = (piletas ?? []).map((p) => ({
    id: p.id as string,
    nickname: p.nickname as string | null,
    address: p.address as string | null,
    neighborhood: p.neighborhood as string | null,
    titular: (p.profiles as unknown as { full_name: string } | null)?.full_name ?? null,
  }));
  return { clientes: lista, piletas: pools, suggestedNumber: nextClientNumber(lista.map((c) => c.client_number)) };
}

export default async function NuevoClientePage() {
  const { clientes, piletas, suggestedNumber } = await getDatos();
  return (
    <div className="bo-page bo-page-form">
      <PageHeader back={{ href: '/admin/clientes', label: 'Volver a clientes y piletas' }} eyebrow="Gestión de clientes" title="Nuevo cliente" />
      <NuevoClienteForm clientes={clientes} piletas={piletas} suggestedNumber={suggestedNumber} />
    </div>
  );
}
