'use client';

import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createUserAction } from './actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type State = { error?: string; success?: boolean } | null;

const ROLES: [string, string][] = [
  ['employee', 'Empleado'], ['owner', 'Owner'], ['marketing', 'Marketing'],
  ['super_admin', 'Super Admin'], ['client', 'Cliente'],
];

export function CrearUsuarioForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<State, FormData>(
    createUserAction as unknown as (state: State, formData: FormData) => Promise<State>,
    null
  );

  useEffect(() => {
    if (state?.success) {
      toast.success('Usuario creado. Que elija su contraseña desde ¿Olvidaste tu contraseña? en el ingreso.');
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="bo-panel p-5 space-y-4 mb-5" data-testid="crear-usuario">
      <p className="text-sm font-bold text-foreground">Crear usuario</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nu_full_name">Nombre completo</Label>
          <Input id="nu_full_name" name="full_name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nu_email">Email</Label>
          <Input id="nu_email" name="email" type="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nu_role">Rol</Label>
          <select id="nu_role" name="role" defaultValue="employee" className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      {state?.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
      )}
      <Button type="submit" disabled={pending}>{pending ? 'Creando...' : 'Crear usuario'}</Button>
    </form>
  );
}
