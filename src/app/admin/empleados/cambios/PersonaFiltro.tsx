'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TODAS = 'todas';

/** Filtra el historial por persona: los cambios que hizo o los de sus registros. */
export function PersonaFiltro({ mes, persona, people }: { mes: string; persona: string | null; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const change = (value: string) => {
    const params = new URLSearchParams({ mes });
    if (value !== TODAS) params.set('persona', value);
    startTransition(() => router.push(`/admin/empleados/cambios?${params.toString()}`));
  };
  return (
    <Select value={persona ?? TODAS} onValueChange={change} disabled={pending}>
      <SelectTrigger className="h-9 w-full sm:w-64" aria-label="Filtrar por persona" data-testid="filtro-persona">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODAS}>Todas las personas</SelectItem>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
