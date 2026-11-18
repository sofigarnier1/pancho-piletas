'use client';

import { useState, useTransition } from 'react';
import { Car, Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyLastWeekAction } from '../actions';
import { createVehicleAction } from '../autos/actions';
import { Ventana } from '@/components/tabla/Ventana';

/** Copia las piletas, autos, tipos, encargados y equipos del mismo día de la semana anterior. */
export function CopiarSemanaButton({ fecha, destacado }: { fecha: string; destacado?: boolean }) {
  const [pending, startTransition] = useTransition();
  const copiar = () =>
    startTransition(async () => {
      const result = await copyLastWeekAction(fecha);
      if (result.error) toast.error(result.error);
      else toast.success(`${result.count} piletas copiadas de la semana anterior`);
    });

  return (
    <Button variant={destacado ? 'default' : 'outline'} className={destacado ? '' : 'bg-card'} onClick={copiar} disabled={pending} data-testid="copiar-semana">
      <Copy className="w-4 h-4" />
      {pending ? 'Copiando...' : 'Copiar itinerario de la semana anterior'}
    </Button>
  );
}

/** Formulario "Nuevo auto": nombre y patente. Lo usan la tarjeta de abajo y el botón de arriba. */
function NuevoAutoForm({ alTerminar, className, testId }: { alTerminar: () => void; className?: string; testId: string }) {
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [pending, startTransition] = useTransition();

  const guardar = () =>
    startTransition(async () => {
      const r = await createVehicleAction({ name, plate });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Auto agregado');
      setName(''); setPlate(''); alTerminar();
    });

  return (
    <form className={className} onSubmit={(e) => { e.preventDefault(); guardar(); }} data-testid={testId}>
      <Input aria-label="Nombre del auto" placeholder="Ej.: Auto 3 (Partner)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus required />
      <Input aria-label="Patente" placeholder="Patente (opcional)" value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={15} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>{pending ? 'Guardando...' : 'Agregar auto'}</Button>
        <Button type="button" size="sm" variant="outline" onClick={alTerminar}>Cancelar</Button>
      </div>
    </form>
  );
}

/** Botón "Nuevo auto" de arriba de la pantalla: abre el formulario en una ventana, sin bajar hasta la tarjeta. */
export function NuevoAutoBoton() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant="outline" className="bg-card" onClick={() => setAbierto(true)} data-testid="nuevo-auto-arriba">
        <Car className="w-4 h-4" /> Nuevo auto
      </Button>
      <Ventana abierta={abierto} alCerrar={() => setAbierto(false)} titulo="Nuevo auto" descripcion="Aparece enseguida como una tarjeta más en este día.">
        <NuevoAutoForm alTerminar={() => setAbierto(false)} className="space-y-3 px-5 pb-6" testId="nuevo-auto-ventana" />
      </Ventana>
    </>
  );
}

/** Tarjeta "Nuevo auto": se carga ahí mismo, sin ir a la pantalla Autos. */
export function NuevoAutoCard() {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="bo-panel flex min-h-32 flex-col items-center justify-center gap-2 border-dashed text-sm font-semibold text-primary hover:bg-muted"
        data-testid="nuevo-auto-abrir"
      >
        <Car className="w-5 h-5" />
        <span className="inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Nuevo auto</span>
      </button>
    );
  }

  return (
    <div className="bo-panel p-4">
      <p className="bo-form-title !mb-3">Nuevo auto</p>
      <NuevoAutoForm alTerminar={() => setAbierto(false)} className="space-y-3" testId="nuevo-auto" />
    </div>
  );
}
