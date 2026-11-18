"use client";

import { useRef, useState, type ReactNode } from "react";
import { Clorito } from "./Clorito";
import { useConsulta } from "./consulta";
import { WaIcon } from "./iconos";

// ⚠️ Pendiente: que Pancho revise estos consejos antes de publicar (roadmap 10/11). Sin cantidades exactas a propósito.
type Accion = { texto: string; interes?: string; granulado?: true };
type Consejo = {
  id: string;
  titulo: string;
  texto: string;
  icono: ReactNode;
  accion?: Accion;
};

const trazo = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const CONSEJOS: Consejo[] = [
  {
    id: "pastilla",
    titulo: "¿Dónde van las pastillas triple acción?",
    texto:
      "En el flotador o en el canasto del skimmer. Nunca sueltas en el fondo: pueden manchar la pileta.",
    icono: (
      <svg viewBox="0 0 24 24" {...trazo}>
        <ellipse cx="12" cy="10" rx="7" ry="3" />
        <path d="M5 10v3c0 1.7 3.1 3 7 3s7-1.3 7-3v-3" />
        <path d="M3 20c2 0 2-1 4.5-1S10 20 12 20s2-1 4.5-1 2.5 1 4.5 1" />
      </svg>
    ),
  },
  {
    id: "filtro",
    titulo: "Prendé el filtro",
    texto:
      "Hacelo andar todos los días unas horas, y más en verano. Sin filtro, el cloro no llega a toda el agua.",
    icono: (
      <svg viewBox="0 0 24 24" {...trazo}>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        <circle cx="12" cy="12" r="5" />
        <path d="M12 9.5v2.5l1.8 1.2" />
      </svg>
    ),
  },
  {
    id: "lluvia",
    titulo: "Después de la lluvia o una fiesta",
    texto:
      "Mucha lluvia o mucha gente en el agua gastan el cloro más rápido. Reforzá con un poco de granulado.",
    icono: (
      <svg viewBox="0 0 24 24" {...trazo}>
        <path d="M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 0 7H7Z" />
        <path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
      </svg>
    ),
    accion: { texto: "Ver granulado", granulado: true },
  },
  {
    id: "verde",
    titulo: "Si el agua se puso verde",
    texto:
      "Hacé un shock de cloro granulado y dejá el filtro prendido. Si en un par de días no mejora, nuestro equipo la recupera.",
    icono: (
      <svg viewBox="0 0 24 24" {...trazo}>
        <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3Z" />
        <path d="M9 14.5c.6 1.2 1.6 2 3 2" />
      </svg>
    ),
    accion: {
      texto: "Pedir mantenimiento",
      interes: "mantenimiento de pileta",
    },
  },
  {
    id: "hojas",
    titulo: "Sacá las hojas",
    texto:
      "Retiralas antes de que se hundan. Si ya se juntó un colchón de hojas en el fondo, conviene un desagote y limpieza.",
    icono: (
      <svg viewBox="0 0 24 24" {...trazo}>
        <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" />
        <path d="M5 19 13 11" />
      </svg>
    ),
    accion: {
      texto: "Pedir desagote",
      interes: "desagote y limpieza de pileta",
    },
  },
  {
    id: "guardar",
    titulo: "Guardá bien las pastillas triple acción",
    texto:
      "En un lugar seco, con el envase cerrado y lejos de chicos y mascotas. No las mezcles con otros productos.",
    icono: (
      <svg viewBox="0 0 24 24" {...trazo}>
        <path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z" />
        <path d="M3 4h18v4H3zM10 12h4" />
      </svg>
    ),
    accion: { texto: "¿Dudas? Escribinos", interes: "pastillas triple acción" },
  },
];

/** Pide al catálogo que muestre solo un tipo de cloro (lo escucha `Catalogo`). */
export const verTipoDeCloro = (tipo: string) =>
  window.dispatchEvent(new CustomEvent("lv3-ver-tipo", { detail: tipo }));

/** Link de la calculadora que baja a la sección de consejos. */
export function BotonConsejos() {
  return (
    <a className="lv3-consejos-abrir" href="#consejos">
      <span aria-hidden="true">💡</span> Consejos de Clorito
    </a>
  );
}

