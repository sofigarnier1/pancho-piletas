'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createManualSaleAction } from '../actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/admin/bo';
import { Plus, Store, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { todayInArgentina } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { formatPesos } from '@/lib/precios';
import {
  CHLORINE_TYPES, DEPOSITO_LABEL, DEPOSITO_UNIDAD, TIPO_LABEL, formatCantidad, isChlorineType, parseCantidad, totalLinea,
  type ChlorineType,
} from '@/lib/cloro';

export type ClienteVenta = { id: string; full_name: string; service: boolean; precios: Partial<Record<string, number>> };
export type ProductoVenta = {
  id: string; name: string; price_cents: number; unit: string; chlorine_type: string; chlorine_content: number | string | null;
};
type Granel = Record<string, { precio: number | null; hay: number }>;

/** Qué se vende en la línea: un producto, cloro a granel ("granel:liquido") o algo libre ("__custom__"). */
type LineItem = { sel: string; productName: string; quantity: string; unitPrice: string };

const nueva = (): LineItem => ({ sel: '', productName: '', quantity: '1', unitPrice: '' });
const select = 'h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground';
const granelDe = (sel: string): ChlorineType | null => {
  const t = sel.startsWith('granel:') ? sel.slice(7) : null;
  return isChlorineType(t) ? t : null;
};
const pesosInput = (cents: number | null | undefined) => (cents == null ? '' : String(cents / 100));

export function NuevaVentaForm({ clientes, productos, granel }: { clientes: ClienteVenta[]; productos: ProductoVenta[]; granel: Granel }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modo, setModo] = useState<'cliente' | 'mostrador'>('cliente');
  const [clientId, setClientId] = useState('');
  const [walkinName, setWalkinName] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<LineItem[]>([nueva()]);

  const cliente = modo === 'cliente' ? clientes.find((c) => c.id === clientId) ?? null : null;

  /** Precio del granel: el propio del cliente si tiene; si no, el de lista del depósito. */
  const precioGranel = (t: ChlorineType, c: ClienteVenta | null) => c?.precios[t] ?? granel[t]?.precio ?? null;

  const total = items.reduce((sum, item) => {
    const q = parseCantidad(item.quantity) ?? 0;
    const price = Math.round((parseFloat(item.unitPrice) || 0) * 100);
    return sum + totalLinea(q, price);
  }, 0);

  const repreciar = (c: ClienteVenta | null) =>
    setItems((prev) => prev.map((it) => {
      const t = granelDe(it.sel);
      return t ? { ...it, unitPrice: pesosInput(precioGranel(t, c)) } : it;
    }));

  const cambiarCliente = (id: string) => {
    setClientId(id);
    repreciar(clientes.find((c) => c.id === id) ?? null);
  };
  const cambiarModo = (m: 'cliente' | 'mostrador') => {
    setModo(m);
    repreciar(m === 'cliente' ? clientes.find((c) => c.id === clientId) ?? null : null);
  };

  const elegir = (idx: number, sel: string) => {
    const t = granelDe(sel);
    const prod = productos.find((p) => p.id === sel);
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      if (t) return { sel, productName: `${DEPOSITO_LABEL[t]} a granel`, quantity: item.quantity, unitPrice: pesosInput(precioGranel(t, cliente)) };
      if (prod) {
        const q = parseCantidad(item.quantity);
        return { sel, productName: prod.name, quantity: q && Number.isInteger(q) ? item.quantity : '1', unitPrice: pesosInput(prod.price_cents) };
      }
      return { ...item, sel, productName: sel === '__custom__' ? '' : item.productName };
    }));
  };

  const handleField = (idx: number, field: keyof LineItem, value: string) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  const addItem = () => setItems((prev) => [...prev, nueva()]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    fd.set('modo', modo);
    fd.set('client_id', modo === 'cliente' ? clientId : '');
    fd.set('walkin_name', modo === 'mostrador' ? walkinName : '');
    items.forEach((item, i) => {
      const t = granelDe(item.sel);
      fd.set(`product_id_${i}`, t || item.sel === '__custom__' ? '' : item.sel);
      fd.set(`chlorine_type_${i}`, t ?? '');
      fd.set(`product_name_${i}`, item.productName);
      fd.set(`quantity_${i}`, item.quantity);
      fd.set(`unit_price_${i}`, item.unitPrice);
    });

    startTransition(async () => {
      const result = await createManualSaleAction(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success('Venta registrada');
      // Se vendió más de lo que figuraba en stock: la venta se guardó, pero hay que revisar el inventario
      for (const s of ('shortages' in result && result.shortages) || []) {
        if (s.chlorine_type && s.missing_chlorine !== null) {
          toast.warning(`Faltaba cloro en el depósito para ${s.product_name}: faltaron ${formatCantidad(s.chlorine_type, s.missing_chlorine)}. El depósito quedó en 0.`, { duration: 10000 });
        } else {
          toast.warning(`Stock insuficiente de ${s.product_name}: faltaban ${s.missing} unidad(es). El stock quedó en 0.`, { duration: 10000 });
        }
      }
      router.push('/admin/ventas');
    });
  };

  const listo = modo === 'mostrador' || !!clientId;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bo-panel p-5 sm:p-6" data-testid="venta-form">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="A quién se vende">
        {([['cliente', 'Cliente', User], ['mostrador', 'Mostrador', Store]] as const).map(([m, label, Icono]) => (
          <button
            key={m} type="button" onClick={() => cambiarModo(m)} data-testid={`venta-modo-${m}`} aria-pressed={modo === m}
            className={cn('flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold', modo === m ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}
          >
            <Icono className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {modo === 'cliente' ? (
          <div className="space-y-1.5">
            <Label htmlFor="venta-cliente">Cliente *</Label>
            <select id="venta-cliente" className={cn(select, 'h-10')} value={clientId} onChange={(e) => cambiarCliente(e.target.value)} data-testid="venta-cliente">
              <option value="">Seleccioná cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            {cliente && (
              <div className="flex flex-wrap gap-1.5 pt-1" data-testid="venta-segmento">
                <StatusBadge tone={cliente.service ? 'blue' : 'green'}>{cliente.service ? 'Cliente de service' : 'Solo cloro'}</StatusBadge>
                {Object.keys(cliente.precios).length > 0 && <StatusBadge tone="purple">Tiene precio propio de cloro</StatusBadge>}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="walkin_name">Nombre (opcional)</Label>
            <Input id="walkin_name" value={walkinName} onChange={(e) => setWalkinName(e.target.value)} maxLength={80} placeholder="Quién compra, si querés anotarlo" data-testid="venta-nombre-mostrador" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="sold_at">Fecha</Label>
          <Input id="sold_at" name="sold_at" type="date" defaultValue={todayInArgentina()} />
        </div>
      </div>

      {/* Líneas */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Productos</p>
        {items.map((item, idx) => {
          const t = granelDe(item.sel);
          const prod = productos.find((p) => p.id === item.sel);
          const presentacion = prod && isChlorineType(prod.chlorine_type) && prod.chlorine_content != null ? prod.chlorine_type : null;
          const delDeposito = t ?? presentacion;
          return (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end" data-testid="venta-linea">
              <div className="col-span-12 sm:col-span-4 space-y-1">
                <Label className="text-xs">Producto</Label>
                <select className={select} value={item.sel} onChange={(e) => elegir(idx, e.target.value)} data-testid="venta-producto">
                  <option value="">Seleccioná...</option>
                  <optgroup label="Cloro a granel">
                    {CHLORINE_TYPES.map((tipo) => (
                      <option key={tipo} value={`granel:${tipo}`}>{TIPO_LABEL[tipo]} a granel ({DEPOSITO_UNIDAD[tipo].plural})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Productos">
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                  <option value="__custom__">Otro (manual)</option>
                </select>
              </div>
              <div className="col-span-12 sm:col-span-3 space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input className="h-9 text-sm" placeholder="Descripción" value={item.productName} onChange={(e) => handleField(idx, 'productName', e.target.value)} required data-testid="venta-nombre" />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs">Cant.</Label>
                <Input className="h-9 text-sm" inputMode={t ? 'decimal' : 'numeric'} value={item.quantity} onChange={(e) => handleField(idx, 'quantity', e.target.value)} data-testid="venta-cantidad" />
              </div>
              <div className="col-span-6 sm:col-span-2 space-y-1">
                <Label className="text-xs">Precio $</Label>
                <Input className="h-9 text-sm" type="number" min="0" step="0.01" placeholder="0" value={item.unitPrice} onChange={(e) => handleField(idx, 'unitPrice', e.target.value)} required data-testid="venta-precio" />
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)} aria-label="Quitar línea" className="text-muted-foreground hover:text-destructive transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {delDeposito && (
                <p className="col-span-12 text-xs text-muted-foreground -mt-1" data-testid="venta-deposito">
                  {t ? `Cantidad en ${DEPOSITO_UNIDAD[t].plural}, precio ${DEPOSITO_UNIDAD[t].por}. ` : ''}
                  Sale del depósito: hay {formatCantidad(delDeposito, granel[delDeposito]?.hay ?? 0)}.
                  {t && !item.unitPrice && ' Sin precio a granel: cargalo en Stock o escribilo acá.'}
                </p>
              )}
            </div>
          );
        })}
        <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
          <Plus className="w-4 h-4" /> Agregar línea
        </button>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <p className="text-sm text-muted-foreground">
          Total: <span className="text-lg font-black text-primary-dark" data-testid="venta-total">{formatPesos(total)}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea id="notes" name="notes" placeholder="Observaciones, forma de pago, etc." rows={2} />
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2" data-testid="venta-error">{error}</p>}

      <Button type="submit" disabled={pending || !listo} className="w-full" data-testid="venta-registrar">
        {pending ? 'Registrando...' : 'Registrar venta'}
      </Button>
    </form>
  );
}
