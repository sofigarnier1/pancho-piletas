'use client';

import { useState, useTransition } from 'react';
import { assignPointsAction, searchClientsAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search, User, TrendingUp, TrendingDown } from 'lucide-react';

type Client = { id: string; full_name: string; points_balance: number };
type State = { error?: string; success?: boolean };

export function AsignarPuntosForm() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Client | null>(null);
  const [searching, startSearch] = useTransition();
  const [sign, setSign] = useState<'+' | '-'>('+');

  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | undefined>();

  // La acción se llama en el manejador (no en el render ni en un efecto): así el éxito se procesa una
  // sola vez. Antes, `state.success` quedaba en true y el reseteo durante el render entraba en un
  // bucle infinito ("Too many re-renders").
  const submit = (fd: FormData) => {
    startSubmit(async () => {
      const result = (await assignPointsAction(null, fd)) as State;
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      toast.success('Puntos asignados correctamente');
      setSelected(null);
      setQuery('');
      setResults([]);
    });
  };

  const handleSearch = (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    startSearch(async () => {
      const data = await searchClientsAction(q.trim());
      setResults(data);
    });
  };

  return (
    <div className="max-w-lg space-y-5">
      {/* Client search */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground">Cliente *</Label>
        {selected ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{selected.full_name}</p>
              <p className="text-xs text-muted-foreground">{selected.points_balance.toLocaleString('es-AR')} puntos actuales</p>
            </div>
            <button
              type="button"
              onClick={() => { setSelected(null); setQuery(''); setResults([]); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nombre..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelected(c); setResults([]); setQuery(''); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                  >
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">{c.points_balance.toLocaleString('es-AR')} pts</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <p className="text-xs text-muted-foreground mt-1 animate-pulse">Buscando...</p>
            )}
          </div>
        )}
      </div>

      {selected && (
        <form
          action={(fd) => {
            fd.set('client_id', selected.id);
            const raw = parseInt(fd.get('points') as string) || 0;
            fd.set('points', String(sign === '-' ? -Math.abs(raw) : Math.abs(raw)));
            submit(fd);
          }}
          className="space-y-4"
        >
          {/* Points amount */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Cantidad de puntos *</Label>
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSign('+')}
                  className={`px-3 py-2 text-sm font-bold flex items-center gap-1 transition-colors ${
                    sign === '+' ? 'bg-green-500 text-white' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Sumar
                </button>
                <button
                  type="button"
                  onClick={() => setSign('-')}
                  className={`px-3 py-2 text-sm font-bold flex items-center gap-1 transition-colors ${
                    sign === '-' ? 'bg-red-500 text-white' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  Restar
                </button>
              </div>
              <Input
                name="points"
                type="number"
                min="1"
                placeholder="100"
                className="flex-1"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Motivo / notas</Label>
            <Textarea
              name="notes"
              rows={2}
              placeholder="Ej: Compra por WhatsApp del 15/05, Ajuste por error anterior..."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Asignando...' : `${sign === '+' ? 'Sumar' : 'Restar'} puntos`}
          </Button>
        </form>
      )}
    </div>
  );
}
