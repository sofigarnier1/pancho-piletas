"use client";

import { useEffect, useState } from "react";
import { Marca, WaIcon } from "./iconos";
import { waLink } from "@/lib/landing/consulta";

const LINKS = [
  { href: "#cloro", label: "Cloro" },
  { href: "#service", label: "Service" },
  { href: "#nosotros", label: "Nosotros" },
  { href: "#consejos", label: "Consejos" },
  { href: "#preguntas", label: "Preguntas" },
];

/** Al ir a una sección, la tarjeta queda justo debajo del header; se reajusta si las fotos de arriba terminan de cargar. */
function useScrollASecciones() {
  useEffect(() => {
    const alClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.(
        'a[href^="#"]',
      ) as HTMLAnchorElement | null;
      const id = a?.getAttribute("href")?.slice(1);
      if (!a || !id || id === "top") return;
      const destino = document.getElementById(id);
      if (!destino) return;
      e.preventDefault();
      const reducido = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const ir = (suave: boolean) => {
        const caja = destino.querySelector(":scope > .wrap") ?? destino;
        const nav =
          document.getElementById("nav")?.getBoundingClientRect().bottom ?? 80;
        const top =
          caja.getBoundingClientRect().top + window.scrollY - (nav + 14);
        window.scrollTo({
          top,
          behavior: suave && !reducido ? "smooth" : "auto",
        });
      };
      ir(true);
      [700, 1500].forEach((ms) =>
        setTimeout(() => {
          const caja = destino.querySelector(":scope > .wrap") ?? destino;
          const nav =
            document.getElementById("nav")?.getBoundingClientRect().bottom ??
            80;
          if (Math.abs(caja.getBoundingClientRect().top - (nav + 14)) > 6)
            ir(false);
        }, ms),
      );
      history.replaceState(null, "", `#${id}`);
    };
    document.addEventListener("click", alClick);
    return () => document.removeEventListener("click", alClick);
  }, []);
}

export default function LandingNav() {
  const [abierto, setAbierto] = useState(false);
  useScrollASecciones();
  // con el menú abierto, tocar en cualquier parte (fuera del menú) lo cierra
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".nav ul") || t?.closest(".mobile-menu")) return;
      setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);
  // Barra siempre blanca: sobre el video del hero se leía mal
  return (
    <header className="nav solid" id="nav" data-origen="header">
      <a
        href="#top"
        className="brand"
        aria-label="Pancho Piletas, ir al inicio"
      >
        <Marca />
      </a>
      <nav aria-label="Principal">
        <ul className={abierto ? "open" : undefined}>
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setAbierto(false)}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <a
        className="nav-wa"
        href={waLink("Hola Pancho, quiero hacer una consulta.")}
        target="_blank"
        rel="noopener noreferrer"
      >
        <WaIcon />
        <span>
          Pedí<span className="nav-wa-largo"> por WhatsApp</span>
        </span>
      </a>
      <button
        type="button"
        className="mobile-menu"
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? "×" : "☰"}
      </button>
    </header>
  );
}
