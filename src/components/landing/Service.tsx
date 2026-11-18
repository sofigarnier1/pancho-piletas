"use client";

import { BotonConsulta } from "./consulta";
import { Clorito } from "./Clorito";
import { WaIcon } from "./iconos";

// Pintura se sacó por ahora (2026-11-05). Para volver a ofrecerla, agregar otra entrada acá. Pendiente: que marketing/admin lo manejen desde el CMS.
const SERVICIOS = [
  {
    id: "mantenimiento",
    kicker: "Cuidado recurrente",
    titulo: "Mantenimiento",
    frecuencia: "Semanal o quincenal",
    texto: "Nuestro equipo limpia el fondo, retira las hojas, controla el agua y aplica cloro. Si el agua está verde o turbia, la recuperamos.",
    lista: ["Barrido y aspirado del fondo", "Retiro de hojas y cuidado del agua", "Recuperación del agua verde o turbia"],
    interes: "mantenimiento de pileta",
    boton: "Pedir mantenimiento",
  },
  {
    id: "desagote",
    kicker: "Para empezar de cero",
    titulo: "Desagote y limpieza",
    frecuencia: "Una sola vez",
    texto: "Vaciamos la pileta, la limpiamos a fondo y queda lista para empezar con agua limpia. Ideal si se juntó un colchón de hojas en el fondo.",
    lista: ["Vaciado de la pileta", "Limpieza a fondo de piso y paredes", "Lista para llenar con agua limpia"],
    interes: "desagote y limpieza de pileta",
    boton: "Pedir desagote",
  },
];

type Props = { titulo: string; bajada: string; exclusiones: string };

export default function Service({ titulo, bajada, exclusiones }: Props) {
  const [t1, ...resto] = titulo.split(/(?<=[.!?])\s+/);

  return (
    <section className="v3-service sec" id="service">
      <div className="wrap">
        <div className="v3-head">
          <div>
            <span className="eyebrow">Service de piletas</span>
            <h2>
              {t1}
              {resto.length > 0 && (
                <>
                  <br />
                  {resto.join(" ")}
                </>
              )}
              <sup aria-hidden="true">*</sup>
            </h2>
            <p className="lv3-bajada">{bajada}</p>
          </div>
        </div>
        <div className="lv3-service-unico">
          <div className="lv3-service-clorito">
            <Clorito pose="service" alto={400} decorativo={false} />
          </div>
          <div className="lv3-service-tarjetas">
            {SERVICIOS.map((s) => (
              <article key={s.id} className="lv3-service-card">
                <span className="eyebrow">{s.kicker}</span>
                <h3>{s.titulo}</h3>
                <small className="lv3-service-frecuencia">{s.frecuencia}</small>
                <p>{s.texto}</p>
                <ul>
                  {s.lista.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <BotonConsulta className="btn btn-blue" interes={s.interes}>
                  <WaIcon />
                  {s.boton}
                </BotonConsulta>
              </article>
            ))}
          </div>
        </div>
        <p className="v3-note lv3-service-nota">* {exclusiones}</p>
      </div>
    </section>
  );
}
