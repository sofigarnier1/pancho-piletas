'use client';

import { CartelError } from '@/components/errores/CartelError';
import './globals.css';

// Último recurso: se rompió hasta el layout de la app. Reemplaza el layout raíz, por eso trae su propio html/body.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <CartelError error={error} onReintentar={reset} />
      </body>
    </html>
  );
}
