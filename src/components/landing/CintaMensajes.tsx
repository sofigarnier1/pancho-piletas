"use client";

import { useEffect, useState } from "react";

const BASE = [
  "Mantenimiento de piletas",
  "Desagote y limpieza",
  "Cloro granulado",
  "Pastillas triple acción",
  "Envío gratis en Zona Norte",
  "Entrega inmediata",
];

/**
 * Cinta de mensajes arriba del header: se desliza sola, se frena con el mouse encima y se esconde al scrollear
 * (vuelve al volver arriba). Si hay aviso de temporada (panel de la landing), va primero.
 */
export default function CintaMensajes({ aviso }: { aviso?: string }) {
  const [alTope, setAlTope] = useState(true);
  const [cerrada, setCerrada] = useState(false);
  const visible = alTope && !cerrada;

  useEffect(() => {
    const alScroll = () => setAlTope(window.scrollY < 40);
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--aviso-alto", visible ? "36px" : "0px");
    return () => {
      root.style.removeProperty("--aviso-alto");
    };
  }, [visible]);

  const mensajes = aviso ? [aviso, ...BASE] : BASE;
  const pista = (oculta: boolean) => (
    <ul aria-hidden={oculta || undefined}>
      {mensajes.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );

  return (
    <div className={`lv3-aviso${visible ? "" : " oculto"}`} role="region" aria-label="Aviso de temporada">
      <div className="lv3-aviso-pista">
        {pista(false)}
        {pista(true)}
        {pista(true)}
        {pista(true)}
      </div>
      <button type="button" aria-label="Cerrar aviso" onClick={() => setCerrada(true)}>
        ×
      </button>
    </div>
  );
}
