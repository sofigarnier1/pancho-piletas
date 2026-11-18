"use client";

import { useEffect, useRef, useState } from "react";
import { useConsulta } from "./consulta";

const MARGEN = 8;

/**
 * Ayudita flotante: Clorito ofrece armar el pedido (abre la consulta guiada).
 * Aparece al bajar un poco, se puede arrastrar a donde no moleste y se puede cerrar.
 */
export default function AyudaClorito() {
  const abrirConsulta = useConsulta();
  const [visible, setVisible] = useState(false);
  const [globo, setGlobo] = useState(true);
  const [pos, setPos] = useState({ dx: 0, dy: 0 }); // cuánto lo movió la persona respecto de su lugar de siempre
  const [enPie, setEnPie] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    movido: boolean;
  } | null>(null);

  useEffect(() => {
    const mostrar = () => {
      if (window.scrollY > 700) {
        setVisible(true);
        window.removeEventListener("scroll", mostrar);
      }
    };
    window.addEventListener("scroll", mostrar, { passive: true });
    mostrar();
    return () => window.removeEventListener("scroll", mostrar);
  }, []);

  // el globito se guarda solo después de unos segundos; Clorito queda
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setGlobo(false), 9000);
    return () => clearTimeout(t);
  }, [visible]);

  // si cambia el tamaño de la ventana (girar el celu), lo mantiene adentro
  useEffect(() => {
    if (!visible) return;
    const acomodar = () => setPos((p) => ajustar(caja.current, p));
    window.addEventListener("resize", acomodar);
    return () => window.removeEventListener("resize", acomodar);
  }, [visible]);

  // en el footer se esconde, para no tapar el contacto
  useEffect(() => {
    if (!visible) return;
    const revisar = () => {
      const pie = document.querySelector("footer");
      setEnPie(
        window.innerWidth <= 800 &&
          !!pie &&
          pie.getBoundingClientRect().top < window.innerHeight - 40,
      );
    };
    revisar();
    window.addEventListener("scroll", revisar, { passive: true });
    window.addEventListener("resize", revisar);
    return () => {
      window.removeEventListener("scroll", revisar);
      window.removeEventListener("resize", revisar);
    };
  }, [visible]);

  if (!visible) return null;

  const alBajar = (e: React.PointerEvent<HTMLButtonElement>) => {
    arrastre.current = {
      x: e.clientX,
      y: e.clientY,
      dx: pos.dx,
      dy: pos.dy,
      movido: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const alMover = (e: React.PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const mx = e.clientX - a.x,
      my = e.clientY - a.y;
    if (!a.movido && Math.hypot(mx, my) < 6) return;
    a.movido = true;
    setPos({ dx: a.dx + mx, dy: a.dy + my });
  };
  const alSoltar = (e: React.PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    arrastre.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!a) return;
    if (a.movido) {
      setPos((p) => ajustar(caja.current, p)); // si quedó cortado por el borde, lo devuelve adentro
      setGlobo(false);
    } else {
      abrirConsulta(); // toque corto
    }
  };
  const cerrar = () => {
    setVisible(false);
  };

  return (
    <div
      className="lv3-ayuda"
      hidden={enPie}
      ref={caja}
      style={{ transform: `translate(${pos.dx}px, ${pos.dy}px)` }}
    >
      {globo && (
        <button
          type="button"
          className="lv3-ayuda-globo"
          onClick={() => abrirConsulta()}
        >
          ¿Te ayudo a elegir?
        </button>
      )}
      <span
        className="lv3-ayuda-avatar"
        onPointerEnter={(e) => e.pointerType === "mouse" && setGlobo(true)}
        onPointerLeave={(e) =>
          e.pointerType === "mouse" && !arrastre.current && setGlobo(false)
        }
      >
        <button
          type="button"
          className="lv3-ayuda-clorito"
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={() => (arrastre.current = null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              abrirConsulta();
            }
          }}
          aria-label="Clorito te ayuda a armar tu pedido. Se puede arrastrar."
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ilustración liviana (webp con transparencia) */}
          <img
            src="/landing/v3/clorito-flotante.webp"
            alt=""
            width={80}
            height={80}
            draggable={false}
          />
        </button>
        <button
          type="button"
          className="lv3-ayuda-cerrar"
          onClick={cerrar}
          aria-label="Ocultar a Clorito"
        >
          ×
        </button>
      </span>
    </div>
  );
}

/** Devuelve el desplazamiento corregido para que el elemento no quede fuera de la pantalla. */
function ajustar(el: HTMLElement | null, p: { dx: number; dy: number }) {
  if (!el) return p;
  const r = el.getBoundingClientRect();
  let { dx, dy } = p;
  if (r.left < MARGEN) dx += MARGEN - r.left;
  if (r.right > window.innerWidth - MARGEN)
    dx -= r.right - (window.innerWidth - MARGEN);
  if (r.top < MARGEN) dy += MARGEN - r.top;
  if (r.bottom > window.innerHeight - MARGEN)
    dy -= r.bottom - (window.innerHeight - MARGEN);
  return { dx, dy };
}
