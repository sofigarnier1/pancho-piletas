'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Droplets, Pencil, Plus, RotateCcw, SkipForward, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHLORINE_RULES, isChlorineType, isValidChlorineAmount, type ChlorineType } from '@/lib/chlorine';
import { borrarRegistroDuenoAction, editarRegistroDuenoAction, marcarVisitaDuenoAction, registrarVisitaDuenoAction } from '../actions';

export type RegistroDueno = {
  id: string;
  employeeId: string;
  author: string;
  when: string;
  edited: boolean;
  chlorineType: string | null;
  chlorineAmount: number | null;
  chlorineText: string | null;
  notes: string | null;
};
export type Persona = { id: string; name: string };

const NO_CHLORINE = 'ninguno';
const AMOUNT_LABEL: Record<ChlorineType, string> = { liquido: 'Litros', granulado: 'Gramos', pastilla: 'Cantidad de pastillas' };
const AMOUNT_HINT: Record<ChlorineType, string> = {
  liquido: 'En litros, aproximado (hasta 500)',
  granulado: 'En gramos, aproximado (hasta 50.000)',
  pastilla: 'Podés poner medias: 0.5, 1, 1.5… (hasta 100)',
};

type FormProps = { team: Persona[]; defaultEmployeeId: string; onCancel: () => void; onDone?: () => void } & (
  | { mode: 'new'; itemId: string }
  | { mode: 'edit'; registro: RegistroDueno }
);

