'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setInStockAction } from './actions';

export function InStockToggle({ productId, inStock }: { productId: string; inStock: boolean }) {
  const [value, setValue] = useState(inStock);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !value;
    setValue(next);
    startTransition(async () => {
      const result = await setInStockAction(productId, next);
      if (result.error) {
        setValue(!next);
        toast.error(result.error);
      }
    });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={toggle}
      disabled={pending}
      aria-label={value ? 'Hay stock' : 'No hay stock'}
      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:opacity-60 ${
        value
          ? 'bg-green-100 text-green-800 hover:bg-green-200'
          : 'bg-muted text-muted-foreground hover:bg-muted/70'
      }`}
    >
      {value ? 'Hay' : 'No hay'}
    </button>
  );
}
