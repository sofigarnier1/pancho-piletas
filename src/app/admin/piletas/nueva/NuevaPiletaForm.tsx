'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createPoolAction } from '../actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

type State = { error?: string; success?: boolean; poolId?: string } | null;

type Cliente = { id: string; full_name: string };

type Props = { clientes: Cliente[]; defaultClientId?: string };

export function NuevaPiletaForm({ clientes, defaultClientId }: Props) {
  const router = useRouter();
  const [clientId, setClientId] = useState(defaultClientId ?? '');
  const [poolType, setPoolType] = useState('');

  const [state, action, pending] = useActionState<State, FormData>(
    createPoolAction as unknown as (state: State, formData: FormData) => Promise<State>,
    null
  );

  useEffect(() => {
    if (state?.success && state.poolId) {
      router.push('/admin/clientes');
    }
  }, [state, router]);

  return (
    <form action={action} className="space-y-5 bo-panel p-5 sm:p-6">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="pool_type" value={poolType} />

      <div className="space-y-1.5">
        <Label>Titular *</Label>
        <Select value={clientId} onValueChange={setClientId} required>
          <SelectTrigger>
            <SelectValue placeholder="Seleccioná un cliente" />
          </SelectTrigger>
          <SelectContent>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" placeholder="Av. Maipú 1234" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nickname">Alias (opcional)</Label>
          <Input id="nickname" name="nickname" placeholder="Casa, Country..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="neighborhood">Barrio</Label>
          <Input id="neighborhood" name="neighborhood" placeholder="San Isidro" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tipo de pileta</Label>
        <Select value={poolType} onValueChange={setPoolType}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccioná (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fibra">Fibra</SelectItem>
            <SelectItem value="hormigon">Hormigón</SelectItem>
            <SelectItem value="liner">Liner</SelectItem>
            <SelectItem value="otro">Otro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" placeholder="Observaciones, acceso, materiales usuales..." rows={2} />
      </div>

      {state?.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <Button type="submit" disabled={pending || !clientId} className="w-full">
        {pending ? 'Creando...' : 'Crear pileta'}
      </Button>
    </form>
  );
}
