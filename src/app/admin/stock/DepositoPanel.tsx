'use client';

// Depósito de cloro (migración 34): cuánto hay de cada tipo, el aviso de stock bajo y el precio a granel.
// El dueño cuenta, saca merma y cambia precio y aviso; marketing solo mira.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Droplets } from 'lucide-react';
import { Panel, PanelHeader, StatusBadge } from '@/components/admin/bo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DEPOSITO_LABEL, DEPOSITO_UNIDAD, formatCantidad, stockBajo, type ChlorineType } from '@/lib/cloro';
import { formatPesos } from '@/lib/precios';
import { configurarDepositoAction, contarCloroAction, sacarMermaAction } from './deposito-actions';

export type Deposito = {
  chlorine_type: ChlorineType;
  quantity: number;
  bulk_price_cents: number | null;
  low_alert: number | null;
};

type Modo = 'contar' | 'merma' | 'config';

const input = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground';
const coma = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));

export function DepositoPanel({ depositos, isOwner }: { depositos: Deposito[]; isOwner: boolean }) {
  const [abierto, setAbierto] = useState<{ modo: Modo; dep: Deposito } | null>(null);

  return (
    <Panel testId="deposito">
      <PanelHeader
        icon={Droplets}
        title="Depósito de cloro"
        sub="Todo el cloro que hay: lo que se vende (suelto o en bidones, bolsas y baldes) y lo que se usa en los services"
        bordered
      />
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {depositos.map((d) => {
          const bajo = stockBajo(d.quantity, d.low_alert);
          const u = DEPOSITO_UNIDAD[d.chlorine_type];
          return (
            <article key={d.chlorine_type} className="rounded-xl border border-border p-4 space-y-2" data-testid={`deposito-${d.chlorine_type}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{DEPOSITO_LABEL[d.chlorine_type]}</h3>
                {bajo && <StatusBadge tone="amber"><AlertTriangle className="w-3 h-3 inline -mt-0.5" /> Stock bajo</StatusBadge>}
              </div>
              <p className="text-2xl font-black text-foreground tabular-nums" data-testid="deposito-cantidad">
                {formatCantidad(d.chlorine_type, d.quantity)}
              </p>
              <p className="text-xs text-muted-foreground">
                Precio a granel: {d.bulk_price_cents === null ? 'sin cargar' : `${formatPesos(d.bulk_price_cents)} ${u.por}`}
                {' · '}Aviso: {d.low_alert === null ? 'sin aviso' : formatCantidad(d.chlorine_type, d.low_alert)}
              </p>
              {isOwner && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setAbierto({ modo: 'contar', dep: d })} data-testid="deposito-contar">Contar</Button>
                  <Button size="sm" variant="outline" onClick={() => setAbierto({ modo: 'merma', dep: d })} data-testid="deposito-merma">Merma</Button>
                  <Button size="sm" variant="outline" onClick={() => setAbierto({ modo: 'config', dep: d })} data-testid="deposito-config">Precio y aviso</Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {abierto && <DepositoDialogo modo={abierto.modo} dep={abierto.dep} onClose={() => setAbierto(null)} />}
    </Panel>
  );
}

function DepositoDialogo({ modo, dep, onClose }: { modo: Modo; dep: Deposito; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cantidad, setCantidad] = useState(modo === 'contar' ? coma(dep.quantity) : '');
  const [nota, setNota] = useState('');
  const [precio, setPrecio] = useState(dep.bulk_price_cents === null ? '' : coma(dep.bulk_price_cents / 100));
  const [aviso, setAviso] = useState(coma(dep.low_alert));
  const [error, setError] = useState('');
  const u = DEPOSITO_UNIDAD[dep.chlorine_type];
  const nombre = DEPOSITO_LABEL[dep.chlorine_type];

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const r = modo === 'contar'
        ? await contarCloroAction(dep.chlorine_type, cantidad, nota)
        : modo === 'merma'
          ? await sacarMermaAction(dep.chlorine_type, cantidad, nota)
          : await configurarDepositoAction(dep.chlorine_type, precio, aviso);
      if ('error' in r && r.error) { setError(r.error); return; }
      toast.success(modo === 'contar' ? 'Conteo guardado' : modo === 'merma' ? 'Merma registrada' : 'Precio y aviso guardados');
      onClose();
      router.refresh();
    });
  };

  const titulo = modo === 'contar' ? `Contar ${nombre.toLowerCase()}` : modo === 'merma' ? `Merma de ${nombre.toLowerCase()}` : `Precio y aviso: ${nombre.toLowerCase()}`;
  const descripcion = modo === 'contar'
    ? 'Escribí cuánto hay de verdad en el depósito. El sistema ajusta la diferencia y la deja en Movimientos.'
    : modo === 'merma'
      ? 'Cloro que sale sin venta: se rompió, se venció, se regaló o se usó en casa.'
      : 'El precio de lista a granel se propone en la venta rápida (si el cliente no tiene un precio propio).';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ background: 'var(--card)' }} className="backoffice max-w-md">
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription>{descripcion}</DialogDescription>
        <form onSubmit={guardar} className="space-y-4" data-testid={`dialogo-${modo}`}>
          {modo !== 'config' ? (
            <>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">{modo === 'contar' ? `Cuánto hay (${u.plural})` : `Cuánto sale (${u.plural})`}</span>
                <input className={input} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required autoFocus data-testid="deposito-cantidad-input" />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">{modo === 'merma' ? 'Motivo' : 'Nota (opcional)'}</span>
                <input className={input} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} required={modo === 'merma'}
                  placeholder={modo === 'merma' ? 'Ej: se rompió un bidón' : 'Ej: conteo de fin de mes'} data-testid="deposito-nota" />
              </label>
            </>
          ) : (
            <>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Precio a granel ($ {u.por})</span>
                <input className={input} inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: 1.500" data-testid="deposito-precio" />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Avisar cuando queden ({u.plural})</span>
                <input className={input} inputMode="decimal" value={aviso} onChange={(e) => setAviso(e.target.value)} placeholder="Ej: 20" data-testid="deposito-aviso" />
              </label>
              <p className="text-xs text-muted-foreground">Dejá un campo vacío para no usarlo.</p>
            </>
          )}
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={pending} data-testid="deposito-guardar">{pending ? 'Guardando...' : 'Guardar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
