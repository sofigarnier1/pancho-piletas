'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarCheck, CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Menú fijo abajo del empleado: dos botones grandes, al alcance del pulgar (el empleado ve solo su día: sin calendario ni historial)
const ITEMS = [
  { href: '/employee/itinerario', label: 'Hoy', icon: CalendarCheck, activo: ['/employee/itinerario', '/employee/piletas'] },
  { href: '/employee/ayuda', label: 'Ayuda', icon: CircleHelp, activo: ['/employee/ayuda'] },
];

export function EmployeeBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Menú"
      data-testid="menu-abajo"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-2">
        {ITEMS.map((item) => {
          const active = item.activo.some((p) => pathname.startsWith(p));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('grid h-8 w-14 place-items-center rounded-full', active && 'bg-accent')}>
                <item.icon className="h-5 w-5" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
