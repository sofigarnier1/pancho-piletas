'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Abre el diálogo de impresión del navegador (también sirve para guardar la planilla en PDF). */
export function ImprimirButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer />
      Imprimir
    </Button>
  );
}