/** Registro de service cargado por el dueño: quién lo hizo, cloro (opcional, en su unidad) y observaciones. */
function RegistroDuenoForm(props: FormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestId] = useState(() => crypto.randomUUID());
  const initial = props.mode === 'edit' ? props.registro : null;
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? props.defaultEmployeeId);
  const [chlorineType, setChlorineType] = useState<string>(
    initial?.chlorineType && isChlorineType(initial.chlorineType) ? initial.chlorineType : NO_CHLORINE,
  );
  const [amount, setAmount] = useState(initial?.chlorineAmount != null ? String(initial.chlorineAmount) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const type = isChlorineType(chlorineType) ? chlorineType : null;

  const submit = () => {
    const parsed = type && amount.trim() !== '' ? Number(amount.replace(',', '.')) : null;
    if (type && parsed !== null && !isValidChlorineAmount(type, parsed)) {
      toast.error('Cantidad de cloro inválida');
      return;
    }
    const data = { chlorineType: type, chlorineAmount: parsed, notes };
    startTransition(async () => {
      const result = props.mode === 'new'
        ? await registrarVisitaDuenoAction(props.itemId, requestId, employeeId, data)
        : await editarRegistroDuenoAction(props.registro.id, employeeId, data);
      if ('error' in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(props.mode === 'new' ? 'Service registrado' : 'Registro actualizado');
      props.onCancel();
      props.onDone?.();
      router.refresh();
    });
  };

  return (
    <div className="bo-panel bo-panel-pad space-y-5" data-testid="registro-form">
      <h2 className="bo-panel-title">{props.mode === 'edit' ? 'Corregir el registro' : 'Registrar el service'}</h2>

      <div className="space-y-1.5">
        <Label className="text-xs">Quién lo hizo</Label>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="h-9" aria-label="Quién lo hizo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.team.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Cloro aplicado</Label>
          <Select value={chlorineType} onValueChange={setChlorineType}>
            <SelectTrigger className="h-9" aria-label="Cloro aplicado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CHLORINE}>Sin cloro</SelectItem>
              <SelectItem value="liquido">Líquido</SelectItem>
              <SelectItem value="granulado">Granulado</SelectItem>
              <SelectItem value="pastilla">Pastillas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {type && (
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="chlorine-amount">{AMOUNT_LABEL[type]}</Label>
            <Input
              id="chlorine-amount"
              className="h-9"
              type="number"
              inputMode="decimal"
              min="0"
              max={CHLORINE_RULES[type].max}
              step={type === 'liquido' ? 'any' : CHLORINE_RULES[type].step}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        )}
      </div>
      {type && <p className="text-xs text-muted-foreground -mt-3">{AMOUNT_HINT[type]}. Si no se sabe, dejalo vacío.</p>}

      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="registro-notas">Observaciones (opcional)</Label>
        <Textarea id="registro-notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2.5">
        <Button variant="outline" className="flex-1" onClick={props.onCancel} disabled={pending}>Atrás</Button>
        <Button className="flex-1" onClick={submit} disabled={pending || !employeeId}>
          {pending ? 'Guardando...' : props.mode === 'edit' ? 'Guardar cambios' : 'Confirmar'}
        </Button>
      </div>
    </div>
  );
}

/** Qué puede hacer el dueño con la visita según su estado. */
export function VisitaDuenoAcciones({ itemId, status, team, defaultEmployeeId, alTerminar }: {
  itemId: string; status: string; team: Persona[]; defaultEmployeeId: string;
  /** Se llama después de registrar o marcar la visita (por ejemplo, para cerrar la ventana del Dashboard). */
  alTerminar?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const setStatus = (next: 'skipped' | 'no_client' | 'pending') =>
    startTransition(async () => {
      const result = await marcarVisitaDuenoAction(itemId, next);
      if ('error' in result && result.error) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(next === 'pending' ? 'La visita volvió a pendiente' : next === 'skipped' ? 'Visita salteada' : 'Registrado: no estaba el cliente');
      alTerminar?.();
      router.refresh();
    });

  if (showForm) {
    return <RegistroDuenoForm mode="new" itemId={itemId} team={team} defaultEmployeeId={defaultEmployeeId} onCancel={() => setShowForm(false)} onDone={alTerminar} />;
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="visita-acciones">
      <Button onClick={() => setShowForm(true)} disabled={pending}>
        {status === 'done' ? <Plus /> : <CheckCircle2 />}
        {status === 'done' ? 'Agregar otro registro' : 'Registrar el service'}
      </Button>
      {status === 'pending' && (
        <>
          <Button variant="outline" onClick={() => setStatus('no_client')} disabled={pending}>
            <XCircle />
            No estaba el cliente
          </Button>
          <Button variant="outline" onClick={() => setStatus('skipped')} disabled={pending}>
            <SkipForward />
            Saltear
          </Button>
        </>
      )}
      {(status === 'skipped' || status === 'no_client') && (
        <Button variant="outline" onClick={() => setStatus('pending')} disabled={pending}>
          <RotateCcw />
          Volver a pendiente
        </Button>
      )}
    </div>
  );
}

/** Un registro de la visita: el dueño lo puede corregir o borrar siempre. */
export function RegistroDuenoCard({ registro, team, cambios }: { registro: RegistroDueno; team: Persona[]; cambios?: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <div className="p-3">
        <RegistroDuenoForm mode="edit" registro={registro} team={team} defaultEmployeeId={registro.employeeId} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  const remove = () =>
    startTransition(async () => {
      const result = await borrarRegistroDuenoAction(registro.id);
      if ('error' in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Registro borrado');
      setConfirming(false);
      router.refresh();
    });

  return (
    <div className="px-5 py-3.5" data-testid="registro">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {registro.author} · {registro.when}
          {registro.edited && <span className="text-xs text-muted-foreground font-normal"> (corregido)</span>}
        </p>
        {!confirming && (
          <div className="flex gap-1.5">
            <button type="button" className="bo-icon-btn" aria-label="Editar registro" title="Editar registro" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil />
            </button>
            <button type="button" className="bo-icon-btn" aria-label="Borrar registro" title="Borrar registro" onClick={() => setConfirming(true)} disabled={pending}>
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
      {cambios}

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#efd0d2] bg-[#fbefef] p-3">
          <p className="text-sm text-[#8c3c41] flex-1 min-w-40">¿Borrar este registro? Si es el único, la visita vuelve a pendiente.</p>
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>No</Button>
          <Button size="sm" className="bg-[#ad4d52] hover:bg-[#8c3c41]" onClick={remove} disabled={pending}>
            {pending ? 'Borrando...' : 'Sí, borrar'}
          </Button>
        </div>
      )}
    </div>
  );
}
