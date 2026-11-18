"use client";

import { useEffect, useRef, useState } from "react";
import { waLink } from "@/lib/landing/consulta";
import { WaIcon } from "./iconos";
import HeroTarjetas from "./HeroTarjetas";

type Props = { headline: string; subheadline: string; ctaText: string };

/** "Tu pileta lista. Tu tiempo para vos." → la segunda oración va destacada, como en la demo. */
export const partirTitulo = (titulo: string): [string, string] => {
  const m = titulo.match(/^(.+?[.!?])\s+(\S.*)$/);
  return m ? [m[1], m[2]] : [titulo, ""];
};


export default function Hero({ headline, subheadline, ctaText }: Props) {
  const heroRef = useRef<HTMLElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const tarjetasRef = useRef<HTMLDivElement>(null);
  const pausaRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausadoPorUsuario = useRef(false);
  const [pausado, setPausado] = useState(false);
  // Si el título viene como "Cuidamos piletas desde 1989", se descarta el "desde": el año ya está en el sello.
  const conAnio = headline.match(/^(.+?)\s+desde\s+(\d{4})\s*$/i);
  // "Mantenimiento · Cloro a domicilio con envío gratis en Zona Norte" → dos líneas; la segunda (el envío gratis) destacada
  const sub = subheadline.replace(/Zona Norte/g, "Zona\u00a0Norte").match(/^(.+?)\s+con\s+(\S.*)$/i);
  const [l1, l2] = conAnio ? [conAnio[1], ""] : partirTitulo(headline);

  useEffect(() => {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const video = videoRef.current;
    // cámara lenta: el agua se ve más calma
    const velocidad = () => {
      if (video) video.playbackRate = 0.35;
    };
    velocidad();
    video?.addEventListener("loadedmetadata", velocidad);
    const sincronizar = () => {
      velocidad();
      setPausado(Boolean(video?.paused));
    };
    video?.addEventListener("play", sincronizar);
    video?.addEventListener("pause", sincronizar);
    if (video && reducido) {
      pausadoPorUsuario.current = true;
      video.pause();
    }

    // la portada se recorta y el texto se desvanece a medida que se baja
    let pendiente = false;
    const onScroll = () => {
      pendiente = false;
      const hero = heroRef.current, media = mediaRef.current, copy = copyRef.current, cue = cueRef.current;
      if (reducido || !hero || !media || !copy || !cue) return;
      const celu = window.matchMedia("(max-width: 900px)").matches;
      // celu: la portada se va con el scroll normal (sin tramo fijo) y se funde un poco; compu: se recorta
      const largo = celu ? window.innerHeight * 0.9 : hero.offsetHeight - window.innerHeight;
      const p = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / largo));
      const e = p * p * (3 - 2 * p);
      if (celu) {
        media.style.clipPath = "";
        media.style.opacity = String(Math.max(0.15, 1 - e * 0.85));
      } else {
        media.style.opacity = "";
        media.style.clipPath = `inset(${e * 10}% ${e * 8}% ${e * 28}% ${e * 8}% round ${e * 8}px)`;
      }
      copy.style.opacity = String(Math.max(0, 1 - p * 2.8));
      copy.style.transform = `translateY(${-p * 50}px)`;
      cue.style.opacity = String(Math.max(0, 1 - p * 6));
      // el botón de pausa se va con el video: se desvanece apenas la portada empieza a achicarse
      if (pausaRef.current) {
        const o = Math.max(0, 1 - p * 6);
        pausaRef.current.style.opacity = String(o);
        pausaRef.current.style.pointerEvents = o < 0.2 ? "none" : "";
      }
      if (tarjetasRef.current) tarjetasRef.current.style.opacity = String(Math.max(0, 1 - p * 2.8));
    };
    const programar = () => {
      if (!pendiente) {
        pendiente = true;
        requestAnimationFrame(onScroll);
      }
    };
    window.addEventListener("scroll", programar, { passive: true });
    onScroll();

    // Si el celu no deja reproducir solo (ahorro de batería), se muestra la foto y no el botón ▶ del sistema
    const aviso = window.setTimeout(() => {
      if (video && video.paused && !pausadoPorUsuario.current) mediaRef.current?.classList.add("sin-video");
    }, 1500);
    video?.addEventListener("playing", () => mediaRef.current?.classList.remove("sin-video"));

    // el video no consume fuera de pantalla ni con la pestaña oculta
    const observer = video
      ? new IntersectionObserver(
          ([entry]) => {
            if (!entry.isIntersecting) video.pause();
            else if (!pausadoPorUsuario.current) video.play().catch(() => {});
          },
          { threshold: 0.1 },
        )
      : null;
    if (video) observer?.observe(video);
    const onVisibility = () => {
      if (document.hidden) video?.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("scroll", programar);
      video?.removeEventListener("loadedmetadata", velocidad);
      video?.removeEventListener("play", sincronizar);
      video?.removeEventListener("pause", sincronizar);
      window.clearTimeout(aviso);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const alternarVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    pausadoPorUsuario.current = !video.paused;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <section className="hero on-dark" id="hero" ref={heroRef}>
      <div className="hero-stage">
        <div className="hero-media" id="heroMedia" ref={mediaRef}>
          <video ref={videoRef} autoPlay muted loop playsInline preload="metadata" poster="/landing/v3/hero-poster.webp" aria-hidden="true">
            <source src="/landing/v3/hero.webm" type="video/webm" />
            <source src="/landing/v3/hero.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="hero-copy" id="heroCopy" ref={copyRef}>
          <h1>
            <span className="line">
              <span>{l1}</span>
            </span>
            {l2 && (
              <>
                {" "}
                <span className="line">
                  <span>
                    {l2.includes(" ") ? (
                      <>
                        {l2.slice(0, l2.lastIndexOf(" ") + 1)}
                        <em>{l2.slice(l2.lastIndexOf(" ") + 1)}</em>
                      </>
                    ) : (
                      <em>{l2}</em>
                    )}
                  </span>
                </span>
              </>
            )}
          </h1>
          <div className="hero-tarjetas-movil">
            <HeroTarjetas testId="hero-tarjetas-movil" />
          </div>
          <div className="hero-sub">
            <p>
              {sub ? (
                <>
                  <span>{sub[1]}</span>
                  <b>{sub[2].charAt(0).toUpperCase() + sub[2].slice(1)}</b>
                </>
              ) : (
                subheadline.replace(/Zona Norte/g, "Zona\u00a0Norte")
              )}
            </p>
            <div className="hero-ctas">
              {/* Cloro: baja al catálogo para elegir (después, al carrito). Service: directo a WhatsApp */}
              <a className="btn btn-primary" href="#cloro">
                <WaIcon />
                {ctaText}
              </a>
              <a className="btn btn-ghost" href={waLink("Hola Pancho, quiero consultar por el service de mi pileta.")} target="_blank" rel="noopener noreferrer">
                <WaIcon />
                Pedí el service
              </a>
            </div>
          </div>
        </div>
        <div className="hero-tarjetas-wrap" ref={tarjetasRef}>
          <HeroTarjetas />
        </div>
        <div className="scroll-cue" id="cue" ref={cueRef} aria-hidden="true">
          Deslizá<i></i>
        </div>
        <button type="button" className="video-pause" ref={pausaRef} onClick={alternarVideo} aria-label={pausado ? "Reproducir video" : "Pausar video"} title={pausado ? "Reproducir video" : "Pausar video"}>
          {pausado ? "▶" : "⏸"}
        </button>
      </div>
    </section>
  );
}
