import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { requireRole, STAFF_ROLES, CMS_ROLES } from '@/lib/auth/require-role';
import Link from 'next/link';
import { Star, Layers, UserPlus } from 'lucide-react';
import { PageHeader, Panel, PanelHeader, EmptyState, StatusBadge } from '@/components/admin/bo';
import { NuevaReglaForm } from './NuevaReglaForm';
import { ToggleRuleButton } from './ToggleRuleButton';

const triggerLabel: Record<string, string> = {
  purchase_online:  'Compra online',
  purchase_manual:  'Compra WhatsApp',
  service:          'Service',
  manual_grant:     'Manual',
};

async function getRules() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('point_rules')
    .select('id, name, description, trigger_type, points_per_100_ars, min_amount_cents, is_active, starts_at, ends_at')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export default async function PuntosPage() {
  const auth = await requireRole(STAFF_ROLES);
  if (!auth.ok) redirect('/login');
  // Los puntos los maneja marketing; el dueño los mira sin editar (migración 25)
  const canEdit = CMS_ROLES.includes(auth.role);

  const rules = await getRules();
  const active = rules.filter((r) => r.is_active);

  return (
    <div className="bo-page">
      <PageHeader
        eyebrow="Fidelización"
        title="Sistema de puntos"
        description={`${active.length} ${active.length === 1 ? 'regla activa' : 'reglas activas'}`}
        actions={
          <>
            {[
              { href: '/admin/puntos/niveles', label: 'Niveles', icon: Layers },
              ...(canEdit ? [{ href: '/admin/puntos/asignar', label: 'Asignar puntos', icon: UserPlus }] : []),
            ].map((item) => (
              <Link key={item.href} href={item.href} className="bo-btn">
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </>
        }
      />

      <div className="space-y-5">
        {canEdit ? (
          <NuevaReglaForm />
        ) : (
          <p data-testid="puntos-solo-lectura" className="bo-panel px-5 py-4 text-sm text-muted-foreground">
            Solo lectura: las reglas, los niveles y la asignación de puntos los maneja marketing.
          </p>
        )}

        <Panel>
          {rules.length === 0 ? (
            <EmptyState icon={Star}>
              <p className="font-medium text-foreground">Sin reglas configuradas</p>
              <p className="text-sm text-muted-foreground mt-1">Creá la primera regla para que los clientes acumulen puntos</p>
            </EmptyState>
          ) : (
            <>
              <PanelHeader icon={Star} title="Reglas" sub="Activalas o desactivalas con el interruptor" bordered />
              <div className="bo-rows">
                {rules.map((rule) => (
                  <div key={rule.id} data-testid="regla" className="flex items-start gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-foreground text-sm">{rule.name as string}</p>
                        <StatusBadge tone="blue">
                          {triggerLabel[rule.trigger_type as string] ?? rule.trigger_type}
                        </StatusBadge>
                        {!(rule.is_active as boolean) && (
                          <StatusBadge tone="gray">Inactiva</StatusBadge>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground mb-1">{rule.description as string}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{rule.points_per_100_ars as number} pt</span> por cada $100 ARS
                        {(rule.min_amount_cents as number) > 0 && ` · mín. $${((rule.min_amount_cents as number) / 100).toLocaleString('es-AR')}`}
                      </p>
                      {(rule.starts_at || rule.ends_at) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {rule.starts_at && `Desde ${new Date(rule.starts_at as string).toLocaleDateString('es-AR')}`}
                          {rule.starts_at && rule.ends_at && ' · '}
                          {rule.ends_at && `Hasta ${new Date(rule.ends_at as string).toLocaleDateString('es-AR')}`}
                        </p>
                      )}
                    </div>
                    {canEdit && <ToggleRuleButton ruleId={rule.id} isActive={rule.is_active as boolean} />}
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
