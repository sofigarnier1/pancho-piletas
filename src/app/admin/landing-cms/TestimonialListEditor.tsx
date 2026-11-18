'use client';

import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { parseTestimonialItems, type TestimonialItem } from '@/lib/landing-format';

function newItem(): TestimonialItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    zone: '',
    rating: 5,
    text: '',
    image_url: '',
    visible: true,
    authorized: false,
  };
}

// Explica por qué un testimonio no sale en la landing.
function missingReason(item: TestimonialItem): string | null {
  if (!item.name.trim() || !item.text.trim()) return 'Falta nombre o texto';
  if (!item.authorized) return 'Falta marcar la autorización del cliente';
  if (!item.visible) return 'Oculto';
  return null;
}

export function TestimonialListEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const items = parseTestimonialItems(value);
  const save = (next: TestimonialItem[]) => onChange(JSON.stringify(next));
  const update = (id: string, patch: Partial<TestimonialItem>) =>
    save(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    save(next);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Todavía no hay testimonios. Agregá el primero.
        </p>
      )}

      {items.map((item, index) => {
        const reason = missingReason(item);
        return (
          <div key={item.id} className="space-y-3 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.name.trim() || `Testimonio ${index + 1}`}</p>
                <p className={`text-xs ${reason ? 'text-amber-700' : 'text-green-700'}`}>
                  {reason ? `No se publica: ${reason.toLowerCase()}` : 'Se publica en la landing'}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Subir"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label="Bajar"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => save(items.filter((other) => other.id !== item.id))}
                  aria-label="Quitar testimonio"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Nombre</Label>
                <Input value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} placeholder="Nombre real" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Zona</Label>
                <Input value={item.zone} onChange={(e) => update(item.id, { zone: e.target.value })} placeholder="Ej: Tigre" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Estrellas</Label>
              <div className="flex gap-1" role="radiogroup" aria-label="Estrellas">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={item.rating === n}
                    aria-label={`${n} estrellas`}
                    onClick={() => update(item.id, { rating: n })}
                    className="text-primary"
                  >
                    <Star className={`h-5 w-5 ${n <= item.rating ? 'fill-current' : 'opacity-30'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Texto</Label>
              <Textarea rows={3} value={item.text} onChange={(e) => update(item.id, { text: e.target.value })} placeholder="Lo que dijo el cliente" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Foto (opcional)</Label>
              <ImageUpload
                name={`testimonio-${item.id}`}
                folder="testimonios"
                value={item.image_url}
                onChange={(url) => update(item.id, { image_url: url })}
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.authorized}
                  onChange={(e) => update(item.id, { authorized: e.target.checked })}
                  className="rounded"
                />
                Tengo autorización del cliente para publicarlo
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={(e) => update(item.id, { visible: e.target.checked })}
                  className="rounded"
                />
                Mostrar en la landing
              </label>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => save([...items, newItem()])}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5"
      >
        <Plus className="h-4 w-4" />
        Agregar testimonio
      </button>
    </div>
  );
}
