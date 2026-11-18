'use client';

import { useTransition, useState } from 'react';
import { unidadConCantidad } from '@/lib/unidad'
import { adjustStockAction } from './actions';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';

export function StockAdjustButtons({
  productId,
  currentStock,
  unit,
}: {
  productId: string;
  currentStock: number;
  unit: string;
}) {
  const [stock, setStock] = useState(currentStock);
  const [pending, startTransition] = useTransition();

  const adjust = (delta: number) => {
    startTransition(async () => {
      const result = await adjustStockAction(productId, delta);
      if (result.error) {
        toast.error(result.error);
      } else {
        setStock(result.newStock ?? stock + delta);
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => adjust(-1)}
        aria-label="Restar 1 al stock"
        disabled={pending || stock <= 0}
        className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted hover:text-primary disabled:opacity-40 transition-colors"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="text-sm font-semibold text-foreground min-w-12 px-1 text-center tabular-nums whitespace-nowrap">
        {unidadConCantidad(stock, unit)}
      </span>
      <button
        onClick={() => adjust(1)}
        aria-label="Sumar 1 al stock"
        disabled={pending}
        className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted hover:text-primary disabled:opacity-40 transition-colors"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}
