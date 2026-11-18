"use client";

import { useState } from "react";
import { ZONAS, ZONAS_POR_SERVICIO, type Servicio } from "@/lib/landing/zonas";
import { Clorito } from "./Clorito";
import { AGUA, MAPA } from "@/lib/landing/mapa-zonas-datos";

// Posición del número de cada zona dentro del mapa (a mano: el centro de un partido con islas cae en el agua)
const NUM: Record<(typeof ZONAS)[number], [number, number][]> = {
  "Vicente López": [[640, 396]],
  "San Isidro": [[609, 344]],
  "San Fernando": [[566, 300]],
  Tigre: [[528, 246]],
  Escobar: [[302, 125]],
  Pilar: [[228, 255]],
};

/** "¿Llegamos a tu zona?": el GBA con sus partidos reales; los que cubre Pancho van coloreados. */
export default function MapaZonas({ cobertura }: { cobertura: string }) {
  const [activa, setActiva] = useState<string | null>(null);
  const [servicio, setServicio] = useState<Servicio>("cloro");
  const cubre = ZONAS_POR_SERVICIO[servicio];
  return (
    <div className="lv3-zonas">
      <p className="lv3-zonas-titulo">¿Llegamos a tu zona?</p>
      <p className="coverage-line">{cobertura}.</p>
      <div className="lv3-mapa">
        <div className="lv3-mapa-col">
          <svg
            className="lv3-mapa-svg"
            viewBox="30 0 700 520"
            role="img"
            aria-label={`Mapa del Gran Buenos Aires con las zonas de reparto: ${ZONAS.join(", ")}`}
          >
            <defs>
              <linearGradient id="mz-agua" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#d9f0fc" />
                <stop offset="1" stopColor="#7cc4ec" />
              </linearGradient>
              <linearGradient id="mz-zona" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#5fb2e6" />
                <stop offset="1" stopColor="#1b5fa8" />
              </linearGradient>
            </defs>
            <rect
              className="m-rio"
              x="0"
              y="0"
              width={MAPA.ancho}
              height={MAPA.alto}
            />
            <text className="m-rio-txt" x="700" y="470">
              Río de la Plata
            </text>
            {MAPA.partidos
              .filter((p) => !p.nuestro || !cubre.includes(p.id))
              .map((p) => (
                <path key={p.id} className="m-otro" d={p.d} />
              ))}
            {MAPA.partidos
              .filter((p) => p.nuestro && cubre.includes(p.id))
              .map((p) => (
                <path
                  key={p.id}
                  className={`m-zona${activa === p.id ? " activa" : ""}`}
                  d={p.d}
                  onMouseEnter={() => setActiva(p.id)}
                  onMouseLeave={() => setActiva(null)}
                />
              ))}
            {/* Delta (agua e islas): fuera de la zona de reparto, se muestra en gris */}
            <polygon
              className="m-delta"
              points="287,-18 287,0 477,80 569,122 668,149 672,212 646,271 642,297 793,297 793,-18"
            />
            {AGUA.map((d, i) => (
              <path key={i} className="m-agua" d={d} fillRule="evenodd" />
            ))}
            {ZONAS.flatMap((z, i) =>
              (cubre.includes(z) ? NUM[z] : []).map(([x, y], k) => (
                <g
                  key={`${z}-${k}`}
                  className={activa === z ? "activa" : undefined}
                  onMouseEnter={() => setActiva(z)}
                  onMouseLeave={() => setActiva(null)}
                >
                  <circle className="m-pulso" cx={x} cy={y} r="16" />
                  <circle className="m-num" cx={x} cy={y} r="16" />
                  <text className="m-num-txt" x={x} y={y + 6}>
                    {i + 1}
                  </text>
                </g>
              )),
            )}
          </svg>
          <p className="lv3-mapa-nota">
            Mapa ilustrativo. Si tu zona no aparece, consultanos antes de pedir.
            © OpenStreetMap
          </p>
        </div>
        <div className="lv3-mapa-listas">
          <div
            className="lv3-mapa-botones"
            data-servicio={servicio}
            role="group"
            aria-label="Qué querés consultar"
          >
            {(
              [
                ["cloro", "Cloro"],
                ["service", "Service"],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                className={servicio === k ? "on" : undefined}
                aria-pressed={servicio === k}
                onClick={() => setServicio(k)}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="lv3-mapa-grupo-titulo">
            {servicio === "cloro" ? "Llevamos cloro a" : "Hacemos service en"}
          </p>
          <div className="lv3-mapa-fila">
          <ol className="lv3-mapa-lista">
            {cubre.map((z) => (
              <li
                key={z}
                className={activa === z ? "activa" : undefined}
                onMouseEnter={() => setActiva(z)}
                onMouseLeave={() => setActiva(null)}
              >
                {z}
              </li>
            ))}
          </ol>
          {servicio === "cloro" ? (
            <Clorito key="cloro" className="lv3-mapa-clorito lv3-mapa-clorito-cloro" pose="repartidorcloro" alto={150} />
          ) : (
            <Clorito key="service" className="lv3-mapa-clorito lv3-mapa-clorito-service" pose="camioneta" alto={150} />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
