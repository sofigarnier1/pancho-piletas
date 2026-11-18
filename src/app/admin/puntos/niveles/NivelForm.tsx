'use client';

import { useState, useTransition, useActionState } from 'react';
import { createLevelAction, updateLevelAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Level = {
  id: string;
  name: string;
  min_points: number;
  benefits: string[];
  color: string;
  sort_order: number;
};

type State = { error?: string; success?: boolean };

export function NuevoNivelForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    createLevelAction as unknown as (state: State, formData: FormData) => Promise<State>,
    {},
  );
  const [, startTransition] = useTransition();

  if (state.success && open) {
    setOpen(false);
    toast.success('Nivel creado');
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="gap-1.5">
        <Plus className="w-4 h-4" />
        Nuevo nivel
      </Button>
    );
  }

  return (
    <LevelFormFields
      action={(fd) => startTransition(() => { void formAction(fd); })}
      onCancel={() => setOpen(false)}
      error={state.error}
      title="Nuevo nivel"
    />
  );
}

export function EditNivelForm({ level }: { level: Level }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    updateLevelAction as unknown as (state: State, formData: FormData) => Promise<State>,
    {},
  );
  const [, startTransition] = useTransition();

  if (state.success && open) {
    setOpen(false);
    toast.success('Nivel actualizado');
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Editar"
      >
        <Pencil className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="mt-3">
      <LevelFormFields
        action={(fd) => { fd.set('id', level.id); startTransition(() => { void formAction(fd); }); }}
        onCancel={() => setOpen(false)}
        error={state.error}
        title="Editar nivel"
        defaultValues={{
          name:       level.name,
          min_points: level.min_points,
          color:      level.color,
          sort_order: level.sort_order,
          benefits:   level.benefits.join('\n'),
        }}
      />
    </div>
  );
}

function LevelFormFields({
  action,
  onCancel,
  error,
  title,
  defaultValues,
}: {
  action: (fd: FormData) => void;
  onCancel: () => void;
  error?: string;
  title: string;
  defaultValues?: { name: string; min_points: number; color: string; sort_order: number; benefits: string };
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 mt-2 text-left">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-sm text-foreground">{title}</p>
        <button type="button" onClick={onCancel}><X className="w-4 h-4 text-muted-foreground" /></button>
      </div>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nombre *</Label>
            <Input name="name" placeholder="Ej: Plata" defaultValue={defaultValues?.name} required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Puntos mínimos *</Label>
            <Input name="min_points" type="number" min="0" defaultValue={defaultValues?.min_points ?? 0} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Color (hex)</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                name="color"
                defaultValue={defaultValues?.color ?? '#1B5FA8'}
                className="w-9 h-9 rounded-lg border border-border cursor-pointer"
              />
              <Input
                name="color_text"
                defaultValue={defaultValues?.color ?? '#1B5FA8'}
                placeholder="#1B5FA8"
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input name="sort_order" type="number" min="0" defaultValue={defaultValues?.sort_order ?? 0} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Beneficios (uno por línea)</Label>
          <Textarea
            name="benefits"
            rows={3}
            placeholder={"5% descuento en compras\nEnvío gratis\nPrioridad en atención"}
            defaultValue={defaultValues?.benefits}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} size="sm" className="flex-1">Cancelar</Button>
          <Button type="submit" size="sm" className="flex-1">Guardar</Button>
        </div>
      </form>
    </div>
  );
}
