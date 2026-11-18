import { redirect } from 'next/navigation';
import { requireRole, CMS_ROLES } from '@/lib/auth/require-role';
import { PageHeader } from '@/components/admin/bo';
import { AsignarPuntosForm } from './AsignarPuntosForm';

export default async function AsignarPuntosPage() {
  // Solo marketing (y super_admin) asigna puntos; el dueño vuelve a la pantalla de Puntos
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) redirect('/admin/puntos');

  return (
    <div className="bo-page bo-page-md">
      <PageHeader
        back={{ href: '/admin/puntos', label: 'Volver a Puntos' }}
        eyebrow="Fidelización"
        title="Asignar puntos"
        description="Asignación manual a un cliente específico — sumar o restar puntos"
      />

      <AsignarPuntosForm />
    </div>
  );
}
