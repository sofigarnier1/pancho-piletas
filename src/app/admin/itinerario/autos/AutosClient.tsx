'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/admin/bo';
import { createVehicleAction, updateVehicleAction, setVehicleActiveAction } from './actions';

type Vehicle = { id: string; name: string; plate: string | null; is_active: boolean };

function VehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const [name, setName] = useState(vehicle.name);
  const [plate, setPlate] = useState(vehicle.plate ?? '');
  const [pending, start] = useTransition();
  const dirty = name.trim() !== vehicle.name || (plate.trim().toUpperCase() || null) !== vehicle.plate;

  const save = () =>
    start(async () => {
      const r = await updateVehicleAction(vehicle.id, { name, plate });
      if (r.error) toast.error(r.error);
      else toast.success('Auto guardado');
    });

  const toggle = () =>
    start(async () => {
      const r = await setVehicleActiveAction(vehicle.id, !vehicle.is_active);
      if (r.error) toast.error(r.error);
      else toast.success(vehicle.is_active ? 'Auto desactivado' : 'Auto activado');
    });

  return (
    <div data-testid="auto-fila" className={`bo-row flex-wrap ${vehicle.is_active ? '' : 'opacity-60'}`}>
      <div className="flex-1 min-w-[10rem]">
        <Input aria-label="Nombre del auto" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <div className="w-32">
        <Input aria-label="Patente" placeholder="Patente" value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={15} />
      </div>
      <StatusBadge tone={vehicle.is_active ? 'green' : 'gray'}>{vehicle.is_active ? 'Activo' : 'Inactivo'}</StatusBadge>
      <Button type="button" size="sm" disabled={!dirty || pending} onClick={save}>Guardar</Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={toggle}>
        {vehicle.is_active ? 'Desactivar' : 'Activar'}
      </Button>
    </div>
  );
}

export function AutosClient({ vehicles }: { vehicles: Vehicle[] }) {
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [pending, start] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createVehicleAction({ name, plate });
      if (r.error) toast.error(r.error);
      else {
        toast.success('Auto agregado');
        setName('');
        setPlate('');
      }
    });
  };

  return (
    <>
      {vehicles.length > 0 && (
        <div className="bo-rows">
          {vehicles.map((v) => (
            <VehicleRow key={`${v.id}-${v.name}-${v.plate}-${v.is_active}`} vehicle={v} />
          ))}
        </div>
      )}
      <form onSubmit={add} className="bo-form-section border-t border-border">
        <p className="bo-form-title !mb-3">Agregar auto</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[10rem] space-y-1.5">
            <Label htmlFor="auto-nombre">Nombre *</Label>
            <Input id="auto-nombre" placeholder="Auto 1 (Fiorino)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </div>
          <div className="w-32 space-y-1.5">
            <Label htmlFor="auto-patente">Patente</Label>
            <Input id="auto-patente" value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={15} />
          </div>
          <Button type="submit" disabled={pending || !name.trim()}>
            <Plus className="w-4 h-4" />
            Agregar auto
          </Button>
        </div>
      </form>
    </>
  );
}
