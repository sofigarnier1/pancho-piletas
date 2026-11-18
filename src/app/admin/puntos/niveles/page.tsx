import { PageHeader, Panel, EmptyState } from '@/components/admin/bo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { requireRole, STAFF_ROLES, CMS_ROLES } from '@/lib/auth/require-role';
import { Star } from 'lucide-react';
import { NuevoNivelForm, EditNivelForm } from './NivelForm';

async function getLevels() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_levels')
    .select('id, name, min_points, benefits, color, sort_order')
    .order('sort_order');
  return data ?? [];
}

export default async function NivelesPage() {
  const auth = await requireRole(STAFF_ROLES);
  if (!auth.ok) redirect('/login');
  const canEdit = CMS_ROLES.includes(auth.role);

  const levels = await getLevels();

  return (
    <div className="bo-page">
      <PageHeader
        back={{ href: '/admin/puntos', label: 'Volver a Puntos' }}
        eyebrow="Fidelización"
        title="Niveles"
        description={`${levels.length} niveles configurados`}
      />

      {/* Botón "Nuevo nivel" (al abrirse ocupa todo el ancho). El dueño solo mira. */}
      {canEdit && (
        <div className="-mt-3 mb-5 flex justify-end [&>div]:w-full [&>div]:mt-0">
          <NuevoNivelForm />
        </div>
      )}

      {levels.length === 0 ? (
        <Panel>
          <EmptyState icon={Star}>
            <p className="font-medium text-foreground">Sin niveles configurados</p>
            <p className="text-sm text-muted-foreground mt-1">Creá los niveles que verán los clientes</p>
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {levels.map((level) => {
            const benefits = (level.benefits as unknown as string[]) ?? [];
            const color = level.color as string;
            return (
              <div key={level.id} className="bo-panel relative p-5 sm:p-6" style={{ borderTop: `3px solid ${color}` }}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="bo-eyebrow" style={{ color }}>Orden {level.sort_order as number}</span>
                    <p className="font-display font-bold text-xl text-foreground mt-2">{level.name as string}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Desde <span className="font-semibold text-foreground">{(level.min_points as number).toLocaleString('es-AR')} pts</span>
                    </p>
                  </div>
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}22` }}
                  >
                    <Star className="w-5 h-5" style={{ color }} />
                  </div>
                </div>
                {benefits.length > 0 && (
                  <ul className="space-y-1 mt-4 pt-4 border-t border-border">
                    {benefits.map((b, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && <div className="mt-4 flex flex-col items-end [&>div]:self-stretch">
                  <EditNivelForm level={{
                    id: level.id,
                    name: level.name as string,
                    min_points: level.min_points as number,
                    benefits,
                    color,
                    sort_order: level.sort_order as number,
                  }} />
                </div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
