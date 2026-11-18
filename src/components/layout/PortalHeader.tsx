'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/state/auth.store';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { AyudaRapidaBoton } from '@/components/manual/ayuda-rapida';

export type PortalNavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

/**
 * Barra superior de los portales de empleado y cliente, con el estilo del backoffice (.backoffice).
 * Los textos (marca, menú, saludo) llegan desde EmployeeHeader / ClientHeader.
 */
export function PortalHeader({
  homeHref,
  homeLabel,
  nav,
  manualHref,
  greeting,
  width,
  iconOnlyOnPhone,
}: {
  homeHref: string;
  homeLabel?: string;
  nav: PortalNavItem[];
  manualHref: string;
  greeting?: ReactNode;
  width: string;
  /** En el celular el menú muestra solo íconos (el nombre queda como aria-label) */
  iconOnlyOnPhone?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    logout();
    toast.success('Sesión cerrada');
    router.push('/login');
  };

  return (
    <header className="bo-topbar sticky top-0 z-50 border-b border-border">
      {/* En el celular del empleado el menú baja a una segunda fila a lo ancho (botones más grandes para el dedo) */}
      <div
        className={cn(
          'mx-auto flex items-center gap-3 px-4',
          iconOnlyOnPhone ? 'h-14 sm:h-16' : 'flex-wrap gap-y-2.5 py-2.5 sm:h-16 sm:flex-nowrap sm:py-0',
          width,
        )}
      >
        <Link href={homeHref} aria-label={homeLabel} className="order-1 flex min-w-0 flex-1 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo de la marca, igual que en la landing */}
          <img src="/icons/clorito-sin-fondo.png" alt="" width={48} height={44} className="h-11 w-auto shrink-0" />
          <span className={cn('min-w-0 leading-none', iconOnlyOnPhone && 'hidden sm:block')}>
            <span className="block font-display font-bold text-[15px] tracking-tight text-foreground truncate">
              Piletas Pancho
            </span>
            {greeting && <span className="block mt-1 text-[11px] text-muted-foreground truncate">{greeting}</span>}
          </span>
        </Link>

        {nav.length > 0 && <nav className={cn(iconOnlyOnPhone ? 'order-2' : 'order-3 w-full sm:order-2 sm:w-auto')}>
          <div className={cn('bo-segmented', !iconOnlyOnPhone && 'flex w-full sm:inline-flex sm:w-auto')}>
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={iconOnlyOnPhone ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  data-active={active}
                  className={cn('flex items-center justify-center gap-1.5', !iconOnlyOnPhone && 'flex-1 py-2! sm:flex-none sm:py-1.5!')}
                >
                  <item.icon className="w-4 h-4" />
                  <span className={cn(iconOnlyOnPhone && 'hidden sm:inline')}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>}

        <div className={cn('flex items-center gap-1.5', iconOnlyOnPhone ? 'order-3' : 'order-2 sm:order-3')}>
          <AyudaRapidaBoton manualHref={manualHref} className="text-muted-foreground hover:bg-muted hover:text-primary" />
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="bo-icon-btn"
          >
            <LogOut />
          </button>
        </div>
      </div>
    </header>
  );
}
