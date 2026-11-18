"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { recomendar } from "@/lib/landing/calculadora";
import { BotonConsulta } from "./consulta";
import { WaIcon } from "./iconos";
import { BotonConsejos } from "./ConsejosPancho";

const num = (v: string) => Number(v.replace(",", "."));
const fmt = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const medidaOk = (v: string) => num(v) > 0 && num(v) <= 50;
/** Solo números y una coma (o punto), hasta 5 caracteres: "8", "1,4", "12.5". */
const soloMedida = (v: string) => {
  const s = v.replace(/[^\d.,]/g, "");
  const i = s.search(/[.,]/);
  return (
    i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, "")
  ).slice(0, 5);
};
const PASTILLA = "/landing/v3/pastilla.webp";

const PROFUNDIDADES = [
  { valor: "1", nombre: "Baja", detalle: "1 m" },
  { valor: "1.4", nombre: "Media", detalle: "1,4 m" },
  { valor: "1.8", nombre: "Honda", detalle: "1,8 m" },
];

const FACTORES = [
  {
    id: "sol",
    nombre: "Sol",
    d: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  },
  {
    id: "calor",
    nombre: "Calor",
    d: "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0ZM12 18v-6",
  },
  {
    id: "lluvia",
    nombre: "Lluvia",
    d: "M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 0 7H7ZM8 18l-1 2M12 18l-1 2M16 18l-1 2",
  },
  {
    id: "uso",
    nombre: "Uso",
    d: "M9 7a3 3 0 1 0 0-.01M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 5.6M18 14a6 6 0 0 1 3 6",
  },
];

const sinMovimiento = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Número que sube de 0 al valor cuando aparece el resultado (sin animación con "reducir movimiento"). */
function useContador(valor: number, activo: boolean): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const quieto = sinMovimiento();
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = quieto ? 1 : Math.min(1, (t - t0) / 2000);
      setV(valor * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valor, activo]);
  return activo ? v : 0;
}

/** Dibujo de la pileta vista de arriba: crece con el largo y el ancho, y se llena de agua en el resultado. */
function Pileta({
  largo,
  ancho,
  llena,
}: {
  largo: string;
  ancho: string;
  llena: boolean;
}) {
  const l = medidaOk(largo) ? Math.min(num(largo), 15) : 0;
  const a = medidaOk(ancho) ? Math.min(num(ancho), 10) : 0;
  return (
    <div className="lv3-calc-dibujo" aria-hidden="true">
      <div
        className="lv3-calc-pileta"
        style={{
          width: `${35 + (l / 15) * 55}%`,
          height: `${35 + (a / 10) * 55}%`,
        }}
      >
        <div className={`lv3-calc-agua${llena ? " llena" : ""}`} />
        {l > 0 && (
          <span className="lv3-calc-cota largo">{fmt(num(largo))} m</span>
        )}
        {a > 0 && (
          <span className="lv3-calc-cota ancho">{fmt(num(ancho))} m</span>
        )}
      </div>
    </div>
  );
}

