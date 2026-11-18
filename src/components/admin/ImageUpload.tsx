'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const BUCKET = 'landing';
const MAX_SIDE = 1600;

// Achica la foto (las del celular pesan varios MB) y la pasa a WebP antes de subirla.
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la foto'))), 'image/webp', 0.85);
  });
}

type Props = {
  name: string;
  value: string;
  onChange: (url: string) => void;
  folder?: string;
};

export function ImageUpload({ name, value, onChange, folder = 'productos' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Elegí una imagen (JPG, PNG o WebP)');
      return;
    }
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const path = `${folder}/${crypto.randomUUID()}.webp`;
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp' });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (error) {
      toast.error(error instanceof Error ? `No se pudo subir la foto: ${error.message}` : 'No se pudo subir la foto');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de la foto subida */}
          <img src={value} alt="Foto subida" className="h-[72px] w-24 rounded-lg border border-border object-cover" />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {uploading ? 'Subiendo...' : 'Cambiar foto'}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          {uploading ? 'Subiendo...' : 'Subir foto'}
          <span className="text-xs">JPG, PNG o WebP. Se achica sola si es muy grande.</span>
        </button>
      )}
    </div>
  );
}
