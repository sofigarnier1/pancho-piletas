'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Search } from 'lucide-react';
import { createClientAction } from '../actions';
import { Note } from '@/components/admin/bo';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { normalizeName, poolTitle, sameNameClients } from '@/lib/clients';

type State = { error?: string; success?: boolean; userId?: string } | null;

export type ClienteExistente = { id: string; full_name: string; client_number: number | null };
export type PiletaExistente = {
  id: string;
  nickname: string | null;
  address: string | null;
  neighborhood: string | null;
  titular: string | null;
};

type PoolMode = 'new' | 'existing' | 'none';

const MODES: { value: PoolMode; label: string }[] = [
  { value: 'new', label: 'Pileta nueva' },
  { value: 'existing', label: 'Una pileta que ya existe' },
  { value: 'none', label: 'Sin pileta por ahora' },
];

const selectClass = 'h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground';

type Props = { clientes: ClienteExistente[]; piletas: PiletaExistente[]; suggestedNumber: number };

export function NuevoClienteForm({ clientes, piletas, suggestedNumber }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<PoolMode>('new');
  const [poolSearch, setPoolSearch] = useState('');
  const [poolId, setPoolId] = useState('');

  const [state, action, pending] = useActionState<State, FormData>(
    createClientAction as unknown as (state: State, formData: FormData) => Promise<State>,
    null
  );

  useEffect(() => {
    if (state?.success && state.userId) router.push(`/admin/clientes/${state.userId}`);
  }, [state, router]);

  const repetidos = sameNameClients(name, clientes);

  const encontradas = useMemo(() => {
    const q = normalizeName(poolSearch);
    const list = q
      ? piletas.filter((p) => normalizeName([p.nickname, p.address, p.neighborhood, p.titular].filter(Boolean).join(' ')).includes(q))
      : piletas;
    return list.slice(0, 8);
  }, [poolSearch, piletas]);
  const elegida = piletas.find((p) => p.id === poolId);

  return (
    <form action={action} className="space-y-5 bo-panel p-5 sm:p-6">
      <input type="hidden" name="pool_mode" value={mode} />
      <input type="hidden" name="pool_id" value={mode === 'existing' ? poolId : ''} />

      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cliente</p>
      <div className="grid grid-cols-1 gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nombre *</Label>
          <Input id="full_name" name="full_name" placeholder="Ej: Juan García" required value={name} onChange={(e) => setName(e.target.value)} />
          {repetidos.length > 0 && (
            <div data-testid="cliente-nombre-repetido">
              <Note icon={AlertTriangle} tone="amber" className="mt-2">
                Ya hay {repetidos.length === 1 ? 'un cliente llamado' : `${repetidos.length} clientes llamados`} “{repetidos[0].full_name}”
                {repetidos.some((c) => c.client_number) ? ` (N° ${repetidos.map((c) => c.client_number).filter(Boolean).join(', ')})` : ''}.
                Si es otra persona, podés crearlo igual.
              </Note>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="client_number">N° de cliente</Label>
            <Input id="client_number" name="client_number" inputMode="numeric" defaultValue={String(suggestedNumber)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" name="phone" placeholder="+54 9 11 1234-5678" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" placeholder="Cómo paga, horarios, a quién llamar..." rows={2} />
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pileta</p>

        <div className="bo-segmented flex-wrap" role="group" aria-label="Pileta del cliente">
          {MODES.map((m) => (
            <button key={m.value} type="button" data-active={mode === m.value} onClick={() => setMode(m.value)}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'new' && (
          <div className="space-y-4" data-testid="cliente-pileta-nueva">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" name="address" placeholder="Av. Maipú 1234" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="neighborhood">Barrio</Label>
                <Input id="neighborhood" name="neighborhood" placeholder="San Isidro" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nickname">Alias</Label>
                <Input id="nickname" name="nickname" placeholder="Casa, Country..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pool_type">Tipo de pileta</Label>
                <select id="pool_type" name="pool_type" defaultValue="" className={selectClass}>
                  <option value="">Sin elegir</option>
                  <option value="fibra">Fibra</option>
                  <option value="hormigon">Hormigón</option>
                  <option value="liner">Liner</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pool_notes">Notas de la pileta</Label>
              <Textarea id="pool_notes" name="pool_notes" placeholder="Acceso, perro, llave..." rows={2} />
            </div>
            <p className="text-xs text-muted-foreground">El cliente queda como titular de la pileta.</p>
          </div>
        )}

        {mode === 'existing' && (
          <div className="space-y-3" data-testid="cliente-pileta-existente">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                aria-label="Buscar pileta"
                placeholder="Buscar por dirección, barrio o cliente..."
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
                className="bo-search w-full"
              />
            </div>
            {encontradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay piletas que coincidan</p>
            ) : (
              <div className="bo-rows rounded-lg border border-border">
                {encontradas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid="cliente-pileta-opcion"
                    aria-pressed={poolId === p.id}
                    onClick={() => setPoolId(p.id)}
                    className={`bo-row w-full text-left ${poolId === p.id ? 'bg-primary/10' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{poolTitle(p)}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {[p.neighborhood, p.nickname ? p.address : null, p.titular ? `Titular: ${p.titular}` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {elegida ? `Se suma como co-cliente de “${poolTitle(elegida)}”.` : 'Elegí la pileta: el cliente se suma como co-cliente.'}
            </p>
          </div>
        )}
      </div>

      {state?.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <Button type="submit" disabled={pending || (mode === 'existing' && !poolId)} className="w-full">
        {pending ? 'Creando...' : 'Crear cliente'}
      </Button>
    </form>
  );
}
