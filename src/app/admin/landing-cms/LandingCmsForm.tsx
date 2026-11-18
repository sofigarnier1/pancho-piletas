'use client';

import { useState, useTransition } from 'react';
import { saveSectionAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { TestimonialListEditor } from './TestimonialListEditor';
import { CmsVista } from './CmsVista';
import type { TestimonialItem } from '@/lib/landing-format';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';

type Field = {
  key: string;
  label: string;
  type: 'input' | 'textarea' | 'image' | 'testimonials' | 'switch';
  placeholder?: string;
};

type Section = {
  id: string;
  title: string;
  fields: Field[];
};

const SECTIONS: Section[] = [
  {
    id: 'aviso',
    title: 'Aviso de temporada',
    fields: [
      { key: 'activo', label: 'Mostrar el aviso en la web', type: 'switch' },
      { key: 'texto',  label: 'Texto del aviso', type: 'input', placeholder: 'Ya empezó la temporada: pedí tu cloro antes de que suba la demanda' },
    ],
  },
  {
    id: 'hero',
    title: 'Hero principal',
    fields: [
      { key: 'headline',    label: 'Título principal',   type: 'input',    placeholder: 'Tu pileta limpia. Vos, quedate pancho.' },
      { key: 'subheadline', label: 'Bajada del título',  type: 'textarea', placeholder: 'Cloro, mantenimiento y un lugar para consultar...' },
      { key: 'cta_text',    label: 'Texto del botón CTA', type: 'input',   placeholder: 'Pedir cloro por WhatsApp' },
    ],
  },
  {
    id: 'service',
    title: 'Service de piletas',
    fields: [
      { key: 'titulo',      label: 'Título del service',  type: 'input',    placeholder: 'Vos hacé planes. Nosotros, el mantenimiento.' },
      { key: 'bajada',      label: 'Bajada del service',  type: 'textarea', placeholder: 'Desde el cuidado de cada semana...' },
      { key: 'exclusiones', label: 'Qué no incluye',      type: 'input',    placeholder: 'No hacemos arreglos de piletas...' },
    ],
  },
  {
    id: 'nosotros',
    title: 'Sección Nosotros',
    fields: [
      { key: 'titulo', label: 'Título de la sección', type: 'input',    placeholder: 'Atención directa. Cuidado de verdad.' },
      { key: 'cuerpo', label: 'Texto principal',       type: 'textarea', placeholder: 'Nos contás cómo está tu pileta...' },
      { key: 'stat_years',   label: 'Años de experiencia (ej: 10+)', type: 'input', placeholder: '10+' },
      { key: 'stat_clients', label: 'Clientes (ej: 100+)',           type: 'input', placeholder: '100+' },
    ],
  },
  {
    id: 'testimonios',
    title: 'Testimonios reales',
    fields: [
      { key: 'items', label: 'Lista de testimonios', type: 'testimonials' },
      { key: 'reviews_url', label: 'URL de reseñas externas', type: 'input', placeholder: 'https://...' },
    ],
  },
  {
    id: 'resultado',
    title: 'Caso real — Antes y después',
    fields: [
      { key: 'image_url', label: 'Foto del antes/después', type: 'image', placeholder: '' },
      { key: 'caption', label: 'Aclaración de la imagen', type: 'textarea', placeholder: 'Ej: Caso real en Tigre. Resultado a las 48 horas.' },
      { key: 'case_summary', label: 'Producto, cantidad y tiempo', type: 'textarea', placeholder: 'Ej: Pastillas..., cantidad..., tiempo...' },
    ],
  },
  {
    id: 'footer',
    title: 'Footer — Contacto',
    fields: [
      { key: 'phone',         label: 'Teléfono',          type: 'input', placeholder: '+54 9 11 5110-3245' },
      { key: 'instagram',     label: 'Instagram (handle)', type: 'input', placeholder: '@piletaspancho' },
      { key: 'coverage_text', label: 'Zona de cobertura',  type: 'input', placeholder: 'Zona Norte, Buenos Aires' },
      { key: 'responsible_name', label: 'Responsable del negocio', type: 'input', placeholder: 'Nombre real' },
      { key: 'terms_url', label: 'URL de términos y condiciones', type: 'input', placeholder: 'https://...' },
      { key: 'privacy_url', label: 'URL de política de privacidad', type: 'input', placeholder: 'https://...' },
    ],
  },
  {
    id: 'config',
    title: 'Configuración global',
    fields: [
      { key: 'delivery_days',       label: 'Tiempo de entrega estimado', type: 'input', placeholder: '2-3 días hábiles' },
      { key: 'shipping_cost_cents', label: 'Costo de envío (en centavos — 0 = gratis)', type: 'input', placeholder: '0' },
      { key: 'payment_methods',     label: 'Medios de pago', type: 'input', placeholder: 'Ej: transferencia y efectivo' },
      { key: 'delivery_areas',      label: 'Zonas de entrega', type: 'input', placeholder: 'Ej: Tigre, San Fernando, San Isidro' },
      { key: 'order_minimum',       label: 'Pedido mínimo', type: 'input', placeholder: 'Dejar vacío si no aplica' },
    ],
  },
];

type Props = { initialContent: Record<string, string> };

function SectionEditor({
  section,
  initialContent,
}: {
  section: Section;
  initialContent: Record<string, string>;
}) {
  const [open, setOpen] = useState(section.id === 'hero');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of section.fields) {
      init[f.key] = initialContent[`${section.id}.${f.key}`] ?? '';
    }
    // Testimonios guardados en el formato anterior (3 fijos): pasan a la lista, sin autorización marcada.
    if (section.id === 'testimonios' && !init.items) {
      const legacy: TestimonialItem[] = [1, 2, 3]
        .map((n) => ({
          id: crypto.randomUUID(),
          name: initialContent[`testimonios.t${n}_name`] ?? '',
          zone: initialContent[`testimonios.t${n}_zone`] ?? '',
          rating: Number(initialContent[`testimonios.t${n}_rating`]) || 5,
          text: initialContent[`testimonios.t${n}_text`] ?? '',
          image_url: '',
          visible: true,
          authorized: false,
        }))
        .filter((t) => t.name && t.text);
      if (legacy.length) init.items = JSON.stringify(legacy);
    }
    return init;
  });
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const updates: Record<string, string | number> = {};
      for (const f of section.fields) {
        const raw = values[f.key];
        if (section.id === 'config' && f.key === 'shipping_cost_cents') {
          updates[f.key] = parseInt(raw) || 0;
        } else {
          updates[f.key] = raw;
        }
      }
      const result = await saveSectionAction(section.id, updates);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Sección "${section.title}" guardada`);
      }
    });
  };

  return (
    <div data-testid="cms-seccion" className="bo-panel" style={{ borderLeft: `3px solid ${open ? 'var(--primary)' : 'var(--border)'}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors ${open ? 'bg-muted' : 'hover:bg-muted/60'}`}
      >
        <p className={`font-semibold text-sm ${open ? 'text-primary' : 'text-foreground'}`}>{section.title}</p>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border pt-5 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          {section.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">{field.label}</Label>
              {field.type === 'testimonials' ? (
                <TestimonialListEditor value={values[field.key]} onChange={(v) => setValues((cur) => ({ ...cur, [field.key]: v }))} />
              ) : field.type === 'switch' ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={values[field.key] === '1'}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.checked ? '1' : '0' }))}
                  />
                  {values[field.key] === '1' ? 'Sí, se muestra' : 'No, está apagado'}
                </label>
              ) : field.type === 'image' ? (
                <ImageUpload
                  name={field.key}
                  folder="landing"
                  value={values[field.key]}
                  onChange={(url) => setValues((v) => ({ ...v, [field.key]: url }))}
                />
              ) : field.type === 'textarea' ? (
                <Textarea
                  rows={3}
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              ) : (
                <Input
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          <Button
            onClick={handleSave}
            disabled={pending}
            className="mt-2 gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {pending ? 'Guardando...' : 'Guardar sección'}
          </Button>
        </div>
        <div className="xl:sticky xl:top-6">
          <CmsVista sectionId={section.id} values={values} />
        </div>
        </div>
      )}
    </div>
  );
}

export function LandingCmsForm({ initialContent }: Props) {
  return (
    <div className="space-y-3">
      {SECTIONS.map((section) => (
        <SectionEditor key={section.id} section={section} initialContent={initialContent} />
      ))}
    </div>
  );
}
