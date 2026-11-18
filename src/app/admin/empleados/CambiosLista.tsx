// Lista del historial de registros de service, en palabras. La usan la pantalla de cambios y la de la visita.
// Solo presenta: los datos llegan ya traducidos (describeHistory) desde la página.
import Link from 'next/link';
import { History } from 'lucide-react';
import { StatusBadge, type BadgeTone } from '@/components/admin/bo';
import type { HistoryEntry } from '@/lib/staff-work';

const TONE: Record<HistoryEntry['action'], BadgeTone> = { insert: 'green', update: 'amber', delete: 'red' };
const AR = 'America/Argentina/Buenos_Aires';
const cuando = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: AR });

export type CambiosContexto = {
  /** Nombre de cada persona por id */
  names: Record<string, string>;
  /** Nombre de cada pileta por id (alias o dirección) */
  pools?: Record<string, string>;
};

export function CambiosLista({ entries, ctx, showPool = true }: { entries: HistoryEntry[]; ctx: CambiosContexto; showPool?: boolean }) {
  if (entries.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground px-5 py-4">
        <History className="w-4 h-4" />
        No hay cambios para mostrar.
      </p>
    );
  }
  return (
    <ol className="bo-rows" data-testid="cambios">
      {entries.map((e) => {
        const quien = e.changedBy ? ctx.names[e.changedBy] ?? 'Alguien que ya no está' : 'El sistema';
        const pileta = e.poolId ? ctx.pools?.[e.poolId] ?? 'Pileta' : 'Pileta';
        const detalle = e.action === 'update' ? e.changes : e.snapshot;
        return (
          <li key={e.id} className="px-5 py-3.5" data-testid="cambio">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={TONE[e.action]}>{e.verb}</StatusBadge>
              <span className="text-sm font-medium text-foreground">{quien}</span>
              <span className="text-xs text-muted-foreground">· {cuando(e.changedAt)}</span>
            </div>
            {showPool && (
              <p className="text-xs text-muted-foreground mt-1">
                {e.itemId && e.action !== 'delete' ? (
                  <Link href={`/admin/itinerario/visita/${e.itemId}`} className="underline underline-offset-2 hover:text-foreground">{pileta}</Link>
                ) : (
                  pileta
                )}
              </p>
            )}
            {detalle.length > 0 ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {detalle.map((c) => (
                  <div key={c.field} className="contents">
                    <dt className="text-muted-foreground">{c.field}</dt>
                    <dd className="text-foreground whitespace-pre-line break-words">
                      {e.action === 'update' ? (
                        <>
                          <span className="line-through text-muted-foreground">{c.before}</span> → {c.after}
                        </>
                      ) : (
                        c.after
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Sin cambios en los datos que se muestran.</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
