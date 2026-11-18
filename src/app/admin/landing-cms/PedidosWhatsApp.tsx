import { MessageCircle } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Panel, PanelHeader } from '@/components/admin/bo';
import { hace30Dias, resumirClicks, type Conteo } from '@/lib/landing/clicks';

function Lista({ titulo, filas }: { titulo: string; filas: Conteo[] }) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <ul className="space-y-2">
        {filas.map((f) => (
          <li key={f.clave} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="truncate">{f.nombre}</span>
              <b>{f.total}</b>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(f.total / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Qué botones de WhatsApp de la landing se tocan más y de dónde vienen las visitas (últimos 30 días). */
export async function PedidosWhatsApp() {
  const supabase = await createSupabaseServerClient();
  const desde = hace30Dias();
  const { data } = await supabase
    .from('landing_clicks')
    .select('boton, seccion, origen')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(5000);
  const r = resumirClicks(data ?? []);

  return (
    <Panel>
      <PanelHeader
        icon={MessageCircle}
        title="Pedidos por WhatsApp"
        sub="Toques a los botones de WhatsApp de la landing en los últimos 30 días"
        bordered
      />
      {r.total === 0 ? (
        <p className="bo-empty">Todavía no hay toques registrados.</p>
      ) : (
        <div className="grid gap-6 p-5 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Toques en total</p>
            <p className="mt-1 text-4xl font-bold">{r.total}</p>
            <div className="mt-5">
              <Lista titulo="De dónde vienen" filas={r.porOrigen} />
            </div>
          </div>
          <Lista titulo="Por sección" filas={r.porSeccion} />
          <Lista titulo="Botones más tocados" filas={r.porBoton} />
        </div>
      )}
    </Panel>
  );
}
