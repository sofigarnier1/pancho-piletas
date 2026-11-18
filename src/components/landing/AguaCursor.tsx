"use client";

import { useEffect, useRef } from "react";

type Burbuja = { x: number; y: number; r: number; vy: number; vx: number; vida: number; t: number };
type Onda = { x: number; y: number; vida: number; t: number; max: number };

/**
 * Efecto "bajo el agua": con mouse, el cursor deja burbujitas y ondas suaves; en el celular, solo
 * al tocar sale una onda. No tapa ni intercepta nada (pointer-events: none), se apaga con
 * "reducir movimiento" y no actúa sobre el barrefondo, que ya tiene su propio efecto.
 */
export default function AguaCursor() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const burbujas: Burbuja[] = [];
    const ondas: Onda[] = [];
    let corriendo = false;
    let ultimo = 0;
    let ultimaBurbuja = 0;
    let ultimaOnda = 0;
    let dpr = 1;

    const medir = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    medir();

    const dibujar = (ahora: number) => {
      const dt = Math.min((ahora - ultimo) / 1000, 0.05);
      ultimo = ahora;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = burbujas.length - 1; i >= 0; i--) {
        const b = burbujas[i];
        b.t += dt;
        if (b.t >= b.vida) { burbujas.splice(i, 1); continue; }
        b.y -= b.vy * dt;
        b.x += Math.sin((b.t + b.r) * 4) * b.vx * dt;
        const a = 1 - b.t / b.vida;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = `rgba(190,235,255,${0.18 * a})`;
        ctx.fill();
      }
      for (let i = ondas.length - 1; i >= 0; i--) {
        const o = ondas[i];
        o.t += dt;
        if (o.t >= o.vida) { ondas.splice(i, 1); continue; }
        const p = o.t / o.vida;
        ctx.beginPath();
        ctx.arc(o.x, o.y, 6 + o.max * p, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - p)})`;
        ctx.lineWidth = 1.5 * (1 - p) + 0.5;
        ctx.stroke();
      }

      if (burbujas.length || ondas.length) requestAnimationFrame(dibujar);
      else corriendo = false;
    };
    const arrancar = () => {
      if (corriendo) return;
      corriendo = true;
      ultimo = performance.now();
      requestAnimationFrame(dibujar);
    };

    const sobreBarrefondo = (e: Event) => (e.target as Element | null)?.closest?.(".clean-frame, dialog, input, textarea, select");

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || sobreBarrefondo(e)) return;
      const t = e.timeStamp;
      if (t - ultimaBurbuja > 70) {
        ultimaBurbuja = t;
        burbujas.push({
          x: e.clientX + (Math.random() - 0.5) * 14,
          y: e.clientY + (Math.random() - 0.5) * 8,
          r: 1.5 + Math.random() * 3.5,
          vy: 30 + Math.random() * 40,
          vx: 6 + Math.random() * 8,
          vida: 1.2 + Math.random() * 1.2,
          t: 0,
        });
        if (burbujas.length > 40) burbujas.shift();
      }
      if (t - ultimaOnda > 420) {
        ultimaOnda = t;
        ondas.push({ x: e.clientX, y: e.clientY, vida: 0.9, t: 0, max: 26 });
        if (ondas.length > 8) ondas.shift();
      }
      arrancar();
    };
    const onDown = (e: PointerEvent) => {
      if (sobreBarrefondo(e)) return;
      ondas.push({ x: e.clientX, y: e.clientY, vida: e.pointerType === "mouse" ? 0.7 : 1, t: 0, max: e.pointerType === "mouse" ? 34 : 54 });
      if (e.pointerType !== "mouse") {
        for (let i = 0; i < 4; i++) {
          burbujas.push({ x: e.clientX + (Math.random() - 0.5) * 22, y: e.clientY, r: 2 + Math.random() * 3, vy: 40 + Math.random() * 40, vx: 6, vida: 1 + Math.random(), t: 0 });
        }
      }
      arrancar();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", medir);
    };
  }, []);

  return <canvas ref={ref} className="agua-cursor" aria-hidden="true" />;
}
