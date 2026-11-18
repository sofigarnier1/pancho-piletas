import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ShoppingCart,
  Package,
  FileText,
  Star,
  Shield,
  BookOpen,
  UserCheck,
  ClipboardList,
  Wallet,
} from 'lucide-react';
import type { UserRole } from '@/lib/supabase/user';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  /** Grupo del menú: "General" (operación) o "Administración" (contenido y accesos) */
  group: 'general' | 'admin';
  /** Otras direcciones que marcan esta sección como activa. */
  tambien?: string[];
}

// Qué ve cada rol en el menú (la seguridad real está en requireRole() y RLS; esto solo oculta lo que no le sirve)
export const NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard',   label: 'Dashboard',    icon: LayoutDashboard, roles: ['super_admin', 'owner', 'marketing'], group: 'general' },
  { href: '/admin/clientes',    label: 'Clientes y piletas', icon: Users,     roles: ['super_admin', 'owner'],              group: 'general', tambien: ['/admin/piletas'] },
  { href: '/admin/itinerario',  label: 'Itinerario',   icon: CalendarDays,    roles: ['super_admin', 'owner'],              group: 'general' },
  { href: '/admin/services',    label: 'Services',     icon: ClipboardList,   roles: ['super_admin', 'owner'],              group: 'general' },
  { href: '/admin/empleados',   label: 'Empleados',    icon: UserCheck,       roles: ['super_admin', 'owner'],              group: 'general' },
  { href: '/admin/cobros',      label: 'Cobros',       icon: Wallet,          roles: ['super_admin', 'owner'],              group: 'general' },
  { href: '/admin/ventas',      label: 'Ventas',       icon: ShoppingCart,    roles: ['super_admin', 'owner'],              group: 'general' },
  { href: '/admin/stock',       label: 'Stock',        icon: Package,         roles: ['super_admin', 'owner', 'marketing'], group: 'general' },
  { href: '/admin/landing-cms', label: 'Landing CMS',  icon: FileText,        roles: ['super_admin', 'marketing'],          group: 'admin' },
  { href: '/admin/puntos',      label: 'Puntos',       icon: Star,            roles: ['super_admin', 'owner', 'marketing'], group: 'admin' },
  { href: '/admin/roles',       label: 'Roles',        icon: Shield,          roles: ['super_admin'],                       group: 'admin' },
  { href: '/admin/manual',      label: 'Manual',       icon: BookOpen,        roles: ['super_admin', 'owner', 'marketing'], group: 'admin' },
];

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');
/** La sección del menú que corresponde a la página: su dirección o alguna de `tambien` (las fichas de pileta van con Clientes y piletas). */
export const itemActivo = (pathname: string, item: Pick<NavItem, 'href' | 'tambien'>) =>
  isActive(pathname, item.href) || (item.tambien ?? []).some((h) => isActive(pathname, h));

export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super administrador',
  owner: 'Dueño',
  marketing: 'Marketing',
  employee: 'Empleado',
  client: 'Cliente',
};
