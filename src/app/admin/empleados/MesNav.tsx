import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Mes } from '@/lib/staff-work';

/** Encabezado de un bloque con el mes y las flechas para ir al anterior o al siguiente. */
export function MesNav({ mes, href, sub }: { mes: Mes; href: (mes: string) => string; sub?: React.ReactNode }) {
  return (
    <div className="bo-panel-header bordered">
      <div>
        <h2 className="bo-panel-title" data-testid="mes">{mes.label}</h2>
        {sub && <p className="bo-panel-sub">{sub}</p>}
      </div>
      <div className="flex gap-1.5">
        <Link href={href(mes.prev)} className="bo-icon-btn" aria-label="Mes anterior" title="Mes anterior">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <Link href={href(mes.next)} className="bo-icon-btn" aria-label="Mes siguiente" title="Mes siguiente">
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
