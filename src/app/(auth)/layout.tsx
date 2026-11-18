import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { InstalarApp } from '@/components/InstalarApp';
import './auth.css';

// Título de la pestaña: "Ingresar · Pancho Piletas" (el de la landing habla de envíos y no corresponde acá).
export const metadata: Metadata = { title: { default: 'Ingresar · Pancho Piletas', template: '%s · Pancho Piletas' } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-agua">
      <div className="auth-fondo" aria-hidden="true">
        <div className="auth-rayos" />
        <div className="auth-reflejos" />
      </div>

      <main className="auth-centro">
        <div className="auth-logo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo */}
          <img src="/landing/v3/logo-pancho.webp" alt="" width={200} height={200} />
        </div>
        <div className="auth-contenido">
          {children}
          <InstalarApp />
        </div>
      </main>
    </div>
  );
}
