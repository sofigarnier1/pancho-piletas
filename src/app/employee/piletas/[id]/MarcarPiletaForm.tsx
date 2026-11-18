'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, SkipForward, Plus, RotateCcw, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { marcarPiletaAction } from '../../actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HojaAbajo } from '@/components/layout/HojaAbajo';
import { cn } from '@/lib/utils';
import { RegistroForm } from './RegistroForm';

type Motivo = 'no_client' | 'skipped';

/** Hoja "¿Qué se hizo?": el registro del service con el cloro y la nota. */
function HojaHecha({ abierta, alCerrar, itemId, nombre, firstRecord, alGuardar }: {
  abierta: boolean; alCerrar: () => void; itemId: string; nombre: string; firstRecord: boolean; alGuardar: () => void;
}) {
  return (
    <HojaAbajo abierta={abierta} alCerrar={alCerrar} titulo="¿Qué se hizo?" descripcion={nombre} testId="hoja-hecha">
      {abierta && <RegistroForm mode="new" itemId={itemId} firstRecord={firstRecord} onCancel={alCerrar} onSaved={alGuardar} />}
    </HojaAbajo>
  );
}

const MOTIVOS: { value: Motivo; label: string; sub: string; icon: typeof XCircle; tone: string }[] = [
  { value: 'no_client', label: 'No estaba el cliente', sub: 'No había nadie para abrir', icon: XCircle, tone: 'border-[#efd0d2] bg-[#fbefef] text-[#8c3c41]' },
  { value: 'skipped', label: 'Saltear por hoy', sub: 'Hay que reprogramarla para otro día', icon: SkipForward, tone: 'border-[#efe2c6] bg-[#fcf5e8] text-[#6b4b16]' },
];

