'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Droplets, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { registrarServiceAction, editarRegistroAction, borrarRegistroAction } from '../../actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CHLORINE_PICKER, CHLORINE_RULES, isChlorineType, isValidChlorineAmount, stepChlorine, type ChlorineType,
} from '@/lib/chlorine';

export type Registro = {
  id: string;
  isMine: boolean;
  author: string;
  time: string;
  edited: boolean;
  chlorineType: string | null;
  chlorineAmount: number | null;
  chlorineText: string | null;
  notes: string | null;
};

// Opciones de cloro en botones grandes (se tocan con el dedo, sin desplegar una lista)
const OPCIONES: { value: ChlorineType | null; label: string }[] = [
  { value: null, label: 'Sin cloro' },
  { value: 'liquido', label: 'Líquido' },
  { value: 'granulado', label: 'Granulado' },
  { value: 'pastilla', label: 'Pastillas' },
];

// Etiqueta de la cantidad según la unidad del tipo de cloro
const AMOUNT_LABEL: Record<ChlorineType, string> = {
  liquido: 'Litros',
  granulado: 'Gramos',
  pastilla: 'Cantidad de pastillas',
};
const AMOUNT_HINT: Record<ChlorineType, string> = {
  liquido: 'En litros, aproximado (hasta 500)',
  granulado: 'En gramos, aproximado (hasta 50.000)',
  pastilla: 'Podés poner medias: 0.5, 1, 1.5… (hasta 100)',
};
const UNIDAD: Record<ChlorineType, string> = { liquido: ' L', granulado: ' g', pastilla: '' };

const fmt = (n: number) => String(n).replace('.', ',');

type Props =
  | { mode: 'new'; itemId: string; firstRecord: boolean; onCancel: () => void; onSaved?: () => void }
  | { mode: 'edit'; registro: Registro; onCancel: () => void };

/**
 * Formulario de un registro de service: cloro (opcional, en su unidad) y observaciones.
 * Se usa en la hoja "¿Qué se hizo?" (desde la ruta o desde la pileta) y para corregir un registro.
 */
