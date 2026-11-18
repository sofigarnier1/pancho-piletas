'use client';

import { useState, useTransition } from 'react';
import { changeRoleAction } from './actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useConfirmar } from '@/components/ui/confirmar';

const roleLabel: Record<string, string> = {
  super_admin: 'Super Admin', owner: 'Owner', marketing: 'Marketing',
  employee: 'Empleado', client: 'Cliente',
};

export function RoleChangeButton({
  userId,
  currentRole,
  allRoles,
}: {
  userId: string;
  currentRole: string;
  allRoles: string[];
}) {
  const [role, setRole] = useState(currentRole);
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();

  const handleChange = async (newRole: string) => {
    if (newRole === role) return;
    if (!(await confirmar({ titulo: `¿Cambiar el rol a ${roleLabel[newRole] ?? newRole}?`, mensaje: 'Cambia lo que esta persona puede ver y hacer en el sistema.', boton: 'Cambiar rol' }))) return;
    startTransition(async () => {
      const result = await changeRoleAction(userId, newRole);
      if (result.error) {
        toast.error(result.error);
      } else {
        setRole(newRole);
        toast.success('Rol actualizado');
      }
    });
  };

  return (
    <div className="w-36 flex-shrink-0">
      <Select value={role} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="h-9 text-xs bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allRoles.map((r) => (
            <SelectItem key={r} value={r} className="text-xs">
              {roleLabel[r] ?? r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {ventanaConfirmar}
    </div>
  );
}
