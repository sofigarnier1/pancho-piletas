'use client';

import { LayoutDashboard, ShoppingBag, Wrench, Star } from 'lucide-react';
import { useAuthStore } from '@/state/auth.store';
import { PortalHeader, type PortalNavItem } from './PortalHeader';

const NAV: PortalNavItem[] = [
  { href: '/client/dashboard', label: 'Inicio',    icon: LayoutDashboard },
  { href: '/client/compras',   label: 'Compras',   icon: ShoppingBag },
  { href: '/client/servicios', label: 'Servicios', icon: Wrench },
  { href: '/client/puntos',    label: 'Puntos',    icon: Star },
];

export function ClientHeader() {
  const { user } = useAuthStore();
  return (
    <PortalHeader
      homeHref="/client/dashboard"
      homeLabel="Piletas Pancho, ir al panel"
      nav={NAV}
      manualHref="/client/ayuda"
      greeting={user?.fullName}
      width="max-w-5xl"
      iconOnlyOnPhone
    />
  );
}
