'use client';

import { LandingVista } from '@/components/admin/LandingVista';
import Catalogo from '@/components/landing/Catalogo';
import type { LandingProduct } from '@/lib/supabase/landing-products';

export type ProductDraft = Omit<LandingProduct, 'id'>;

/** El catálogo real de la landing, con el producto que se está editando primero. */
export function ProductVista({ draft, siblings = [], editingId }: { draft: ProductDraft; siblings?: LandingProduct[]; editingId?: string }) {
  const producto: LandingProduct = { ...draft, id: 'vista-previa', name: draft.name || 'Nombre del producto' };
  const otros = siblings.filter((p) => p.id !== editingId);
  return (
    <LandingVista>
      <Catalogo products={[producto, ...otros]} />
    </LandingVista>
  );
}
