'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { HardHat, LayoutDashboard, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Panel } from '@/components/admin/bo';
import { AgregarPiletas, type PiletaParaAgregar } from '@/app/admin/itinerario/[fecha]/AgregarPiletas';
import { sumarmeAAutoAction } from '../campo-actions';

type Props = {
  fecha: string;
  autos: { id: string; name: string }[];
  miAuto: string | null;
  piletas: PiletaParaAgregar[];
};

/**
 * Modo campo (solo el dueño y el súper admin): elegir en qué auto va hoy y sumarse piletas a su día.
 * El resto de la pantalla es la misma que ve el empleado.
 */
export function CampoPanel({ fecha, autos, miAuto, piletas }: Props) {
  const [pending, startTransition] = useTransition();

  const cambiarAuto = (value: string) =>
    startTransition(async () => {
      const r = await sumarmeAAutoAction(value || null);
      if (r.error) { toast.error(r.error); return; }
      toast.success(value ? 'Listo: hoy vas en ese auto' : 'Listo: hoy no vas en ningún auto');
    });

  return (
    <Panel className="bo-panel-pad mb-5 border-[#c9d8ec] bg-[#f3f8ff]" testId="modo-campo">
      <div className="flex items-start gap-2.5">
        <HardHat className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Modo campo</p>
          <p className="text-xs text-muted-foreground">Ves tu día como lo ve un empleado: las piletas de tu auto, las tuyas y las que puede hacer cualquiera.</p>
        </div>
        <Link href="/admin/dashboard" className="bo-btn !h-9 flex-shrink-0" data-testid="volver-backoffice">
          <LayoutDashboard className="h-4 w-4" /> <span className="hidden sm:inline">Volver al backoffice</span><span className="sm:hidden">Backoffice</span>
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Hoy voy en
          <select
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
            value={miAuto ?? ''}
            onChange={(e) => cambiarAuto(e.target.value)}
            disabled={pending}
            aria-label="Sumarme a un auto"
            data-testid="campo-auto"
          >
            <option value="">Ningún auto</option>
            {autos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <AgregarPiletas
            fecha={fecha}
            vehicleId={miAuto}
            vehicleName="tu día"
            piletas={piletas}
            campo
            testId="campo-agregar"
            botonClassName="bo-btn bo-btn-primary !h-11 w-full justify-center"
            boton={<><Plus /> Agregar a mi día</>}
          />
        </div>
      </div>
    </Panel>
  );
}
