'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { updatePoolAction } from '@/app/admin/piletas/actions';
import { POOL_TYPES, POOL_TYPE_LABEL } from '@/lib/clients';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

type State = { error?: string; success?: boolean } | null;
type Props = {
  poolId: string;
  address: string | null;
  neighborhood: string | null;
  nickname: string | null;
  poolType: string | null;
  notes: string | null;
  children: ReactNode;
};

/** Los datos de la pileta; con "Editar pileta" pasan a ser un formulario. */
export function EditPiletaForm({ poolId, address, neighborhood, nickname, poolType, notes, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<State, FormData>(async (prev, formData) => {
    const result = (await updatePoolAction(poolId, prev, formData)) as State;
    if (result?.success) {
      toast.success('Pileta actualizada');
      setEditing(false);
    }
    return result;
  }, null);

  if (!editing) {
    return (
      <>
        {children}
        <button type="button" onClick={() => setEditing(true)} className="bo-link text-sm" data-testid="pileta-editar-abrir">
          <Pencil className="w-3.5 h-3.5" /> Editar pileta
        </button>
      </>
    );
  }

  return (
    <form action={action} className="space-y-4" data-testid="pileta-editar">
      <div className="space-y-1.5">
        <Label htmlFor="edit_address">Dirección</Label>
        <Input id="edit_address" name="address" defaultValue={address ?? ''} maxLength={200} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit_neighborhood">Barrio</Label>
          <Input id="edit_neighborhood" name="neighborhood" defaultValue={neighborhood ?? ''} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit_nickname">Alias</Label>
          <Input id="edit_nickname" name="nickname" defaultValue={nickname ?? ''} maxLength={100} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit_pool_type">Tipo de pileta</Label>
        <select
          id="edit_pool_type"
          name="pool_type"
          defaultValue={poolType ?? ''}
          className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground"
        >
          <option value="">Sin especificar</option>
          {POOL_TYPES.map((t) => <option key={t} value={t}>{POOL_TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit_pool_notes">Notas de la pileta</Label>
        <Textarea id="edit_pool_notes" name="notes" defaultValue={notes ?? ''} rows={2} maxLength={1000} />
      </div>
      {state?.error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? 'Guardando...' : 'Guardar'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
