import { createSupabaseServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Waves } from 'lucide-react';
import { PageHeader, Panel } from '@/components/admin/bo';
import { ClientesPiletasTabla } from './ClientesPiletasTabla';
import { getClientesYPiletas } from './data';

export default async function ClientesPage() {
  const supabase = await createSupabaseServerClient();
  const { filas, opciones } = await getClientesYPiletas(supabase);
  const piletas = filas.filter((f) => f.poolId).length;
  const clientes = new Set(filas.map((f) => f.clientId)).size;

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Cartera"
        title="Clientes y piletas"
        description={`${clientes} ${clientes === 1 ? 'cliente' : 'clientes'} · ${piletas} ${piletas === 1 ? 'pileta' : 'piletas'}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/piletas/nueva" className="bo-btn">
              <Waves className="w-4 h-4" />
              Nueva pileta
            </Link>
            <Link href="/admin/clientes/nuevo" className="bo-btn bo-btn-primary">
              <Plus className="w-4 h-4" />
              Nuevo cliente
            </Link>
          </div>
        }
      />

      <Panel>
        <ClientesPiletasTabla filas={filas} opciones={opciones} />
      </Panel>
    </div>
  );
}
