'use client';

import { useRef, useState, useTransition } from 'react';
import { Banknote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, PanelHeader } from '@/components/admin/bo';
import { Button } from '@/components/ui/button';
import { formatPesos } from '@/lib/precios';
import { anotarCobroAction, borrarCobroAction } from '../../actions';
import { useConfirmar } from '@/components/ui/confirmar';

export type Cobro = { id: string; amountCents: number; conEmpleado: boolean; mio: boolean; hora: string; nota: string | null };

/**
 * "Cobré": el empleado anota cuánta plata le dio el cliente. Solo el monto: no ve precios ni lo que debe el cliente.
 * Mientras no se lo entregue al dueño, lo puede borrar si se equivocó.
 */
export function CobroPanel({ itemId, cobros, puedeAnotar }: { itemId: string; cobros: Cobro[]; puedeAnotar: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [pending, startTransition] = useTransition();
  // Un id por envío: si el mismo envío llega dos veces (doble toque, reintento), la base guarda uno solo
  const requestId = useRef<string>(crypto.randomUUID());
  const { confirmar, ventanaConfirmar } = useConfirmar();

  if (!puedeAnotar && cobros.length === 0) return null;

  const anotar = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await anotarCobroAction(itemId, requestId.current, monto, nota);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Cobro anotado');
      requestId.current = crypto.randomUUID();
      setMonto(''); setNota(''); setAbierto(false);
    });
  };

  const borrar = async (id: string) => {
    if (!(await confirmar({ titulo: '¿Borrar este cobro?', mensaje: 'Borralo solo si lo anotaste por error.', boton: 'Borrar', peligro: true }))) return;
    startTransition(async () => {
      const r = await borrarCobroAction(id);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Cobro borrado');
    });
  };

  return (
    <Panel className="mt-4" testId="cobros">
      <PanelHeader icon={Banknote} title="Cobros de esta visita" bordered />
      {cobros.length > 0 && (
        <ul className="bo-rows">
          {cobros.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3" data-testid="cobro">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground tabular-nums">{c.mio ? 'Cobraste' : 'Cobrado'} {formatPesos(c.amountCents)}</p>
                <p className="text-xs text-muted-foreground">
                  {c.hora} · {c.conEmpleado ? 'Falta entregárselo al dueño' : 'Ya lo tiene el dueño'}
                  {c.nota ? ` · “${c.nota}”` : ''}
                </p>
              </div>
              {c.mio && c.conEmpleado && (
                <button type="button" className="bo-icon-btn !h-10 !w-10" aria-label="Borrar cobro" title="Borrar cobro" disabled={pending} onClick={() => borrar(c.id)}>
                  <Trash2 />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeAnotar && (
        <div className="p-4">
          {!abierto ? (
            <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setAbierto(true)} data-testid="cobre">
              <Banknote /> Cobré
            </Button>
          ) : (
            <form onSubmit={anotar} className="space-y-3" data-testid="cobro-form">
              <label className="block space-y-1 text-sm font-medium text-foreground">
                ¿Cuánto te dieron?
                <input
                  inputMode="decimal"
                  autoFocus
                  placeholder="15.000"
                  className="h-12 w-full rounded-md border border-input bg-card px-3 text-lg tabular-nums"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                  data-testid="cobro-monto"
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-muted-foreground">
                Nota (opcional)
                <input className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Ej.: pagó también lo del mes pasado" />
              </label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setAbierto(false)} disabled={pending}>Cancelar</Button>
                <Button type="submit" className="h-12 flex-1" disabled={pending || !monto.trim()} data-testid="cobro-guardar">
                  {pending ? 'Anotando...' : 'Anotar cobro'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
      {ventanaConfirmar}
    </Panel>
  );
}