export function RegistroForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Un id por envío: si el mismo envío llega dos veces (doble toque, reintento), la base guarda uno solo
  const [requestId] = useState(() => crypto.randomUUID());

  const initial = props.mode === 'edit' ? props.registro : null;
  const [type, setType] = useState<ChlorineType | null>(
    initial?.chlorineType && isChlorineType(initial.chlorineType) ? initial.chlorineType : null,
  );
  const [amount, setAmount] = useState(initial?.chlorineAmount != null ? String(initial.chlorineAmount) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const parsedAmount = amount.trim() === '' ? null : Number(amount.replace(',', '.'));

  const chooseType = (next: ChlorineType | null) => {
    if (next !== type) setAmount('');
    setType(next);
  };
  const step = (direction: 1 | -1) => {
    if (!type) return;
    const next = stepChlorine(type, parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null, direction);
    setAmount(next === 0 ? '' : String(next));
  };

  const submit = () => {
    const parsed = type ? parsedAmount : null;
    if (type && parsed !== null && !isValidChlorineAmount(type, parsed)) {
      toast.error('Cantidad de cloro inválida');
      return;
    }
    const data = { chlorineType: type, chlorineAmount: parsed, notes };

    startTransition(async () => {
      const result = props.mode === 'new'
        ? await registrarServiceAction(props.itemId, requestId, data)
        : await editarRegistroAction(props.registro.id, data);
      if ('error' in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (props.mode === 'edit') {
        toast.success('Registro actualizado');
        props.onCancel();
        router.refresh();
      } else if (props.firstRecord) {
        toast.success('¡Pileta marcada como hecha!');
        if (props.onSaved) {
          props.onSaved();
          router.refresh();
        } else {
          router.push('/employee/itinerario');
        }
      } else {
        toast.success('Registro agregado');
        props.onCancel();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-5" data-testid="registro-form">
      {props.mode === 'edit' && <h2 className="bo-panel-title">Corregir el registro</h2>}

      {/* Cloro: tipo en botones grandes */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground" id="cloro-label">Cloro aplicado</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="cloro-label">
          {OPCIONES.map((o) => {
            const active = type === o.value;
            return (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseType(o.value)}
                disabled={pending}
                className={cn(
                  'flex h-14 items-center justify-center gap-2 rounded-xl border-2 text-[15px] font-semibold transition-colors',
                  active ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {o.value && <Droplets className="h-4 w-4" />}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cantidad: − y +, el número a mano y valores rápidos */}
      {type && (
        <div className="space-y-2" data-testid="cloro-cantidad">
          <Label className="text-sm font-semibold" htmlFor="chlorine-amount">{AMOUNT_LABEL[type]}</Label>
          <div className="flex items-center gap-2">
            <button type="button" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-border bg-card text-foreground hover:bg-muted" onClick={() => step(-1)} disabled={pending} aria-label="Menos" title="Menos">
              <Minus className="h-5 w-5" />
            </button>
            <Input
              id="chlorine-amount"
              className="h-14 flex-1 text-center text-xl font-bold tabular-nums"
              type="number"
              inputMode="decimal"
              min="0"
              max={CHLORINE_RULES[type].max}
              step={type === 'liquido' ? 'any' : CHLORINE_RULES[type].step}
              placeholder="—"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button type="button" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-border bg-card text-foreground hover:bg-muted" onClick={() => step(1)} disabled={pending} aria-label="Más" title="Más">
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {CHLORINE_PICKER[type].rapidos.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                disabled={pending}
                data-testid="cloro-rapido"
                className={cn(
                  'h-11 rounded-lg border text-sm font-semibold tabular-nums transition-colors',
                  parsedAmount === v ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {fmt(v)}{UNIDAD[type]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{AMOUNT_HINT[type]}. Si no sabés cuánto, dejalo vacío.</p>
        </div>
      )}

      {/* Observaciones */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold" htmlFor="registro-notas">Observaciones (opcional)</Label>
        <Textarea
          id="registro-notas"
          placeholder="Agua muy verde, roto el skimmer..."
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex gap-2.5">
        <Button variant="outline" className="h-12 flex-1" onClick={props.onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button className="h-12 flex-1 bg-[#28745b] hover:bg-[#1f5c48]" onClick={submit} disabled={pending}>
          {pending ? 'Guardando...' : props.mode === 'edit' ? 'Guardar cambios' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}

/** Un registro de la visita. Los propios de los últimos 7 días se pueden corregir o borrar. */
export function RegistroCard({ registro, canEdit }: { registro: Registro; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <div className="p-4">
        <RegistroForm mode="edit" registro={registro} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  const remove = () => {
    startTransition(async () => {
      const result = await borrarRegistroAction(registro.id);
      if ('error' in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Registro borrado');
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className="px-5 py-3.5" data-testid="registro">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {registro.author} · {registro.time}
          {registro.edited && <span className="text-xs text-muted-foreground font-normal"> (corregido)</span>}
        </p>
        {canEdit && !confirming && (
          <div className="flex gap-1.5">
            <button type="button" className="bo-icon-btn" title="Editar registro" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil />
            </button>
            <button type="button" className="bo-icon-btn" title="Borrar registro" onClick={() => setConfirming(true)} disabled={pending}>
              <Trash2 />
            </button>
          </div>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
        <Droplets className="w-3.5 h-3.5 text-primary shrink-0" />
        {registro.chlorineText ?? 'Sin cloro'}
      </p>
      {registro.notes && <p className="text-xs text-muted-foreground italic mt-1 whitespace-pre-line">{registro.notes}</p>}

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#efd0d2] bg-[#fbefef] p-3">
          <p className="text-sm text-[#8c3c41] flex-1 min-w-40">¿Borrar este registro? Si es el único, la pileta vuelve a pendiente.</p>
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>No</Button>
          <Button size="sm" className="bg-[#ad4d52] hover:bg-[#8c3c41]" onClick={remove} disabled={pending}>
            {pending ? 'Borrando...' : 'Sí, borrar'}
          </Button>
        </div>
      )}
    </div>
  );
}
