'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateProductAction } from '../../actions';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { ProductVista } from '../../ProductVista';
import { CamposStockProducto } from '../../CamposStockProducto';
import type { LandingProduct } from '@/lib/supabase/landing-products';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type State = { error?: string; success?: boolean } | null;

export type EditableProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  promo_label: string | null;
  is_featured: boolean;
  display_order: number;
  price_cents: number;
  in_stock: boolean;
  chlorine_type: string;
  unit: string;
  weight_kg: number | null;
  chlorine_content: number | string | null;
  category: string | null;
  low_stock_alert: number | null;
};

export function EditarProductoForm({ product, siblings = [], canSetContent }: { product: EditableProduct; siblings?: LandingProduct[]; canSetContent: boolean }) {
  const router = useRouter();
  const [chlorineType, setChlorineType] = useState(product.chlorine_type);
  const [unit, setUnit] = useState(product.unit);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [price, setPrice] = useState(String(product.price_cents / 100));
  const [weightKg, setWeightKg] = useState(product.weight_kg == null ? '' : String(product.weight_kg));
  const [promoLabel, setPromoLabel] = useState(product.promo_label ?? '');
  const [isFeatured, setIsFeatured] = useState(product.is_featured);
  const [inStock, setInStock] = useState(product.in_stock);
  const [imageUrl, setImageUrl] = useState(product.image_url ?? '');
  const [state, action, pending] = useActionState<State, FormData>(
    updateProductAction.bind(null, product.id) as unknown as (state: State, formData: FormData) => Promise<State>,
    null
  );

  useEffect(() => {
    if (state?.success) router.push('/admin/stock');
  }, [state, router]);

  const priceCents = Math.round(parseFloat(price) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
    <form action={action} className="space-y-5 bo-panel p-5 sm:p-6">
      <input type="hidden" name="chlorine_type" value={chlorineType} />
      <input type="hidden" name="unit" value={unit} />
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre *</Label>
        <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label>Foto</Label>
        <ImageUpload name="image_url" value={imageUrl} onChange={setImageUrl} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo de cloro *</Label>
          <Select value={chlorineType} onValueChange={setChlorineType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pastilla">Pastilla</SelectItem>
              <SelectItem value="granulado">Granulado</SelectItem>
              <SelectItem value="liquido">Líquido</SelectItem>
              <SelectItem value="combo">Combo</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Unidad</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kg">kg</SelectItem>
              <SelectItem value="litro">litro</SelectItem>
              <SelectItem value="unidad">unidad</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="price">Precio ($) *</Label>
          <Input id="price" name="price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weight_kg">Peso (kg)</Label>
          <Input id="weight_kg" name="weight_kg" type="number" min="0" step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="Opcional" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="display_order">Orden en la landing</Label>
        <Input id="display_order" name="display_order" type="number" min="0" defaultValue={product.display_order} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="promo_label">Etiqueta promo</Label>
        <Input id="promo_label" name="promo_label" value={promoLabel} onChange={(e) => setPromoLabel(e.target.value)} placeholder="MÁS VENDIDO, OFERTA..." />
      </div>

      <CamposStockProducto chlorineType={chlorineType} canSetContent={canSetContent} initial={product} />

      <div className="flex items-center gap-2">
        <input type="checkbox" id="in_stock" name="in_stock" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="rounded" />
        <Label htmlFor="in_stock" className="font-normal cursor-pointer">Hay stock en la web</Label>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="is_featured" name="is_featured" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="rounded" />
        <Label htmlFor="is_featured" className="font-normal cursor-pointer">Destacar en la landing</Label>
      </div>

      {state?.error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>

      <div className="lg:sticky lg:top-6">
        <ProductVista
          editingId={product.id}
          siblings={siblings}
          draft={{
            name,
            description: description || null,
            image_url: imageUrl || null,
            promo_label: promoLabel || null,
            is_featured: isFeatured,
            price_cents: Number.isNaN(priceCents) ? 0 : priceCents,
            stock_units: 0,
            in_stock: inStock,
            weight_kg: parseFloat(weightKg) || null,
            unit: unit as LandingProduct['unit'],
            chlorine_type: chlorineType as LandingProduct['chlorine_type'],
          }}
        />
      </div>
    </div>
  );
}
