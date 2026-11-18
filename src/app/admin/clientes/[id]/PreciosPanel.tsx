'use client';

import { useState, useTransition } from 'react';
import { Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, PanelHeader } from '@/components/admin/bo';
import { Button } from '@/components/ui/button';
import { PRICE_KINDS, PRICE_LABEL, PRICE_UNIT, formatPesos, precioVigente, type PriceKind, type PriceRow } from '@/lib/precios';
import { borrarPrecioAction, guardarPrecioAction } from '../precios-actions';
import { useConfirmar } from '@/components/ui/confirmar';

const fecha = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}/${d.slice(0, 4)}`;

/** Sección "Precios" de la ficha: lo que se le cobra a este cliente por cada cosa, desde qué fecha, y el historial. */
export function PreciosPanel({ clientId, prices, hoy }: { clientId: string; prices: PriceRow[]; hoy: string }) {
  const [kind, setKind] = useState<PriceKind>('service');
  const [precio, setPrecio] = useState('');
  const [desde, setDesde] = useState(hoy);
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await guardarPrecioAction(clientId, kind, precio, desde);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Precio guardado');
      setPrecio('');
    });
  };

  const borrar = async (id: string) => {
    if (!(await confirmar({ titulo: '¿Borrar este precio?', mensaje: 'Desde esa fecha vuelve a regir el precio anterior, si había uno. La deuda del cliente se recalcula.', boton: 'Borrar', peligro: true }))) return;
    startTransition(async () => {
      const r = await borrarPrecioAction(id, clientId);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Precio borrado');
    });
  };

  return (
    <Panel className="mb-5" testId="precios">
      <PanelHeader icon={Tag} title="Precios" bordered />
      <p className="px-5 pt-3 text-xs text-muted-foreground">
        Lo que se le cobra a este cliente. Cada precio rige desde su fecha hasta que cargues otro del mismo tipo. Los empleados no los ven.
      </p>
      <div className="bo-table-wrap">
        <table className="bo-table" data-testid="precios-tabla">
          <thead>
            <tr><th>Tipo</th><th>Hoy</th><th>Historial</th></tr>
          </thead>
          <tbody>
            {PRICE_KINDS.map((k) => {
              const vigente = precioVigente(prices, k, hoy);
              const lista = prices.filter((p) => p.kind === k).sort((a, b) => b.valid_from.localeCompare(a.valid_from));
              return (
                <tr key={k} data-testid={`precio-${k}`}>
                  <td className="font-medium text-foreground whitespace-nowrap">
                    {PRICE_LABEL[k]}
                    <span className="block text-[11px] font-normal text-muted-foreground">{PRICE_UNIT[k]}</span>
                  </td>
                  <td className="tabular-nums whitespace-nowrap" data-testid="precio-vigente">
                    {vigente ? formatPesos(vigente.price_cents) : <span className="text-muted-foreground">Sin precio</span>}
                  </td>
                  <td className="text-xs">
                    {lista.length === 0 ? <span className="text-muted-foreground">—</span> : lista.map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5" data-testid="precio-historial">
                        <span className={p.valid_from > hoy ? 'text-primary' : vigente?.id === p.id ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                          {formatPesos(p.price_cents)} desde el {fecha(p.valid_from)}{p.valid_from > hoy ? ' (todavía no rige)' : ''}
                        </span>
                        <button type="button" className="bo-icon-btn !h-7 !w-7" aria-label="Borrar precio" title="Borrar precio" disabled={pending} onClick={() => borrar(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form onSubmit={guardar} className="grid gap-2 border-t border-border p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" data-testid="precio-form">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Tipo
          <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={kind} onChange={(e) => setKind(e.target.value as PriceKind)} data-testid="precio-tipo">
            {PRICE_KINDS.map((k) => <option key={k} value={k}>{PRICE_LABEL[k]} ({PRICE_UNIT[k]})</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Precio
          <input inputMode="decimal" placeholder="12.500" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={precio} onChange={(e) => setPrecio(e.target.value)} required data-testid="precio-monto" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Rige desde
          <input type="date" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} required data-testid="precio-desde" />
        </label>
        <Button type="submit" disabled={pending || !precio.trim()} data-testid="precio-guardar">
          {pending ? 'Guardando...' : 'Guardar precio'}
        </Button>
      </form>
      {ventanaConfirmar}
    </Panel>
  );
}
