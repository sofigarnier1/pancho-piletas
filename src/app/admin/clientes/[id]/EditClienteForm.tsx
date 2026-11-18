'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { updateClientAction } from '../actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

type State = { error?: string; success?: boolean } | null;

type Props = {
  clientId: string;
  fullName: string;
  clientNumber: number | null;
  phone: string | null;
  notes: string | null;
  children: ReactNode;
};

/** Los datos del cliente en la ficha; con "Editar datos" pasan a ser un formulario. */
export function EditClienteForm({ clientId, fullName, clientNumber, phone, notes, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<State, FormData>(async (prev, formData) => {
    const result = (await updateClientAction(clientId, prev, formData)) as State;
    if (result?.success) {
      toast.success('Datos guardados');
      setEditing(false);
    }
    return result;
  }, null);

  if (!editing) {
    return (
      <>
        {children}
        <button type="button" onClick={() => setEditing(true)} className="bo-link text-sm">
          <Pencil className="w-3.5 h-3.5" /> Editar datos
        </button>
      </>
    );
  }

  return (
    <form action={action} className="space-y-4" data-testid="cliente-editar">
      <div className="space-y-1.5">
        <Label htmlFor="edit_full_name">Nombre *</Label>
        <Input id="edit_full_name" name="full_name" defaultValue={fullName} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit_client_number">N° de cliente</Label>
          <Input id="edit_client_number" name="client_number" inputMode="numeric" defaultValue={clientNumber ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit_phone">Teléfono</Label>
          <Input id="edit_phone" name="phone" defaultValue={phone ?? ''} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit_notes">Notas</Label>
        <Textarea id="edit_notes" name="notes" defaultValue={notes ?? ''} rows={2} />
      </div>
      {state?.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Guardando...' : 'Guardar'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
