import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClientHeader } from '@/components/layout/ClientHeader';
import '../admin/backoffice.css';

// Título de la pestaña: "Mi cuenta · Pancho Piletas" (el de la landing habla de envíos y no corresponde acá).
export const metadata: Metadata = { title: { default: 'Mi cuenta · Pancho Piletas', template: '%s · Pancho Piletas' } };

// Mismo estilo que el backoffice (`.backoffice`).
export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <div className="backoffice min-h-screen">
      <ClientHeader />
      <main className="bo-page max-w-5xl">{children}</main>
    </div>
  );
}
