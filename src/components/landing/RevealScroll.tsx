"use client";

import { useEffect } from "react";

/**
 * Entrada suave al scrollear (solo en celu/tablet): lo que está más abajo aparece con un fundido corto
 * y un leve ascenso. Lo que ya se ve al cargar no se toca, y con "reducir movimiento" no hace nada.
 */
const OBJETIVOS = [
  ".lv3 .sec > .wrap > *",
  ".lv3 .lv3-catalogo .v3-product",
  ".lv3 .v3-service-grid > *",
  ".lv3 .lv3-zonas-fila",
  ".lv3 .closing-content > *",
].join(",");

const PASOS = ".lv3 .lv3-pasos li";

export default function RevealScroll() {
  useEffect(() => {
    const chico = window.matchMedia("(max-width: 900px)").matches;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || !("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("rv-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const vistos = new Set<Element>();
    const preparar = () => {
      // los 3 pasos del catálogo se levantan de a uno (también en compu)
      document.querySelectorAll<HTMLElement>(PASOS).forEach((el, i) => {
        if (vistos.has(el)) return;
        vistos.add(el);
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        el.style.setProperty("--rv-demora", `${i * 220}ms`);
        el.classList.add("rv", "rv-paso");
        io.observe(el);
      });
      if (!chico) return;
      document.querySelectorAll<HTMLElement>(OBJETIVOS).forEach((el) => {
        if (vistos.has(el) || el.closest(".hero")) return;
        vistos.add(el);
        if (el.getBoundingClientRect().top < window.innerHeight) return; // ya se ve: queda como está
        const hermanos = el.parentElement ? Array.from(el.parentElement.children) : [];
        el.style.setProperty("--rv-demora", `${(hermanos.indexOf(el) % 2) * 90}ms`);
        el.classList.add("rv");
        io.observe(el);
      });
    };
    preparar();
    // el catálogo cambia al filtrar: lo nuevo que aparezca ya se muestra normal (no se prepara)
    return () => io.disconnect();
  }, []);

  return null;
}
