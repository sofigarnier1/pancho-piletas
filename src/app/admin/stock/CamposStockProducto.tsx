'use client';

// Campos de stock de un producto (migración 34): contenido de cloro, categoría y aviso de stock bajo.
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEPOSITO_UNIDAD, isChlorineType } from '@/lib/cloro';

export function CamposStockProducto({
  chlorineType, canSetContent, initial,
}: {
  chlorineType: string;
  /** Solo el dueño y el súper admin cargan el contenido (cambia de dónde descuenta el producto). */
  canSetContent: boolean;
  initial?: { chlorine_content: number | string | null; category: string | null; low_stock_alert: number | null };
}) {
  const [content, setContent] = useState(initial?.chlorine_content == null ? '' : String(Number(initial.chlorine_content)).replace('.', ','));
  const [category, setCategory] = useState(initial?.category && ['quimicos', 'accesorios', 'otros'].includes(initial.category) ? initial.category : 'otros');
  const esCloro = isChlorineType(chlorineType);
  const usaDeposito = esCloro && content.trim() !== '';

  return (
    <div className="space-y-4 rounded-xl border border-border p-4" data-testid="campos-stock">
      {esCloro && canSetContent && (
        <div className="space-y-1.5">
          <Label htmlFor="chlorine_content">Contenido ({DEPOSITO_UNIDAD[chlorineType].plural})</Label>
          <Input
            id="chlorine_content" name="chlorine_content" inputMode="decimal" value={content}
            onChange={(e) => setContent(e.target.value)} placeholder="Ej: 5 (bidón de 5 litros)"
          />
          <p className="text-xs text-muted-foreground">
            Cuánto cloro trae una unidad. Con contenido, vender este producto descuenta del depósito de cloro.
          </p>
        </div>
      )}
      {esCloro && !canSetContent && initial?.chlorine_content != null && (
        <p className="text-xs text-muted-foreground">Sale del depósito de cloro (el contenido lo carga el dueño).</p>
      )}

      {chlorineType === 'otro' && (
        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <input type="hidden" name="category" value={category} />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quimicos">Químicos</SelectItem>
              <SelectItem value="accesorios">Accesorios</SelectItem>
              <SelectItem value="otros">Otros</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!usaDeposito && (
        <div className="space-y-1.5">
          <Label htmlFor="low_stock_alert">Aviso de stock bajo</Label>
          <Input
            id="low_stock_alert" name="low_stock_alert" type="number" min="0" step="1"
            defaultValue={initial?.low_stock_alert ?? ''} placeholder="Opcional"
          />
          <p className="text-xs text-muted-foreground">Con cuántas unidades se marca como stock bajo.</p>
        </div>
      )}
    </div>
  );
}
