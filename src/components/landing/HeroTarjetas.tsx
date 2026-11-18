"use client";

import { useEffect, useState } from "react";
import { waLink } from "@/lib/landing/consulta";
import { ANIO_INICIO } from "./iconos";

const TARJETAS = [
  { src: "/landing/v3/tarjeta-cloro-pastillas.webp", tipo: "Cloro", titulo: "Pastillas triple acción", detalle: "Cloro + alguicida + clarificador", accion: "Pedir", alt: "Pastillas de cloro triple acción sobre un deck junto a una pileta", href: "#cloro" },
  { src: "/landing/v3/tarjeta-cloro-granulado.webp", tipo: "Cloro", titulo: "Granulado triple acción", detalle: "Cloro + alguicida + clarificador", accion: "Pedir", alt: "Cloro granulado triple acción con medidor y balde junto a una pileta", href: "#cloro" },
  {
    src: "/landing/v3/tarjeta-service-pileta.webp",
    tipo: "Service", titulo: "Service de piletas", detalle: "Semanal o quincenal", accion: "Consultar",
    alt: "Pileta rectangular cristalina con deck de madera",
    href: waLink("Hola Pancho, quiero consultar por el service de mi pileta."),
  },
];

const CADA_MS = 7000;

/** Fotos que van pasando en la portada: cloro granulado, pastillas y service. Se frena al pasar el mouse o con "reducir movimiento". */
export default function HeroTarjetas({ testId = "hero-tarjetas" }: { testId?: string }) {
  const [actual, setActual] = useState(0);
  const [frenado, setFrenado] = useState(false);

  useEffect(() => {
    if (frenado || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActual((i) => (i + 1) % TARJETAS.length), CADA_MS);
    return () => clearInterval(id);
  }, [frenado]);

  return (
    <aside
      className="hero-tarjetas"
      aria-label="Lo que ofrece Pancho"
      data-testid={testId}
      onMouseEnter={() => setFrenado(true)}
      onMouseLeave={() => setFrenado(false)}
      onFocus={() => setFrenado(true)}
      onBlur={() => setFrenado(false)}
    >
      <div className="hero-sello-aval" aria-hidden={false}>
        {/* eslint-disable-next-line @next/next/no-img-element -- sello fijo de la marca */}
        <img className="sello-svg" src="/landing/v3/sello-clorito.webp" alt={`Pancho Piletas, desde ${ANIO_INICIO} cuidando tu pileta`} width={320} height={320} />
      </div>
      <div className="hero-tarjetas-marco">
        {TARJETAS.map((t, i) => {
          const externo = t.href.startsWith("http");
          return (
            <a
              key={t.titulo}
              className={`hero-tarjeta${i === actual ? " activa" : ""}`}
              href={t.href}
              tabIndex={i === actual ? 0 : -1}
              aria-hidden={i !== actual}
              {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.src} alt={t.alt} loading={i === 0 ? "eager" : "lazy"} />
              <span className="hero-tarjeta-pie">
                <span>
                  <b>{t.titulo}</b>
                  <small>{t.detalle}</small>
                </span>
                <em aria-label={t.accion}>↗</em>
              </span>
            </a>
          );
        })}
      </div>
      <div className="hero-tarjetas-puntos" role="tablist" aria-label="Elegir foto">
        {TARJETAS.map((t, i) => (
          <button
            key={t.titulo}
            type="button"
            role="tab"
            aria-selected={i === actual}
            aria-label={t.titulo}
            className={i === actual ? "activo" : ""}
            onClick={() => setActual(i)}
          />
        ))}
      </div>
    </aside>
  );
}
