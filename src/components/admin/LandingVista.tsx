'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye } from 'lucide-react';
import '@/components/landing/landing.css';
import '@/components/landing/landing-extra.css';
import './vista.css';
import { ConsultaProvider } from '@/components/landing/consulta';

const FRAME_WIDTH = 1280;

/** Muestra secciones reales de la landing a escala, dentro de un marco de navegador. No se puede tocar (inert). */
export function LandingVista({ children, titulo = 'Vista previa en la landing' }: { children: ReactNode; titulo?: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const next = Math.min(1, outer.clientWidth / FRAME_WIDTH);
      setScale(next);
      setHeight(inner.offsetHeight * next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-2" data-testid="vista-previa">
      <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
        <Eye className="w-3.5 h-3.5" />
        {titulo}
      </p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          <span className="ml-2 flex-1 truncate rounded-md bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
            Pancho Piletas
          </span>
        </div>
        <div ref={outerRef} style={{ height }} className="relative overflow-hidden">
          <div
            ref={innerRef}
            inert
            style={{ width: FRAME_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            className="lv3 lv3-vista absolute left-0 top-0"
          >
            <ConsultaProvider>{children}</ConsultaProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
