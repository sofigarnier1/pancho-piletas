'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// Tablas que mira la pantalla: las visitas del itinerario (estado, quién la cerró) y los registros de service.
// La base solo manda los cambios de las filas que esta persona puede ver (RLS). Migración 29.
const TABLAS = ['itinerary_items', 'service_logs'] as const;

// Juntar los cambios que llegan seguidos (por ejemplo, el registro y la visita que se cierra) en una sola actualización
const ESPERA_MS = 700;
// No repetir el aviso más de una vez cada tanto
const AVISO_CADA_MS = 8000;

type Props = {
  /** Quién mira: los cambios que hace esta misma persona no muestran el aviso (igual se actualiza). */
  userId?: string;
  /** Mostrar "Hay novedades del equipo" cuando llega un cambio de otra persona. */
  aviso?: boolean;
  className?: string;
};

type Fila = { employee_id?: string | null; completed_by?: string | null } | null | undefined;

/**
 * Pantalla en vivo: cuando alguien del equipo marca o registra una pileta, la pantalla se actualiza sola.
 * Muestra el cartelito "En vivo" mientras está conectada; si la conexión se corta, la pantalla sigue andando
 * (solo deja de actualizarse sola: hay que recargar).
 */
export function EnVivo({ userId, aviso = true, className }: Props) {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoAviso = useRef(0);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`en-vivo-${Math.random().toString(36).slice(2)}`);

    const alCambiar = (payload: { new?: Fila; old?: Fila }) => {
      const fila = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Fila;
      const esMio = !!userId && !!fila && (fila.employee_id === userId || fila.completed_by === userId);
      if (aviso && !esMio && Date.now() - ultimoAviso.current > AVISO_CADA_MS) {
        ultimoAviso.current = Date.now();
        toast.info('Hay novedades del equipo: la pantalla se actualizó');
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), ESPERA_MS);
    };

    for (const table of TABLAS) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, alCambiar);
    }

    // Realtime filtra con los permisos de quien mira: hay que darle el token de la sesión antes de suscribirse
    // (si no, entra como anónimo y la base no le manda nada).
    let cancelado = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelado || !session) return;
      await supabase.realtime.setAuth(session.access_token);
      if (cancelado) return;
      channel.subscribe((status: string) => setConectado(status === 'SUBSCRIBED'));
    })();

    return () => {
      cancelado = true;
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, userId, aviso]);

  if (!conectado) return null;
  return (
    <span
      data-testid="en-vivo"
      title="La pantalla se actualiza sola cuando el equipo marca una pileta"
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-[#cfe6da] bg-[#eef6f1] px-2.5 py-1 text-xs font-semibold text-[#28745b]', className)}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2b9270] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2b9270]" />
      </span>
      En vivo
    </span>
  );
}
