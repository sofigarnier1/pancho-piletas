import type { ReactNode } from "react";
import type { Testimonial } from "@/lib/landing-format";
import { waLink } from "@/lib/landing/consulta";
import MapaZonas from "./MapaZonas";
import { BotonConsulta } from "./consulta";
import { InstagramIcon, Marca, WaIcon } from "./iconos";
import { Clorito } from "./Clorito";

/** "Atención directa. Cuidado de verdad." → una oración por renglón */
function Renglones({ texto }: { texto: string }) {
  const partes = texto.split(/(?<=[.!?])\s+/);
  return (
    <>
      {partes.map((p, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {p}
        </span>
      ))}
    </>
  );
}

type NosotrosProps = { titulo: string; cuerpo: string; cobertura: string; anios?: string; clientes?: string; children?: ReactNode };

export function Nosotros({ titulo, cuerpo, cobertura, anios, clientes, children }: NosotrosProps) {
  return (
    <section className="personal sec" id="nosotros">
      <div className="wrap personal-grid">
        <div>
          <span className="eyebrow">Cerca de tu pileta</span>
          <h2>
            <Renglones texto={titulo} />
          </h2>
        </div>
        <div>
          <p>{cuerpo}</p>
          {(anios || clientes) && (
            <ul className="lv3-datos">
              {anios && (
                <li>
                  <b>{anios} años</b> cuidando piletas
                </li>
              )}
              {clientes && (
                <li>
                  <b>+{clientes}</b> clientes de service
                </li>
              )}
            </ul>
          )}
        </div>
        <div className="lv3-zonas-fila">
          <MapaZonas cobertura={cobertura} />
        </div>
      </div>
      {children}
    </section>
  );
}

