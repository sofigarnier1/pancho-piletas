import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { EmployeeHeader } from '@/components/layout/EmployeeHeader';
import { EmployeeBottomNav } from '@/components/layout/EmployeeBottomNav';
import '../admin/backoffice.css';

// Título de la pestaña: "Mi día · Pancho Piletas" (el de la landing habla de envíos y no corresponde acá).
export const metadata: Metadata = { title: { default: 'Mi día · Pancho Piletas', template: '%s · Pancho Piletas' } };

// Mismo estilo que el backoffice (`.backoffice`), pensado para usar desde el celular: menú fijo abajo.
export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="backoffice min-h-screen">
      <EmployeeHeader />
      <main className="bo-page max-w-2xl pb-28">{children}</main>
      <EmployeeBottomNav />
    </div>
  );
}