/** Botón de acción de un consejo (granulado baja al catálogo; el resto abre la consulta por WhatsApp). */
function AccionConsejo({ accion }: { accion?: Accion }) {
  const abrirConsulta = useConsulta();
  if (!accion) return null;
  return (
    <button
      type="button"
      className="btn btn-blue"
      onClick={() =>
        accion.granulado
          ? verTipoDeCloro("granulado")
          : abrirConsulta({ interes: accion.interes })
      }
    >
      {!accion.granulado && <WaIcon />}
      {accion.texto} {accion.granulado && <span aria-hidden="true">→</span>}
    </button>
  );
}

/**
 * Sección "Consejos de Clorito": una tarjeta por vez, que se pasa con las flechas (o deslizando en el celu).
 * Después del sexto consejo aparece la vista con los 6 juntos.
 */
export default function ConsejosPancho() {
  const total = CONSEJOS.length;
  const [i, setI] = useState(0); // 0..total-1 = consejo; total = todos juntos
  const toque = useRef<number | null>(null);
  const resumen = i === total;
  const ir = (n: number) => setI(Math.max(0, Math.min(total, n)));
  const c = CONSEJOS[i];
  return (
    <section
      className="sec lv3-consejos-sec"
      id="consejos"
      aria-labelledby="consejos-titulo"
    >
      <div className="wrap">
        <div className="lv3-consejos-cabecera">
          <div>
            <span className="eyebrow">Para tu pileta</span>
            <h2 id="consejos-titulo">Consejos de Clorito.</h2>
            <p>
              Lo que le decimos a cada cliente para que la pileta se mantenga
              linda entre visita y visita.
            </p>
          </div>
          <Clorito pose="consejos" alto={190} />
        </div>

        {resumen ? (
          <div className="lv3-consejos-todos">
            <ul className="lv3-consejos-grid">
              {CONSEJOS.map((x, n) => (
                <li key={x.id} className="lv3-consejo">
                  <i aria-hidden="true">{x.icono}</i>
                  <small>Consejo {n + 1}</small>
                  <h3>{x.titulo}</h3>
                  <p>{x.texto}</p>
                  <AccionConsejo accion={x.accion} />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="lv3-consejos-reiniciar"
              onClick={() => ir(0)}
            >
              <span aria-hidden="true">↺</span> Volver a empezar
            </button>
          </div>
        ) : (
          <div
            className="lv3-consejos-carrusel"
            role="group"
            aria-roledescription="carrusel"
            aria-label={`Consejo ${i + 1} de ${total}`}
            onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (toque.current == null) return;
              const d = e.changedTouches[0].clientX - toque.current;
              toque.current = null;
              if (Math.abs(d) > 40) ir(i + (d < 0 ? 1 : -1));
            }}
          >
            <article
              key={c.id}
              className="lv3-consejo lv3-consejo-grande"
              aria-live="polite"
            >
              <i aria-hidden="true">{c.icono}</i>
              <small>
                Consejo {i + 1} de {total}
              </small>
              <h3>{c.titulo}</h3>
              <p>{c.texto}</p>
              <div className="lv3-consejo-pie">
                <AccionConsejo accion={c.accion} />
                <div className="lv3-consejo-nav">
                  <button
                    type="button"
                    className="lv3-consejos-flecha"
                    onClick={() => ir(i - 1)}
                    disabled={i === 0}
                    aria-label="Consejo anterior"
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                  <button
                    type="button"
                    className="lv3-consejos-flecha"
                    onClick={() => ir(i + 1)}
                    aria-label={
                      i === total - 1
                        ? "Ver todos los consejos"
                        : "Consejo siguiente"
                    }
                  >
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </article>
          </div>
        )}

        {!resumen && (
          <ol className="lv3-consejos-puntos" aria-hidden="true">
            {CONSEJOS.map((x, n) => (
              <li
                key={x.id}
                className={n === i ? "actual" : n < i ? "visto" : ""}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
