import { textColorOn, TINT_BG } from '@/lib/color';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Star, TrendingUp, TrendingDown } from 'lucide-react';
import { PageHeader, Panel, EmptyState } from '@/components/admin/bo';

const sourceLabel: Record<string, string> = {
  order:        'Compra online',
  manual_sale:  'Compra por WhatsApp',
  service:      'Service de pileta',
  manual_grant: 'Bonus manual',
  adjustment:   'Ajuste',
};

type Level = {
  id: string;
  name: string;
  min_points: number;
  benefits: string[];
  color: string;
  sort_order: number;
};

async function getPuntosData(clientId: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: transactions }, { data: levels }] = await Promise.all([
    supabase
      .from('profiles')
      .select('points_balance, client_level_id, client_levels(id, name, min_points, benefits, color, sort_order)')
      .eq('id', clientId)
      .single(),
    supabase
      .from('point_transactions')
      .select('id, points, source_type, notes, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('client_levels')
      .select('id, name, min_points, benefits, color, sort_order')
      .order('sort_order'),
  ]);

  return {
    profile,
    transactions: transactions ?? [],
    levels: (levels ?? []) as Level[],
  };
}

export default async function ClientPuntosPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { profile, transactions, levels } = await getPuntosData(user.id);

  const points = profile?.points_balance ?? 0;
  const currentLevel = profile?.client_levels as unknown as Level | null;
  const levelColor = currentLevel?.color ?? '#1B5FA8';

  return (
    <div>
      <PageHeader
        title="Mis puntos"
        description="Tus puntos, tu nivel y sus movimientos. Hoy los puntos los carga el equipo de Pancho."
      />

      {/* Balance card */}
      <div
        className="rounded-[0.625rem] p-5 mb-5 shadow-[0_2px_5px_rgb(28_58_91/0.03)]"
        style={{ backgroundColor: `${levelColor}18`, border: `1px solid ${levelColor}35` }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="bo-form-title mb-0">Saldo actual</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums text-foreground mt-2">{points.toLocaleString('es-AR')}</p>
            <p className="text-sm text-muted-foreground">puntos</p>
          </div>
          {currentLevel && (
            <div className="text-center">
              <Star className="w-8 h-8 mx-auto mb-1" style={{ color: levelColor }} />
              <span className="text-sm font-bold" style={{ color: textColorOn(levelColor, TINT_BG) }}>{currentLevel.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Level progression */}
      {levels.length > 0 && (
        <Panel className="bo-panel-pad mb-5">
          <p className="bo-form-title mb-3">Niveles</p>
          <div className="space-y-3">
            {levels.map((level) => {
              const isCurrent = level.id === currentLevel?.id;
              const isReached = points >= level.min_points;
              return (
                <div
                  key={level.id}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${isCurrent ? 'bg-accent' : ''}`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${level.color}25` }}
                  >
                    <Star className="w-4 h-4" style={{ color: isReached ? level.color : '#9ca3af' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-bold text-sm ${isReached ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {level.name}
                      </p>
                      {isCurrent && (
                        <span className="bo-badge plain">
                          Tu nivel actual
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {level.min_points.toLocaleString('es-AR')} pts
                      </span>
                    </div>
                    {level.benefits && level.benefits.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {level.benefits.map((b, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span
                              className="w-1 h-1 rounded-full flex-shrink-0"
                              style={{ backgroundColor: isReached ? level.color : '#9ca3af' }}
                            />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Transaction history */}
      <div>
        <p className="bo-form-title mb-3">
          Últimos movimientos
        </p>
        {transactions.length === 0 ? (
          <Panel>
            <EmptyState icon={Star}>
              <p>Aún no tenés movimientos de puntos</p>
            </EmptyState>
          </Panel>
        ) : (
          <Panel className="bo-rows">
            {transactions.map((t) => {
              const isPositive = (t.points as number) > 0;
              return (
                <div
                  key={t.id}
                  className="bo-row"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isPositive ? 'bg-[#eef6f1]' : 'bg-[#fbefef]'
                  }`}>
                    {isPositive
                      ? <TrendingUp className="w-3.5 h-3.5 text-[#28745b]" />
                      : <TrendingDown className="w-3.5 h-3.5 text-[#ad4d52]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {sourceLabel[t.source_type as string] ?? t.source_type}
                    </p>
                    {t.notes && (
                      <p className="text-xs text-muted-foreground truncate">{t.notes as string}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.created_at as string).toLocaleDateString('es-AR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <p className={`font-bold text-sm flex-shrink-0 ${isPositive ? 'text-[#28745b]' : 'text-[#ad4d52]'}`}>
                    {isPositive ? '+' : ''}{t.points as number}
                  </p>
                </div>
              );
            })}
          </Panel>
        )}
      </div>
    </div>
  );
}