/** Pastillas dibujadas: una imagen por pastilla, la última por la mitad si es media. */
function Pastillas({ cantidad }: { cantidad: number }) {
  const enteras = Math.floor(cantidad);
  const media = cantidad - enteras >= 0.5;
  const TOPE = 24;
  const lista = Array.from({ length: Math.min(enteras, TOPE) }, (_, i) => i);
  const sobran = enteras + (media ? 1 : 0) - TOPE;
  return (
    <span
      className={`lv3-calc-pastillas${enteras > 8 ? " muchas" : ""}`}
      aria-hidden="true"
    >
      {lista.map((i) => (
        // eslint-disable-next-line @next/next/no-img-element -- ícono decorativo chico
        <img
          key={i}
          src={PASTILLA}
          alt=""
          style={{ animationDelay: `${Math.min(0.15 * i, 1.2)}s` }}
        />
      ))}
      {media && enteras < TOPE && (
        <span
          className="media"
          style={{ animationDelay: `${Math.min(0.15 * enteras, 1.2)}s` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ícono decorativo chico */}
          <img src={PASTILLA} alt="" />
        </span>
      )}
      {sobran > 0 && <b className="mas">+{sobran}</b>}
    </span>
  );
}

/** "¿Cuánto cloro necesito?": de a una pregunta por tarjeta, con la pileta dibujada, y al final una cantidad orientativa. */
export default function Calculadora({
  verGranulado,
}: {
  verGranulado?: () => void;
}) {
  const [paso, setPaso] = useState(0);
  const [largo, setLargo] = useState("");
  const [ancho, setAncho] = useState("");
  const [prof, setProf] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const movido = useRef(false);

  const r =
    paso === 3
      ? recomendar({
          largo: num(largo),
          ancho: num(ancho),
          profundidad: num(prof),
        })
      : null;
  const litros = useContador(r?.litros ?? 0, !!r);
  const semana = useContador(r?.pastillasSemana ?? 0, !!r);
  const mes = useContador(r?.kgMes ?? 0, !!r);

  // Al pasar de tarjeta, el foco va al campo nuevo (no al cargar la página, para no moverla)
  useEffect(() => {
    if (movido.current) inputRef.current?.focus({ preventScroll: true });
  }, [paso]);

  const ir = (n: number) => {
    movido.current = true;
    setPaso(n);
  };
  const siguiente = (e: FormEvent) => {
    e.preventDefault();
    if (paso === 0 && medidaOk(largo)) ir(1);
    else if (paso === 1 && medidaOk(ancho)) ir(2);
    else if (paso === 2 && medidaOk(prof)) ir(3);
  };
  const empezar = () => {
    setLargo("");
    setAncho("");
    setProf("");
    ir(0);
  };

  const campo = (
    valor: string,
    cambiar: (v: string) => void,
    etiqueta: string,
    ejemplo: string,
  ) => (
    <label className="lv3-calc-campo">
      <input
        ref={inputRef}
        inputMode="decimal"
        placeholder={ejemplo}
        value={valor}
        onChange={(e) => cambiar(soloMedida(e.target.value))}
        aria-label={etiqueta}
      />
      <span aria-hidden="true">m</span>
    </label>
  );

  return (
    <div
      className="lv3-calc"
      id="calculadora"
      onFocus={(e) => {
        // en el celu, el teclado empuja la página: dejamos la tarjeta arriba de todo
        if (
          window.innerWidth <= 650 &&
          (e.target as HTMLElement).tagName === "INPUT"
        )
          setTimeout(
            () =>
              (e.target as HTMLElement)
                .closest(".lv3-calc-tarjeta")
                ?.scrollIntoView({ block: "start", behavior: "smooth" }),
            350,
          );
      }}
    >
      <div className="lv3-calc-texto">
        <h3>¿Cuánto cloro necesito?</h3>
        <p>
          Poné las medidas de tu pileta y te damos una{" "}
          <b>cantidad orientativa</b>. Ante cualquier duda, consultanos por
          WhatsApp.
        </p>
        <Pileta
          largo={largo}
          ancho={paso >= 1 ? ancho : ""}
          llena={paso === 3}
        />
        {paso === 3 && r && (
          <div className="lv3-calc-acciones solo-escritorio">
            <BotonConsulta
              className="btn btn-primary"
              interes="pastillas triple acción"
              producto={`Pastillas triple acción para pileta de unos ${r.litros.toLocaleString("es-AR")} litros`}
            >
              <WaIcon />
              Pedir mi cloro
            </BotonConsulta>
            {verGranulado && (
              <p className="lv3-calc-shock">
                En verano o si el agua se pone verde, sumá un shock de
                granulado.{" "}
                <button
                  type="button"
                  className="lv3-calc-link"
                  onClick={verGranulado}
                >
                  Ver granulado <span aria-hidden="true">→</span>
                </button>
              </p>
            )}
            <div className="lv3-calc-pie">
              <BotonConsejos />
            </div>
          </div>
        )}
      </div>

      <div className="lv3-calc-der">
        <div className="lv3-calc-tarjeta">
          <div className="lv3-calc-arriba">
            {paso === 3 ? (
              <button
                type="button"
                className="lv3-calc-volver"
                onClick={empezar}
              >
                <span aria-hidden="true">↺</span> Calcular de nuevo
              </button>
            ) : paso > 0 ? (
              <button
                type="button"
                className="lv3-calc-volver"
                onClick={() => ir(paso - 1)}
              >
                <span aria-hidden="true">←</span> Volver
              </button>
            ) : (
              <span />
            )}
            <ol
              className="lv3-calc-puntos"
              aria-label={`Paso ${Math.min(paso + 1, 3)} de 3`}
            >
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className={i < paso ? "hecho" : i === paso ? "actual" : ""}
                />
              ))}
            </ol>
          </div>

          {paso < 3 ? (
            <form
              key={paso}
              className="lv3-calc-paso"
              onSubmit={siguiente}
              aria-label="Medidas de tu pileta"
            >
              {paso === 0 && (
                <>
                  <h4>¿Cuánto mide de largo?</h4>
                  {campo(largo, setLargo, "Largo de la pileta en metros", "8")}
                </>
              )}
              {paso === 1 && (
                <>
                  <h4>¿Y de ancho?</h4>
                  {campo(ancho, setAncho, "Ancho de la pileta en metros", "4")}
                </>
              )}
              {paso === 2 && (
                <>
                  <h4>¿Qué tan honda es?</h4>
                  <div
                    className="lv3-calc-opciones"
                    role="radiogroup"
                    aria-label="Profundidad de la pileta"
                  >
                    {PROFUNDIDADES.map((p) => (
                      <button
                        key={p.valor}
                        type="button"
                        role="radio"
                        aria-checked={prof === p.valor}
                        onClick={() => {
                          setProf(p.valor);
                          ir(3);
                        }}
                      >
                        <b>{p.nombre}</b>
                        <small>{p.detalle}</small>
                      </button>
                    ))}
                  </div>
                  <label className="lv3-calc-otra">
                    ¿Sabés la profundidad media?
                    <span className="lv3-calc-campo chico">
                      <input
                        inputMode="decimal"
                        placeholder="1,4"
                        value={
                          PROFUNDIDADES.some((p) => p.valor === prof)
                            ? ""
                            : prof
                        }
                        onChange={(e) => setProf(soloMedida(e.target.value))}
                        aria-label="Profundidad media en metros"
                      />
                      <span aria-hidden="true">m</span>
                    </span>
                  </label>
                </>
              )}
              {(paso < 2 ||
                (!PROFUNDIDADES.some((p) => p.valor === prof) && prof)) && (
                <button
                  type="submit"
                  className="btn btn-blue lv3-calc-siguiente"
                  disabled={
                    !medidaOk(paso === 0 ? largo : paso === 1 ? ancho : prof)
                  }
                >
                  {paso < 2 ? "Siguiente" : "Calcular"}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </form>
          ) : (
            r && (
              <div
                className="lv3-calc-paso lv3-calc-final"
                role="status"
                aria-live="polite"
              >
                <h4>Tu pileta tiene unos</h4>
                <p className="lv3-calc-litros">
                  <b>{Math.round(litros).toLocaleString("es-AR")}</b> litros
                </p>
                <dl className="lv3-calc-datos">
                  <div>
                    <dt>Pastillas triple acción por semana</dt>
                    <dd>
                      {fmt(Math.round(semana * 10) / 10)}
                      <Pastillas cantidad={r.pastillasSemana} />
                    </dd>
                  </div>
                  <div>
                    <dt>Pastillas triple acción por mes</dt>
                    <dd>{fmt(Math.round(mes * 10) / 10)} kg</dd>
                  </div>
                </dl>
                <div className="lv3-calc-aviso">
                  <svg
                    className="lv3-calc-aviso-i"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5M12 7.5v.5" />
                  </svg>
                  <div>
                    <b>Es una cantidad orientativa.</b>
                    <p>
                      Cambia según el sol, el calor, la lluvia y el uso de la
                      pileta.
                    </p>
                    <ul aria-label="Lo que cambia cuánto cloro necesita la pileta">
                      {FACTORES.map((f) => (
                        <li key={f.id}>
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d={f.d} />
                          </svg>
                          {f.nombre}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="lv3-calc-acciones solo-movil">
                  <BotonConsulta
                    className="btn btn-primary"
                    interes="pastillas triple acción"
                    producto={`Pastillas triple acción para pileta de unos ${r.litros.toLocaleString("es-AR")} litros`}
                  >
                    <WaIcon />
                    Pedir mi cloro
                  </BotonConsulta>
                  {verGranulado && (
                    <p className="lv3-calc-shock">
                      En verano o si el agua se pone verde, sumá un shock de
                      granulado.{" "}
                      <button
                        type="button"
                        className="lv3-calc-link"
                        onClick={verGranulado}
                      >
                        Ver granulado <span aria-hidden="true">→</span>
                      </button>
                    </p>
                  )}
                  <div className="lv3-calc-pie">
                    <BotonConsejos />
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
