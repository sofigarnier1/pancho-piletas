import type { Metadata } from 'next';
import { Comfortaa, Fredoka, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthBootstrap } from '@/components/auth/AuthBootstrap';
import { ErroresGlobales } from '@/components/errores/ErroresGlobales';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const comfortaa = Comfortaa({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-comfortaa',
});

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fredoka',
});

export const metadata: Metadata = {
  title: 'Pancho Piletas - Envíos sin cargo en Zona Norte',
  description:
    'Pastillas triple acción y cloro para piletas con entrega coordinada en Zona Norte, Buenos Aires. Service de mantenimiento y desagote. Pedidos, combos y asesoramiento por WhatsApp.',
  openGraph: {
    title: 'Pancho Piletas',
    description: 'Pastillas triple acción y cloro para piletas con entrega en Zona Norte. Pedidos por WhatsApp.',
    locale: 'es_AR',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${comfortaa.variable} ${fredoka.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans">
        <noscript>
          <style>{'[style*="opacity: 0"]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        <AuthBootstrap />
        <ErroresGlobales />
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
