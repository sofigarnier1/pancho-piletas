'use client';

import { CartelError } from '@/components/errores/CartelError';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CartelError error={error} onReintentar={reset} />;
}
