'use client';

// Cargar mercadería en tres toques: qué llegó (Líquido, Granulado, Pastillas u Otro producto) → en qué
// presentación (o A granel) → cuánto. El costo, el proveedor y la nota son opcionales.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Droplet, Package, Pill, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CHLORINE_TYPES, DEPOSITO_UNIDAD, TIPO_LABEL, cantidadValida, formatCantidad, isChlorineType, parseCantidad, type ChlorineType,
} from '@/lib/cloro';
import { ingresarStockAction } from '../deposito-actions';

export type ProductoCarga = {
  id: string; name: string; chlorine_type: string; chlorine_content: number | string | null; stock_units: number; unit: string;
};

type Que = ChlorineType | 'otro';
const ICONO: Record<Que, typeof Droplet> = { liquido: Droplet, granulado: Sparkles, pastilla: Pill, otro: Package };
const input = 'h-11 w-full rounded-md border border-input bg-card px-3 text-base text-foreground';

export function CargarForm({ productos, stock }: { productos: ProductoCarga[]; stock: Record<string, number> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [que, setQue] = useState<Que | null>(null);
  /** id de la presentación u "otro producto", o 'granel'. */
  const [presentacion, setPresentacion] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');

  const presentaciones = isChlorineType(que)
    ? productos.filter((p) => p.chlorine_type === que && p.chlorine_content != null)
    : [];
  const otros = productos.filter((p) => p.chlorine_content == null);
  const elegido = productos.find((p) => p.id === presentacion) ?? null;
  const aGranel = presentacion === 'granel';

  const n = parseCantidad(cantidad);
  const tipo = isChlorineType(que) ? que : null;
  const suma = tipo && n !== null
    ? aGranel ? n : elegido?.chlorine_content != null ? n * Number(elegido.chlorine_content) : null
    : null;
  const valida = aGranel ? cantidadValida(tipo, n) : n !== null && Number.isInteger(n) && n > 0;

  const elegirQue = (q: Que) => { setQue(q); setPresentacion(null); setError(''); };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const r = await ingresarStockAction({
        tipo: tipo, productId: aGranel ? null : presentacion, cantidad, costo, proveedor, nota,
      });
      if (r.error) { setError(r.error); return; }
      toast.success('Mercadería cargada');
      setCantidad(''); setCosto(''); setNota('');
      router.refresh();
    });
  };

  return (
    <form onSubmit={guardar} className="bo-panel p-5 sm:p-6 space-y-6" data-testid="cargar-form">
      <fieldset className="space-y-2">
        <legend className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">1. Qué llegó</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([...CHLORINE_TYPES, 'otro'] as Que[]).map((q) => {
            const Icono = ICONO[q];
            return (
              <button
                key={q} type="button" onClick={() => elegirQue(q)} data-testid={`cargar-${q}`}
                className={cn('rounded-xl border p-4 text-left transition-colors', que === q ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
              >
                <Icono className="w-5 h-5 text-primary mb-2" />
                <span className="block font-semibold text-sm">{q === 'otro' ? 'Otro producto' : TIPO_LABEL[q]}</span>
                {q !== 'otro' && <span className="block text-xs text-muted-foreground mt-0.5">Hay {formatCantidad(q, stock[q] ?? 0)}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {que && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">2. {que === 'otro' ? 'Qué producto' : 'Cómo viene'}</legend>
          <div className="flex flex-wrap gap-2">
            {que !== 'otro' && (
              <button type="button" onClick={() => setPresentacion('granel')} data-testid="cargar-granel"
                className={cn('rounded-lg border px-4 py-2.5 text-sm font-medium', aGranel ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}>
                A granel ({DEPOSITO_UNIDAD[que].plural})
              </button>
            )}
            {(que === 'otro' ? otros : presentaciones).map((p) => (
              <button key={p.id} type="button" onClick={() => setPresentacion(p.id)} data-testid="cargar-presentacion"
                className={cn('rounded-lg border px-4 py-2.5 text-sm font-medium', presentacion === p.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}>
                {p.name}
              </button>
            ))}
          </div>
          {que !== 'otro' && presentaciones.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No hay presentaciones con contenido cargado para este cloro. Cargalo a granel, o completá el “Contenido” en el producto.
            </p>
          )}
        </fieldset>
      )}

      {presentacion && (
        <fieldset className="space-y-4">
          <legend className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">3. Cuánto</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">
                {aGranel && tipo ? `Cantidad (${DEPOSITO_UNIDAD[tipo].plural})` : 'Cantidad (unidades)'}
              </span>
              <input className={input} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required autoFocus data-testid="cargar-cantidad" />
              {suma !== null && tipo && valida && (
                <span className="block text-xs text-muted-foreground" data-testid="cargar-suma">
                  Suma {formatCantidad(tipo, suma)} al depósito (queda en {formatCantidad(tipo, (stock[tipo] ?? 0) + suma)}).
                </span>
              )}
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Costo total ($, opcional)</span>
              <input className={input} inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Ej: 85.000" data-testid="cargar-costo" />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Proveedor (opcional)</span>
              <input className={input} value={proveedor} onChange={(e) => setProveedor(e.target.value)} maxLength={120} data-testid="cargar-proveedor" />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Nota (opcional)</span>
              <input className={input} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} data-testid="cargar-nota" />
            </label>
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" disabled={pending || !valida} className="w-full h-11" data-testid="cargar-guardar">
            {pending ? 'Guardando...' : 'Guardar ingreso'}
          </Button>
        </fieldset>
      )}
    </form>
  );
}
