'use client';

import { useState, useTransition, useActionState } from 'react';
import { createRuleAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

const TRIGGERS = [
  { value: 'purchase_online',  label: 'Compra online (e-commerce)' },
  { value: 'purchase_manual',  label: 'Compra por WhatsApp' },
  { value: 'service',          label: 'Service de pileta' },
  { value: 'manual_grant',     label: 'Asignación manual' },
];

type State = { error?: string; success?: boolean };

export function NuevaReglaForm() {
  const [open, setOpen] = useState(false);
  const [triggerType, setTriggerType] = useState('');
  const [state, formAction] = useActionState(
    createRuleAction as unknown as (state: State, formData: FormData) => Promise<State>,
    {},
  );
  const [, startTransition] = useTransition();

  if (state.success && open) {
    setOpen(false);
    toast.success('Regla creada');
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus className="w-4 h-4" />
        Nueva regla
      </Button>
    );
  }

  return (
    <div className="bo-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-bold text-foreground text-sm">Nueva regla de puntos</p>
        <button type="button" onClick={() => setOpen(false)}>
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <form
        action={(fd) => {
          fd.set('trigger_type', triggerType);
          startTransition(() => { void formAction(fd); });
        }}
        className="space-y-4"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nombre *</Label>
            <Input name="name" placeholder="Ej: Puntos por compra online" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de trigger *</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger><SelectValue placeholder="Seleccioná..." /></SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Puntos por cada $100 ARS *</Label>
            <Input name="points_per_100_ars" type="number" min="1" defaultValue="1" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Monto mínimo para aplicar ($)</Label>
            <Input name="min_amount" type="number" min="0" step="0.01" placeholder="0" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Válida desde</Label>
            <Input name="starts_at" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Válida hasta</Label>
            <Input name="ends_at" type="date" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Descripción (opcional)</Label>
          <Textarea name="description" rows={2} placeholder="Detalle para uso interno..." />
        </div>

        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" className="flex-1">
            Crear regla
          </Button>
        </div>
      </form>
    </div>
  );
}
