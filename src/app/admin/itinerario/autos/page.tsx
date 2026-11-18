import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Car } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, EmptyState } from '@/components/admin/bo';
import { AutosClient } from './AutosClient';

export default async function AutosPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('vehicles')
    .select('id, name, plate, is_active')
    .order('is_active', { ascending: false })
    .order('sort_order')
    .order('name');
  const vehicles = (data ?? []) as { id: string; name: string; plate: string | null; is_active: boolean }[];

  return (
    <div className="bo-page bo-page-md">
      <PageHeader
        back={{ href: '/admin/itinerario', label: 'Calendario' }}
        eyebrow="Operación diaria"
        title="Autos"
        description="Los autos con los que sale el equipo. Cada día repartís las visitas y la gente entre estos autos."
      />

      <Panel className="mb-4" testId="autos-lista">
        <PanelHeader title="Autos cargados" sub="Un auto inactivo no se ofrece para armar días nuevos." bordered />
        {vehicles.length === 0 ? (
          <EmptyState icon={Car}>
            <p>Todavía no cargaste ningún auto</p>
          </EmptyState>
        ) : null}
        <AutosClient vehicles={vehicles} />
      </Panel>
    </div>
  );
}
