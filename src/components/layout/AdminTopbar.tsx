'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { HardHat, Menu } from 'lucide-react';
import { useAuthStore } from '@/state/auth.store';
import { esModoCampo } from '@/lib/campo';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AyudaRapidaBoton } from '@/components/manual/ayuda-rapida';
import { AdminSidebar } from './AdminSidebar';
import { NAV_ITEMS, itemActivo } from './admin-nav';

// Barra superior del backoffice: menú (solo celular/tablet), ubicación actual y ayuda rápida "?".
// La ayuda vive solo acá (una sola instancia): el atajo de teclado "?" la abre y cierra.
export function AdminTopbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuthStore();
  const section = NAV_ITEMS.find((item) => itemActivo(pathname, item));

  return (
    <header className="flex h-14 sm:h-16 shrink-0 items-center gap-3 bo-topbar border-b border-border px-4 sm:px-6 lg:px-9">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Abrir menú"
            className="lg:hidden grid place-items-center w-9 h-9 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
        </SheetTrigger>
        <SheetContent className="backoffice left-0 right-auto w-64 sm:max-w-64 border-l-0 border-r p-0 gap-0 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <AdminSidebar className="flex w-full border-r-0" onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden sm:inline">Administración</span>
        {section && (
          <>
            <span className="hidden sm:inline opacity-40" aria-hidden="true">/</span>
            <span className="font-medium text-foreground truncate">{section.label}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* Modo campo: el dueño usa la pantalla del empleado cuando sale a hacer piletas */}
        {esModoCampo(user?.role) && (
          <Link href="/employee/itinerario" className="bo-btn !h-9" data-testid="modo-campo-boton">
            <HardHat className="w-4 h-4" /> Modo campo
          </Link>
        )}
        <AyudaRapidaBoton
          manualHref="/admin/manual"
          className="border border-border bg-card text-muted-foreground hover:bg-muted hover:text-primary"
        />
      </div>
    </header>
  );
}
