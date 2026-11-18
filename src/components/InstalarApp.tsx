"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Plataforma = "android" | "iphone";

const CLAVE = "pancho-guia-instalar-vista";

const PASOS: Record<Plataforma, { titulo: string; texto: React.ReactNode }[]> =
  {
    android: [
      {
        titulo: "Tocá los tres puntitos",
        texto: (
          <>
            Están arriba a la derecha de la pantalla, en el navegador (Chrome).
            Se ven así: <b>⋮</b>
          </>
        ),
      },
      {
        titulo: "Elegí “Instalar app”",
        texto: (
          <>
            En la lista que se abre, buscá <b>Instalar app</b> o{" "}
            <b>Agregar a la pantalla de inicio</b> y tocá ahí.
          </>
        ),
      },
      {
        titulo: "Confirmá",
        texto: (
          <>
            Si te pregunta algo, tocá <b>Instalar</b>.
          </>
        ),
      },
    ],
    iphone: [
      {
        titulo: "Tocá el botón Compartir",
        texto: (
          <>
            Es un cuadradito con una flecha hacia arriba (<b>⬆︎</b>). Está abajo
            en el medio de la pantalla, o arriba a la derecha si usás Chrome.
          </>
        ),
      },
      {
        titulo: "Elegí “Agregar a inicio”",
        texto: (
          <>
            Deslizá la lista hacia arriba con el dedo hasta ver{" "}
            <b>Agregar a inicio</b> y tocá ahí.
          </>
        ),
      },
      {
        titulo: "Tocá “Agregar”",
        texto: (
          <>
            Está arriba a la derecha. Si podés elegir, abrí esta página desde{" "}
            <b>Safari</b> (el navegador con la brújula): ahí es más fácil.
          </>
        ),
      },
    ],
  };

/** Botón "Instalar app" + guía paso a paso para quien no sabe nada: se muestra sola la primera vez. */
export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [guia, setGuia] = useState(false);
  const [plataforma, setPlataforma] = useState<Plataforma>("android");

  const cerrar = () => {
    setGuia(false);
    try {
      localStorage.setItem(CLAVE, "1");
    } catch {
      /* no pasa nada */
    }
  };

  useEffect(() => {
    // qué celular tiene (se puede cambiar a mano en la guía)
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setPlataforma("iphone"); // eslint-disable-line react-hooks/set-state-in-effect -- se lee del navegador una sola vez al montar
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone
    ) {
      setInstalada(true);
      return;
    }
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const alPreguntar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const alInstalar = () => setInstalada(true);
    window.addEventListener("beforeinstallprompt", alPreguntar);
    window.addEventListener("appinstalled", alInstalar);
    // la primera vez que entra, se muestra la guía sola
    let yaVista = false;
    try {
      yaVista = !!localStorage.getItem(CLAVE);
    } catch {
      /* sin almacenamiento: se muestra igual */
    }
    const t = yaVista ? undefined : setTimeout(() => setGuia(true), 900);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", alPreguntar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  useEffect(() => {
    if (!guia) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [guia]);

  if (instalada) return null;

  const instalarYa = async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setInstalada(true);
    setEvento(null);
    cerrar();
  };

  const pasos = PASOS[plataforma];

  return (
    <div className="mt-6 text-center">
      <button
        type="button"
        onClick={() => setGuia(true)}
        className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:-translate-y-0.5 hover:bg-[#ffc94a] hover:text-[#0a3d5c] hover:shadow-md"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Instalar app
      </button>

      {guia && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[#081f3a]/60 p-3 sm:items-center"
          onClick={cerrar}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guia-instalar-titulo"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-[420px] overflow-auto rounded-3xl bg-white p-5 text-left text-[#0a3d5c] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="guia-instalar-titulo"
                className="text-xl font-bold leading-tight"
              >
                Tené Pancho en tu celular
              </h2>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="rounded-full p-1.5 text-[#0a3d5c]/70 hover:bg-[#0a3d5c]/10"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-sm leading-snug text-[#0a3d5c]/85">
              Instalarla es como bajar una app, pero sin ir a la tienda: te
              queda un <b>ícono de Pancho en la pantalla de inicio</b> y la
              abrís con un toque, sin buscar el link cada vez. Es gratis y casi
              no ocupa lugar.
            </p>

            <div
              className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-[#0a3d5c]/10 p-1"
              role="group"
              aria-label="Qué celular tenés"
            >
              {(
                [
                  ["android", "Tengo Android"],
                  ["iphone", "Tengo iPhone"],
                ] as const
              ).map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={plataforma === k}
                  onClick={() => setPlataforma(k)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${plataforma === k ? "bg-[#1b5fa8] text-white shadow" : "text-[#0a3d5c]"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {plataforma === "android" && evento && (
              <button
                type="button"
                onClick={instalarYa}
                className="mt-4 w-full rounded-full bg-[#ffc94a] px-4 py-3 text-sm font-bold text-[#0a3d5c] shadow hover:brightness-95"
              >
                Instalar ahora
              </button>
            )}

            <ol className="mt-4 space-y-3">
              {pasos.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#1b5fa8] text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-snug">
                    <b className="block text-base">{p.titulo}</b>
                    {p.texto}
                  </span>
                </li>
              ))}
              <li className="flex gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#1d9f55] text-sm font-bold text-white">
                  ✓
                </span>
                <span className="text-sm leading-snug">
                  <b className="block text-base">¡Listo!</b>
                  Vas a ver el ícono de Pancho en tu pantalla. Tocalo y se abre
                  la app.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={cerrar}
              className="mt-5 w-full rounded-full border border-[#1b5fa8]/30 px-4 py-2.5 text-sm font-semibold text-[#1b5fa8] hover:bg-[#1b5fa8]/10"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
