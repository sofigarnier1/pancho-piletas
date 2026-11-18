'use client';

import { LayoutDashboard } from 'lucide-react';
import { useAuthStore } from '@/state/auth.store';
import { esModoCampo } from '@/lib/campo';
import { PortalHeader } from './PortalHeader';

// El menú del empleado (Hoy, Ayuda) va fijo abajo: EmployeeBottomNav. Arriba quedan la marca,
// el saludo, la ayuda rápida (?) y Cerrar sesión. En modo campo (dueño), también el enlace al backoffice.
export function EmployeeHeader() {
  const { user } = useAuthStore();
  return (
    <PortalHeader
      homeHref="/employee/itinerario"
      nav={esModoCampo(user?.role) ? [{ href: '/admin/dashboard', label: 'Backoffice', icon: LayoutDashboard }] : []}
      manualHref="/employee/ayuda"
      greeting={user ? `Hola, ${user.fullName}` : undefined}
      width="max-w-2xl"
    />
  );
}
