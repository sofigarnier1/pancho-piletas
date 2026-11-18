'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/state/auth.store';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { NAV_ITEMS, ROLE_LABEL, itemActivo } from './admin-nav';

/**
 * Menú lateral del backoffice. En escritorio queda fijo; en celular se abre desde la barra superior
 * (AdminTopbar) dentro de un panel, con el mismo contenido. `onNavigate` cierra ese panel al elegir.
 */
export function AdminSidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const visibleItems = NAV_ITEMS.filter((item) => user?.role && item.roles.includes(user.role));
  const groups = [
    { id: 'general', label: 'General', items: visibleItems.filter((i) => i.group === 'general') },
    { id: 'admin', label: 'Administración', items: visibleItems.filter((i) => i.group === 'admin') },
  ].filter((g) => g.items.length > 0);

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    logout();
    toast.success('Sesión cerrada');
    router.push('/login');
  };

  const name = user?.fullName || user?.email || '';
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '·';

  return (
    <aside
      className={cn(
        'bo-sidebar w-60 shrink-0 flex-col h-full overflow-y-auto px-4 pt-5 pb-4',
        className,
      )}
    >
      {/* Marca */}
      {/* Clorito y las letras directo sobre el agua del menú */}
      <Link href="/admin/dashboard" onClick={onNavigate} className="bo-sidebar-brand-wrap" aria-label="Pancho Piletas, ir al inicio">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo de la marca, igual que en la landing */}
        <img src="/icons/clorito-sin-fondo.png" alt="" width={70} height={64} className="bo-sidebar-clorito" />
        <span className="bo-sidebar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/v3/logo-letras.webp" alt="" width={96} height={46} className="h-[44px] w-auto" />
        </span>
      </Link>

      {/* Navegación */}
      <nav className="mt-8 flex-1">
        {groups.map((group, gi) => (
          <div key={group.id} className={cn(gi > 0 && 'bo-sidebar-sep mt-4 pt-4 border-t')}>
            <p className="px-3 mb-2 text-[9px] font-semibold tracking-[0.15em] uppercase bo-sidebar-group">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = itemActivo(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'bo-sidebar-link flex items-center gap-3 min-h-10 px-3 py-2 rounded-xl text-[13.5px] transition-colors',
                    )}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--sun)]" aria-hidden="true" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Usuario + cerrar sesión */}
      <div className="bo-sidebar-sep mt-6 pt-4 border-t">
        <div className="flex items-center gap-2.5 px-1 pb-2">
          <span className="grid place-items-center w-8 h-8 rounded-full bg-[var(--sun)] text-[var(--primary-dark)] text-[11px] font-semibold shrink-0" aria-hidden="true">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold bo-sidebar-user truncate">{user?.email}</span>
            <span className="block text-[10px] bo-sidebar-user-role mt-0.5">{user?.role ? ROLE_LABEL[user.role] : ''}</span>
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 min-h-10 px-3 py-2 rounded-xl text-[13px] bo-sidebar-link transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
