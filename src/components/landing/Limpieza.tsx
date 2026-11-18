"use client";

import { useEffect, useRef, useState } from "react";
import { BotonConsulta } from "./consulta";
import { Clorito } from "./Clorito";
import { WaIcon } from "./iconos";

const FOTO_VERDE = "/landing/v3/limpieza-verde.webp";
const FOTO_LIMPIA = "/landing/v3/limpieza-limpia.webp";
const DURACION_MS = 5000;
// Zona del agua dentro de la foto (800 × 1422), de la orilla hacia adentro, en proporciones
const AGUA = { x0: 120 / 800, x1: 695 / 800, y0: 95 / 1422, y1: 1320 / 1422 };

type Props = { casoImagen?: string; casoPie?: string; casoResumen?: string };

const PASTILLA = "/landing/v3/pastilla.webp";

type Estado = "sucia" | "aclarando" | "limpia";
type Modo = "cloro" | "service";

// Barrefondo: la pileta se divide en una grilla; el servicio queda limpio cuando se pasó por casi todo el agua
const COLS = 10, FILAS = 18, LISTO = 0.86;

/** Pileta verde que se aclara de a poco al apretar "Ponele cloro". La foto verde se desvanece sobre la limpia. */
export default function Limpieza({ casoImagen, casoPie, casoResumen }: Props) {
  const [estado, setEstado] = useState<Estado>("sucia");
  const [modo, setModo] = useState<Modo>("cloro");
  const [avance, setAvance] = useState(0); // 0..1 del barrefondo
  const [caida, setCaida] = useState<{ x: number; y: number; n: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cloroRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const barreRef = useRef<HTMLDivElement>(null);
  const visitadas = useRef<Set<number>>(new Set());
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const imgVerde = useRef<HTMLImageElement | null>(null);
  const celdasAgua = useRef(1);
  const auto = useRef(0);

  const [lienzoListo, setLienzoListo] = useState(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (auto.current) cancelAnimationFrame(auto.current); }, []);

  // Service: se pinta la foto verde sobre un lienzo y el barrefondo la va borrando
  const pintarLienzo = () => {
    const c = lienzo.current, frame = frameRef.current;
    if (!c || !frame) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = frame.clientWidth, h = frame.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dibujar = (img: HTMLImageElement) => {
      // equivalente a object-fit: cover
      const k = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
      const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(img, (c.width - iw) / 2, (c.height - ih) / 2, iw, ih);
      setLienzoListo(true);
    };
    if (imgVerde.current?.complete) return dibujar(imgVerde.current);
    const img = new Image();
    img.onload = () => { imgVerde.current = img; dibujar(img); };
    img.src = FOTO_VERDE;
  };
  useEffect(() => {
    if (modo !== "service") return;
    let c = 0;
    for (let f = 0; f < FILAS; f++) for (let k = 0; k < COLS; k++) {
      const cx = (k + 0.5) / COLS, cy = (f + 0.5) / FILAS;
      if (cx > AGUA.x0 && cx < AGUA.x1 && cy > AGUA.y0 && cy < AGUA.y1) c++;
    }
    celdasAgua.current = Math.max(c, 1);
    pintarLienzo();
    window.addEventListener("resize", pintarLienzo);
    return () => window.removeEventListener("resize", pintarLienzo);
  }, [modo]);

  // Con mouse, sobre el agua el cursor pasa a ser una pastilla de cloro
  const moverCursor = (e: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current, cursor = cloroRef.current;
    if (modo !== "cloro" || !frame || !cursor || e.pointerType !== "mouse") return;
    const r = frame.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const dentro = estado === "sucia" && px > AGUA.x0 && px < AGUA.x1 && py > AGUA.y0 && py < AGUA.y1 && !(e.target as Element).closest(".clean-cloro");
    frame.classList.toggle("con-pastilla", dentro);
    cursor.style.left = `${e.clientX - r.left}px`;
    cursor.style.top = `${e.clientY - r.top}px`;
  };
  const salirCursor = () => frameRef.current?.classList.remove("con-pastilla");

  const ponerCloro = (x: number, y: number) => {
    if (estado !== "sucia") return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    frameRef.current?.classList.remove("con-pastilla");
    setCaida({ x, y, n: Date.now() });
    setEstado("aclarando");
    timer.current = setTimeout(() => setEstado("limpia"), sinMovimiento ? 0 : DURACION_MS);
  };
  // Un toque en el agua (o el botón) deja caer la pastilla justo ahí
  const alApretar = (e: React.MouseEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (modo !== "cloro" || !frame || estado !== "sucia") return;
    const r = frame.getBoundingClientRect();
    const enBoton = !!(e.target as Element).closest(".clean-cloro");
    if (enBoton && e.detail === 0) return ponerCloro(r.width / 2, r.height / 2); // con teclado
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    if (!enBoton && !(px > AGUA.x0 && px < AGUA.x1 && py > AGUA.y0 && py < AGUA.y1)) return;
    ponerCloro(e.clientX - r.left, e.clientY - r.top);
  };
  const reiniciar = () => {
    if (timer.current) clearTimeout(timer.current);
    if (auto.current) cancelAnimationFrame(auto.current);
    auto.current = 0;
    frameRef.current?.classList.remove("con-barre");
    setCaida(null);
    setEstado("sucia");
    setAvance(0);
    visitadas.current.clear();
    ultimo.current = null;
    if (modo === "service") pintarLienzo();
  };
  const cambiarModo = (m: Modo) => {
    if (m === modo) return;
    if (timer.current) clearTimeout(timer.current);
    if (auto.current) cancelAnimationFrame(auto.current);
    auto.current = 0;
    frameRef.current?.classList.remove("con-pastilla", "con-barre");
    setCaida(null);
    setEstado("sucia");
    setAvance(0);
    visitadas.current.clear();
    ultimo.current = null;
    setLienzoListo(false);
    setModo(m);
  };

  const terminarServicio = (ms = 1800) => {
    if (auto.current) cancelAnimationFrame(auto.current);
    auto.current = 0;
    setEstado("aclarando");
    setAvance(1);
    frameRef.current?.classList.remove("con-barre");
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timer.current = setTimeout(() => setEstado("limpia"), sinMovimiento ? 0 : ms);
  };
  // Borra la suciedad en (x, y) —relativo al marco— uniendo con el punto anterior, y mide cuánto se limpió
  const limpiarEn = (x: number, y: number) => {
    const frame = frameRef.current, c = lienzo.current, barre = barreRef.current;
    if (!frame || !c || !barre) return;
    const r = frame.getBoundingClientRect();
    barre.style.left = `${x}px`;
    barre.style.top = `${y}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = c.width / r.width;
    const radio = r.width * 0.085;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = radio * 2 * dpr;
    // el barrefondo solo limpia el agua: el borde de piedra de la pileta no se toca
    ctx.save();
    ctx.beginPath();
    ctx.rect(AGUA.x0 * c.width, AGUA.y0 * c.height, (AGUA.x1 - AGUA.x0) * c.width, (1300 / 1422 - AGUA.y0) * c.height);
    ctx.clip();
    ctx.beginPath();
    const u = ultimo.current ?? { x, y };
    ctx.moveTo(u.x * dpr, u.y * dpr);
    ctx.lineTo(x * dpr, y * dpr);
    ctx.stroke();
    ctx.restore();
    ultimo.current = { x, y };
    for (let f = 0; f < FILAS; f++) for (let k = 0; k < COLS; k++) {
      const cx = ((k + 0.5) / COLS) * r.width, cy = ((f + 0.5) / FILAS) * r.height;
      if (Math.hypot(cx - x, cy - y) < radio) visitadas.current.add(f * COLS + k);
    }
    const a = Math.min(visitadas.current.size / (celdasAgua.current * 0.97), 1);
    setAvance(a);
    if (a >= LISTO) {
      if (auto.current) cancelAnimationFrame(auto.current);
      auto.current = 0;
      terminarServicio();
    }
  };
  // Pasa el barrefondo con el cursor o el dedo
  const barrer = (e: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (modo !== "service" || !frame || estado !== "sucia" || auto.current) return;
    const r = frame.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const px = x / r.width, py = y / r.height;
    const dentro = px > AGUA.x0 && px < AGUA.x1 && py > AGUA.y0 && py < AGUA.y1;
    const activo = e.pointerType === "mouse" || e.buttons > 0;
    frame.classList.toggle("con-barre", dentro && activo);
    if (barreRef.current) { barreRef.current.style.left = `${x}px`; barreRef.current.style.top = `${y}px`; }
    if (!dentro || !activo) { ultimo.current = null; return; }
    limpiarEn(x, y);
  };
  // El botón "Pasale el barrefondo": lo pasa solo, en zigzag, y se puede seguir a mano igual
  const pasarSolo = () => {
    const frame = frameRef.current;
    if (!frame || estado !== "sucia" || auto.current) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (sinMovimiento) return terminarServicio(0);
    const r = frame.getBoundingClientRect();
    const FILAS_AUTO = 6, DUR = 4800;
    const inicio = performance.now();
    frame.classList.add("con-barre");
    ultimo.current = null;
    const paso = (t: number) => {
      const k = Math.min((t - inicio) / DUR, 1);
      const recorrido = k * FILAS_AUTO; // cada fila es una pasada de lado a lado
      const fila = Math.min(Math.floor(recorrido), FILAS_AUTO - 1);
      const f = recorrido - fila;
      const px = AGUA.x0 + 0.06 + (AGUA.x1 - AGUA.x0 - 0.12) * (fila % 2 ? 1 - f : f);
      const py = AGUA.y0 + 0.05 + (AGUA.y1 - AGUA.y0 - 0.1) * ((fila + f * 0.4) / FILAS_AUTO);
      limpiarEn(px * r.width, py * r.height);
      if (k < 1 && auto.current) auto.current = requestAnimationFrame(paso);
      else if (auto.current) { auto.current = 0; terminarServicio(); }
    };
    auto.current = requestAnimationFrame(paso);
  };
  const soltarBarre = () => { ultimo.current = null; };

  return (
    <section className="clean sec" id="antes-despues">
      <div className="wrap">
        <div className="clean-layout">
          <div className="clean-texto">
            <span className="eyebrow">El cuidado se nota</span>
            <div className="clean-tabs" data-modo={modo} role="group" aria-label="Qué querés ver">
              {([["cloro", "Cloro"], ["service", "Service"]] as const).map(([k, t]) => (
                <button key={k} type="button" className={modo === k ? "on" : undefined} aria-pressed={modo === k} onClick={() => cambiarModo(k)}>
                  {t}
                </button>
              ))}
            </div>
            {modo === "cloro" ? (
              <>
                <h2>
                  <span>Mirá lo que hace</span> <span>el cloro 👉🏻</span>
                </h2>
                <p>Tocá el botón y mirá cómo una pileta verde vuelve a ser cristalina. No es magia, es constancia: cloro todas las semanas.</p>
              </>
            ) : (
              <>
                <h2>
                  <span>Mirá lo que hace</span> <span>el service 👉🏻</span>
                </h2>
                <p>Pasá el barrefondo por la pileta y mirá cómo se va limpiando. Sacamos hojas y suciedad del fondo en cada visita: no es de un día para el otro, es constancia.</p>
              </>
            )}
            {estado === "limpia" && (
              <div className="clean-final clean-final-izq">
            <p className="clean-cta-titulo">¿Querés tu pileta así?</p>
            <div className="clean-cta">
              <BotonConsulta className="btn btn-primary" interes="pastillas triple acción">
                <WaIcon />
                Pedí cloro
              </BotonConsulta>
              <BotonConsulta className="btn btn-blue" interes="mantenimiento de pileta">
                <WaIcon />
                Pedí el service
              </BotonConsulta>
            </div>
              </div>
            )}
          </div>
          <div className="clean-frame-wrap">
          <div
            className={`clean-frame clean-${estado}${modo === "service" ? " clean-servicio" : ""}`}
            id="cleanFrame"
            ref={frameRef}
            onPointerMove={(e) => (modo === "cloro" ? moverCursor(e) : barrer(e))}
            onPointerDown={(e) => modo === "service" && barrer(e)}
            onPointerUp={soltarBarre}
            onPointerCancel={soltarBarre}
            onPointerLeave={() => { salirCursor(); soltarBarre(); frameRef.current?.classList.remove("con-barre"); }}
            onClick={alApretar}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- foto de fondo */}
            <img src={FOTO_LIMPIA} alt="Vista desde arriba de una pileta limpia" />
            {modo === "service" && !lienzoListo && estado === "sucia" && (
              // mientras el lienzo se prepara (celu lento), se ve la verde y no la limpia
              // eslint-disable-next-line @next/next/no-img-element -- foto provisoria
              <img className="clean-verde" src={FOTO_VERDE} alt="" aria-hidden="true" />
            )}
            {modo === "service" && <canvas ref={lienzo} className="clean-lienzo" aria-hidden="true" style={{ opacity: estado === "sucia" ? 1 : 0, transition: `opacity ${estado === "aclarando" ? 1800 : 0}ms ease-in-out` }} />}
            {modo === "cloro" && (
            // eslint-disable-next-line @next/next/no-img-element -- foto que se desvanece
            <img
              className="clean-verde"
              src={FOTO_VERDE}
              alt=""
              aria-hidden="true"
              style={{ opacity: estado === "sucia" ? 1 : 0, transition: `opacity ${estado === "aclarando" ? DURACION_MS : 0}ms ease-in-out` }}
            />
            )}
            {modo === "cloro" && estado === "sucia" && (
              <button type="button" className="clean-cloro">
                ¡Ponele cloro a la pileta!
              </button>
            )}
            {modo === "service" && estado === "sucia" && avance === 0 && (
              <button type="button" className="clean-cloro clean-invita" onClick={pasarSolo}>
                ¡Pasale el barrefondo!
              </button>
            )}
            {modo === "service" && (
              <div className="clean-barre" ref={barreRef} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- cursor */}
                <img src="/landing/v3/barrefondo.webp" alt="" width={160} height={160} />
              </div>
            )}
            <div className="clean-pastilla" ref={cloroRef} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- cursor */}
              <img src={PASTILLA} alt="" width={56} height={58} />
            </div>
            {caida && (
              <div className="clean-caida" key={caida.n} style={{ left: caida.x, top: caida.y }} aria-hidden="true">
                <i /><i /><i />
                {/* eslint-disable-next-line @next/next/no-img-element -- animación de la caída */}
                <img className="cae-arriba" src={PASTILLA} alt="" />
              </div>
            )}
            <span className="clean-done" style={{ opacity: estado === "limpia" ? 1 : 0 }}>
              Así da gusto meterse 🙌
            </span>
            {estado === "limpia" && <Clorito key="celebra" className="clean-celebra" pose="pileta" alto={130} />}
          </div>
          </div>
          <div className="clean-controls">
            {modo === "service" && estado === "sucia" && (
              <div className="clean-avance" aria-hidden="true">
                <span style={{ width: `${Math.round(Math.min(avance / LISTO, 1) * 100)}%` }} />
              </div>
            )}
            <p role="status" aria-live="polite" className={estado === "limpia" ? "clean-estado-oculto" : undefined}>
              {modo === "cloro"
                ? estado === "limpia"
                  ? "Cristalina otra vez. Para que siga así: cloro todas las semanas."
                  : estado === "aclarando"
                    ? "El cloro está trabajando…"
                    : "Así queda una pileta sin cloro ni cuidado."
                : estado === "limpia"
                  ? "Fondo limpio, sin hojas ni suciedad. Eso hacemos en cada visita."
                  : estado === "aclarando"
                    ? "Terminando de limpiar…"
                    : avance > 0
                      ? `Limpiando… ${Math.round(Math.min(avance / LISTO, 1) * 100)}%`
                      : "Movelo con el cursor (o el dedo) por la pileta, o dejá que lo pase solo."}
            </p>
            <div>
              {modo === "service" && estado === "sucia" && (
                <button type="button" onClick={pasarSolo}>
                  Limpiar solo
                </button>
              )}
              {estado === "limpia" && (
                <button type="button" onClick={reiniciar} aria-label="Volver a empezar">
                  Volver a empezar ↺
                </button>
              )}
            </div>
            {estado === "limpia" && (
              <div className="clean-final clean-final-abajo">
            <p className="clean-cta-titulo">¿Querés tu pileta así?</p>
            <div className="clean-cta">
              <BotonConsulta className="btn btn-primary" interes="pastillas triple acción">
                <WaIcon />
                Pedí cloro
              </BotonConsulta>
              <BotonConsulta className="btn btn-blue" interes="mantenimiento de pileta">
                <WaIcon />
                Pedí el service
              </BotonConsulta>
            </div>
              </div>
            )}
          </div>
        </div>

        {casoImagen && (
          <figure className="lv3-caso" id="resultado">
            <span className="eyebrow">Un caso real</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto real cargada desde el CMS (almacenamiento del proyecto) */}
            <img src={casoImagen} alt="Antes y después de un caso real" loading="lazy" />
            {(casoPie || casoResumen) && (
              <figcaption>
                {casoPie && <span>{casoPie}</span>}
                {casoResumen && <b>{casoResumen}</b>}
              </figcaption>
            )}
          </figure>
        )}
      </div>
    </section>
  );
}
