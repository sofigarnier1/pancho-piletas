import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readableTextOn, textColorOn, TINT_BG } from '@/lib/color';
import { ShoppingBag, Wrench, Star } from 'lucide-react';
import { PageHeader, Panel } from '@/components/admin/bo';

type Level = {
  id: string;
  name: string;
  min_points: number;
  benefits: string[];
  color: string;
  sort_order: number;
};

async function getClientProfile(userId: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: allLevels }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, points_balance, client_level_id, client_levels(id, name, min_points, benefits, color, sort_order)')
      .eq('id', userId)
      .single(),
    supabase
      .from('client_levels')
      .select('id, name, min_points, benefits, color, sort_order')
      .order('sort_order'),
  ]);

  return { profile, allLevels: (allLevels ?? []) as Level[] };
}

export default async function ClientDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { profile, allLevels } = await getClientProfile(user.id);

  const points = profile?.points_balance ?? 0;
  const currentLevel = profile?.client_levels as unknown as Level | null;

  const nextLevel = allLevels
    .filter((l) => l.min_points > (currentLevel?.min_points ?? -1))
    .sort((a, b) => a.sort_order - b.sort_order)[0] as Level | undefined;

  const progressPct = nextLevel
    ? Math.min(100, ((points - (currentLevel?.min_points ?? 0)) /
        (nextLevel.min_points - (currentLevel?.min_points ?? 0))) * 100)
    : 100;

  const firstName = profile?.full_name?.split(' ')[0] ?? 'cliente';
  const levelColor = currentLevel?.color ?? '#1B5FA8';

  return (
    <div>
      <PageHeader title={`Hola, ${firstName}`} description="Tu portal de servicios y compras" />

      {/* Points card */}
      <div
        className="rounded-[0.625rem] p-5 mb-6 shadow-[0_2px_5px_rgb(28_58_91/0.03)]"
        style={{ backgroundColor: `${levelColor}18`, border: `1px solid ${levelColor}35` }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="bo-form-title mb-0">Mis puntos</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums text-foreground mt-2">{points.toLocaleString('es-AR')}</p>
          </div>
          {currentLevel && (
            <span
              className="px-2.5 py-1 rounded-[0.3125rem] text-xs font-semibold"
              style={{ backgroundColor: levelColor, color: readableTextOn(levelColor) }}
            >
              {currentLevel.name}
            </span>
          )}
        </div>

        {nextLevel ? (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>
                Próximo nivel:{' '}
                <span className="font-semibold" style={{ color: textColorOn(nextLevel.color, TINT_BG) }}>{nextLevel.name}</span>
              </span>
              <span>{(nextLevel.min_points - points).toLocaleString('es-AR')} puntos más</span>
            </div>
            <div className="w-full bg-black/10 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, backgroundColor: levelColor }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs font-semibold" style={{ color: textColorOn(levelColor, TINT_BG) }}>
            ¡Estás en el nivel máximo!
          </p>
        )}
      </div>

      {/* Current level benefits */}
      {currentLevel?.benefits && currentLevel.benefits.length > 0 && (
        <Panel className="bo-panel-pad mb-6">
          <p className="bo-form-title mb-3">
            Beneficios de tu nivel
          </p>
          <ul className="space-y-1.5">
            {currentLevel.benefits.map((b, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: levelColor }}
                />
                {b}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: '/client/compras',   label: 'Mis compras',   desc: 'Historial de pedidos',          icon: ShoppingBag, tone: '' },
          { href: '/client/servicios', label: 'Mis servicios', desc: 'Historial de mantenimiento',     icon: Wrench,      tone: 'green' },
          { href: '/client/puntos',    label: 'Mis puntos',    desc: 'Transacciones y beneficios',     icon: Star,        tone: 'amber' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="bo-panel bo-panel-pad flex items-center gap-3 transition-colors hover:border-[#b9cde0]"
          >
            <span className={`bo-icon-tile ${item.tone}`}>
              <item.icon />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground text-sm">{item.label}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{item.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