export function Testimonios({ testimonios, resenasUrl }: { testimonios: Testimonial[]; resenasUrl?: string }) {
  if (testimonios.length === 0) return null;
  return (
    <div className="wrap lv3-testimonios" aria-labelledby="testimonios-title" role="region">
        <div className="lv3-testimonios-cabecera">
          <div>
            <span className="eyebrow">Clientes reales</span>
            <h2 id="testimonios-title">Mirá lo que dicen nuestros clientes.</h2>
          </div>
          <Clorito pose="aprobacion" alto={150} />
        </div>
        <div className="lv3-testimonios-grid">
          {testimonios.map((t) => (
            <article key={`${t.name}-${t.zone ?? ""}`}>
              {t.rating && (
                <p className="lv3-estrellas" aria-label={`${t.rating} estrellas`}>
                  {"★".repeat(t.rating)}
                </p>
              )}
              <p>“{t.text}”</p>
              <div className="lv3-autor">
                {t.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- foto del cliente (almacenamiento del proyecto)
                  <img className="lv3-autor-foto" src={t.imageUrl} alt={`Foto de ${t.name}`} loading="lazy" />
                )}
                <div>
                  <b>{t.name}</b>
                  {t.zone && <span>{t.zone}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
        {resenasUrl && (
          <a className="lv3-resenas" href={resenasUrl} target="_blank" rel="noopener noreferrer">
            Ver todas las reseñas
          </a>
        )}
    </div>
  );
}

export function Preguntas({ mediosDePago }: { mediosDePago?: string }) {
  const faqs = [
    {
      p: "¿Qué presentaciones tienen?",
      r: "Las que ves en el catálogo de esta página, con su precio. La disponibilidad puede variar: te la confirmamos por WhatsApp antes de coordinar la entrega.",
    },
    {
      p: "¿Cuánto cloro necesita mi pileta?",
      r: "Depende de las medidas, el uso y el estado del agua. Contanos cómo es tu pileta y te orientamos para elegir qué comprar.",
    },
    { p: "¿En qué zonas trabajan?", r: "En Zona Norte de Buenos Aires. Consultanos con tu dirección para confirmar cobertura y coordinar." },
    {
      p: "¿Cómo puedo pagar?",
      r: mediosDePago
        ? `Aceptamos ${mediosDePago}. Lo confirmamos al cerrar el pedido por WhatsApp.`
        : "Te confirmamos las opciones de pago disponibles al momento de cerrar el pedido por WhatsApp.",
    },
    {
      p: "¿Tengo que registrarme para pedir?",
      r: "No. Pedís por WhatsApp y coordinás la compra, el pago y la visita directamente con Pancho y su equipo. Preparar un mensaje desde esta página no confirma un pedido ni reserva una fecha hasta que te respondamos.",
    },
    {
      p: "¿Qué incluye el service?",
      r: "Hay dos servicios. Mantenimiento, semanal o quincenal: limpieza del fondo, retiro de hojas y cuidado del agua, y si está verde la recuperamos. Desagote y limpieza: vaciamos la pileta y la limpiamos a fondo para empezar con agua limpia. No hacemos arreglos de pérdidas ni instalación de piletas.",
    },
    { p: "¿Cómo coordino el mantenimiento?", r: "Mandanos una foto y contanos qué necesitás. Conversamos sobre el trabajo y coordinamos la visita." },
    {
      p: "¿Cómo guardo las pastillas triple acción?",
      r: "Conservalas en su envase cerrado, en un lugar seco y ventilado, lejos del alcance de niños y mascotas. No mezcles productos químicos.",
    },
  ];
  return (
    <section className="sec questions" id="preguntas">
      <div className="wrap question-grid">
        <div className="lv3-preguntas-cabecera">
          <span className="eyebrow">Antes de empezar</span>
          <h2>Preguntas frecuentes.</h2>
        </div>
        <div className="lv3-preguntas-clorito">
          <Clorito pose="duda" alto={260} />
        </div>
        <div className="lv3-preguntas-lista">
          {faqs.map((f) => (
            <details key={f.p}>
              <summary>
                {f.p}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{f.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

type CierreProps = { condiciones: string[] };

export function Cierre({ condiciones }: CierreProps) {
  return (
    <section className="closing" id="contacto">
      {/* eslint-disable-next-line @next/next/no-img-element -- foto de fondo */}
      <img src="/landing/v3/noche-pileta.webp" alt="Pileta iluminada al anochecer" loading="lazy" />
      <div className="closing-shade"></div>
      <div className="wrap closing-content">
        <Clorito className="cierre-logo" pose="relajado" alto={190} decorativo={false} />
        <span className="eyebrow">El mejor plan está en casa</span>
        <h2>
          Dejala lista.
          <br />
          Disfrutala más.
        </h2>
        <p>Cloro y cuidado para tu pileta, con Pancho y su equipo.</p>
        <div className="lv3-cierre-acciones">
          <BotonConsulta className="btn btn-primary" id="contactButton">
            Pedí por WhatsApp <span aria-hidden="true">↗</span>
          </BotonConsulta>
          <Clorito className="cierre-logo-movil" pose="relajado" alto={96} />
        </div>
        {condiciones.length > 0 && (
          <ul className="lv3-condiciones" aria-label="Condiciones de compra y entrega">
            {condiciones.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

type FooterProps = { phone: string; instagram: string; coverageText: string; responsibleName?: string; termsUrl?: string; privacyUrl?: string };

export function LandingFooter({ phone, instagram, coverageText, responsibleName, termsUrl, privacyUrl }: FooterProps) {
  const ig = instagram.replace(/^@/, "");
  return (
    <footer>
      <div className="wrap sober-footer">
        <a className="brand" href="#top" aria-label="Pancho Piletas, volver al inicio">
          <Marca />
        </a>
        <div className="lv3-pie">
          <p className="lv3-pie-lema">Tu pileta limpia. Vos, quedate pancho.</p>
          <p>{coverageText}</p>
          {responsibleName && <p>Responsable: {responsibleName}</p>}
        </div>
        <div className="lv3-pie-links">
          <a href={waLink()} target="_blank" rel="noopener noreferrer">
            <WaIcon />
            {phone}
          </a>
          <a href={`https://www.instagram.com/${ig}`} target="_blank" rel="noopener noreferrer">
            <InstagramIcon />
            @{ig}
          </a>
          {termsUrl && (
            <a href={termsUrl} target="_blank" rel="noopener noreferrer">
              Términos y condiciones
            </a>
          )}
          {privacyUrl && (
            <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
              Política de privacidad
            </a>
          )}
        </div>
        <a className="lv3-pie-subir" href="#top" aria-label="Volver arriba">
          ↑
        </a>
      </div>
    </footer>
  );
}