/** Hoja "¿Por qué no se pudo?": el motivo (no estaba el cliente o saltear) y una nota opcional para el dueño. */
function HojaNoSePudo({ abierta, alCerrar, itemId, nombre, alGuardar }: {
  abierta: boolean; alCerrar: () => void; itemId: string; nombre: string; alGuardar: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [nota, setNota] = useState('');

  const guardar = () => {
    if (!motivo) return;
    startTransition(async () => {
      const result = await marcarPiletaAction(itemId, motivo, nota);
      if ('error' in result && result.error) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(motivo === 'skipped' ? 'Pileta salteada' : 'Registrado: no estaba el cliente');
      setMotivo(null);
      setNota('');
      alGuardar();
      router.refresh();
    });
  };

  return (
    <HojaAbajo abierta={abierta} alCerrar={alCerrar} titulo="¿Por qué no se pudo?" descripcion={nombre} testId="hoja-no-se-pudo">
      <div className="space-y-5">
        <div className="space-y-2" role="radiogroup" aria-label="Motivo">
          {MOTIVOS.map((m) => {
            const active = motivo === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMotivo(m.value)}
                disabled={pending}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-colors',
                  m.tone,
                  active ? 'ring-2 ring-primary ring-offset-2' : 'opacity-90 hover:opacity-100',
                )}
              >
                <m.icon className="h-6 w-6 shrink-0" />
                <span>
                  <span className="block text-[15px] font-bold">{m.label}</span>
                  <span className="block text-xs opacity-80">{m.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold" htmlFor="motivo-nota">Nota para el dueño (opcional)</Label>
          <Textarea
            id="motivo-nota"
            placeholder="Portón cerrado, llovía, el cliente pidió otro día..."
            rows={2}
            maxLength={500}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>

        <div className="flex gap-2.5">
          <Button variant="outline" className="h-12 flex-1" onClick={alCerrar} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-12 flex-1" onClick={guardar} disabled={pending || !motivo}>
            {pending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </HojaAbajo>
  );
}

/** Los dos botones de una pileta pendiente en la ruta del día: Hecha y No se pudo. */
export function AccionesRuta({ itemId, nombre }: { itemId: string; nombre: string }) {
  const [hoja, setHoja] = useState<'hecha' | 'no' | null>(null);
  const cerrar = () => setHoja(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setHoja('hecha')}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#28745b] text-[15px] font-bold text-white transition-colors hover:bg-[#1f5c48]"
        >
          <CheckCircle2 className="h-5 w-5" />
          Hecha
        </button>
        <button
          type="button"
          onClick={() => setHoja('no')}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card text-[15px] font-bold text-foreground transition-colors hover:bg-muted"
        >
          <Ban className="h-5 w-5" />
          No se pudo
        </button>
      </div>
      <HojaHecha abierta={hoja === 'hecha'} alCerrar={cerrar} itemId={itemId} nombre={nombre} firstRecord alGuardar={cerrar} />
      <HojaNoSePudo abierta={hoja === 'no'} alCerrar={cerrar} itemId={itemId} nombre={nombre} alGuardar={cerrar} />
    </>
  );
}

type Props = { itemId: string; status: string; nombre: string };

/** Qué se puede hacer con una visita de los últimos 7 días desde su pantalla, según su estado. */
export function VisitaAcciones({ itemId, status, nombre }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hoja, setHoja] = useState<'hecha' | 'otro' | 'no' | null>(null);
  const cerrar = () => setHoja(null);
  const volverALaRuta = () => {
    setHoja(null);
    router.push('/employee/itinerario');
  };

  const volverAPendiente = () => {
    startTransition(async () => {
      const result = await marcarPiletaAction(itemId, 'pending');
      if ('error' in result && result.error) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success('La pileta volvió a pendiente');
      router.refresh();
    });
  };

  const hojas = (
    <>
      <HojaHecha abierta={hoja === 'hecha'} alCerrar={cerrar} itemId={itemId} nombre={nombre} firstRecord alGuardar={volverALaRuta} />
      <HojaHecha abierta={hoja === 'otro'} alCerrar={cerrar} itemId={itemId} nombre={nombre} firstRecord={false} alGuardar={cerrar} />
      <HojaNoSePudo abierta={hoja === 'no'} alCerrar={cerrar} itemId={itemId} nombre={nombre} alGuardar={volverALaRuta} />
    </>
  );

  // Ya hecha: se puede sumar otro registro (por ejemplo, si fueron dos)
  if (status === 'done') {
    return (
      <>
        <Button variant="outline" className="h-12 w-full" onClick={() => setHoja('otro')}>
          <Plus />
          Agregar otro registro
        </Button>
        {hojas}
      </>
    );
  }

  // Salteada o sin cliente: se puede corregir
  if (status === 'skipped' || status === 'no_client') {
    return (
      <div className="space-y-2.5">
        <Button className="h-12 w-full bg-[#28745b] hover:bg-[#1f5c48]" onClick={() => setHoja('hecha')} disabled={pending}>
          <CheckCircle2 />
          Al final se hizo: registrar el service
        </Button>
        <Button variant="outline" className="h-12 w-full" onClick={volverAPendiente} disabled={pending}>
          <RotateCcw />
          Volver a pendiente
        </Button>
        {hojas}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="bo-form-title mb-1">¿Qué pasó con esta pileta?</p>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setHoja('hecha')}
          className="flex h-16 items-center justify-center gap-2 rounded-xl bg-[#28745b] text-base font-bold text-white transition-colors hover:bg-[#1f5c48]"
        >
          <CheckCircle2 className="h-5 w-5" />
          Hecha
        </button>
        <button
          type="button"
          onClick={() => setHoja('no')}
          className="flex h-16 items-center justify-center gap-2 rounded-xl border-2 border-border bg-card text-base font-bold text-foreground transition-colors hover:bg-muted"
        >
          <Ban className="h-5 w-5" />
          No se pudo
        </button>
      </div>
      {hojas}
    </div>
  );
}
