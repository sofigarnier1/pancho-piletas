'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { addPoolClientAction, removePoolClientAction, setPoolPrimaryClientAction } from '../actions';
import { Panel, PanelHeader, StatusBadge } from '@/components/admin/bo';
import { Button } from '@/components/ui/button';
import { useConfirmar } from '@/components/ui/confirmar';

export type PoolClient = { id: string; full_name: string; client_number: number | null; is_primary: boolean };
export type ClientOption = { id: string; full_name: string; client_number: number | null };

type Props = { poolId: string; clients: PoolClient[]; options: ClientOption[] };

const label = (c: { full_name: string; client_number: number | null }) =>
  c.client_number ? `N° ${c.client_number} · ${c.full_name}` : c.full_name;

export function PoolClientsPanel({ poolId, clients, options }: Props) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();
  const [toAdd, setToAdd] = useState('');
  const available = options.filter((o) => !clients.some((c) => c.id === o.id));

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else { toast.success(ok); after?.(); }
    });

  return (
    <Panel className="mb-5" testId="pileta-clientes">
      <PanelHeader icon={Users} title={`Clientes de esta pileta (${clients.length})`} bordered />
      <div className="bo-rows">
        {clients.map((c) => (
          <div key={c.id} className="bo-row justify-between" data-testid="pileta-cliente">
            <Link href={`/admin/clientes/${c.id}`} className="text-sm font-medium text-primary hover:underline truncate">
              {label(c)}
            </Link>
            <div className="flex items-center gap-2 flex-shrink-0">
              {c.is_primary ? (
                <StatusBadge tone="blue">Titular</StatusBadge>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={pending}
                    onClick={() => run(() => setPoolPrimaryClientAction(poolId, c.id), 'Titular actualizado')}
                  >
                    Hacer titular
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={pending}
                    onClick={async () => {
                      if (!(await confirmar({ titulo: `¿Quitar a ${c.full_name} de esta pileta?`, mensaje: 'Deja de figurar como cliente de esta pileta. Su cuenta y sus datos no se tocan.', boton: 'Quitar', peligro: true }))) return;
                      run(() => removePoolClientAction(poolId, c.id), 'Cliente quitado de la pileta');
                    }}
                  >
                    Quitar
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="bo-panel-pad flex flex-wrap items-center gap-2 border-t border-border">
        <select
          aria-label="Cliente para sumar"
          value={toAdd}
          onChange={(e) => setToAdd(e.target.value)}
          disabled={pending || available.length === 0}
          className="h-9 flex-1 min-w-48 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground disabled:opacity-50"
        >
          <option value="">{available.length === 0 ? 'No hay otros clientes para sumar' : 'Elegí un cliente...'}</option>
          {available.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
        </select>
        <Button
          size="sm"
          disabled={pending || !toAdd}
          onClick={() => run(() => addPoolClientAction(poolId, toAdd), 'Cliente sumado a la pileta', () => setToAdd(''))}
        >
          Agregar cliente
        </Button>
      </div>
      {ventanaConfirmar}
    </Panel>
  );
}
