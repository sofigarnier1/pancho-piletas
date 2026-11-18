import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminTopbar } from '@/components/layout/AdminTopbar';
import './backoffice.css';

// Título de la pestaña: "Panel · Pancho Piletas" (el de la landing habla de envíos y no corresponde acá).
export const metadata: Metadata = { title: { default: 'Panel · Pancho Piletas', template: '%s · Pancho Piletas' } };

// `.backoffice` acota el estilo del rediseño (colores, tablas, tarjetas) a esta zona: login y landing no cambian.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="backoffice flex h-screen overflow-hidden">
      <AdminSidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
