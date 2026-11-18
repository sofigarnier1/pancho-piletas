"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LandingProduct } from "@/lib/supabase/landing-products";
import { formatoPrecio } from "@/lib/landing/consulta";
import { esImagenDelProyecto } from "@/lib/landing/imagenes";
import { BotonConsulta } from "./consulta";
import { BotonAgregar } from "./Carrito";
import { useTabs } from "./use-tabs";
import { WaIcon } from "./iconos";
import Calculadora from "./Calculadora";
import DetalleProducto from "./DetalleProducto";

const TIPOS: Record<LandingProduct["chlorine_type"], { nombre: string; plural: string; foto: string }> = {
  pastilla: { nombre: "Pastillas triple acción", plural: "Pastillas triple acción", foto: "/landing/v3/tarjeta-cloro-pastillas.webp" },
  granulado: { nombre: "Granulado", plural: "Granulado", foto: "/landing/v3/tarjeta-cloro-granulado.webp" },
  liquido: { nombre: "Líquido", plural: "Líquido", foto: "/landing/v3/hero-cloro-pastillas.webp" },
  combo: { nombre: "Combo", plural: "Combos", foto: "/landing/v3/cloro-combo-semanal.webp" },
  otro: { nombre: "Otros", plural: "Otros", foto: "/landing/v3/cloro-pastillas-macro.webp" },
};
const ORDEN: LandingProduct["chlorine_type"][] = ["pastilla", "granulado", "liquido", "combo", "otro"];

// Solo imágenes propias o del almacenamiento del proyecto (las URLs las carga el equipo desde Stock)
const fotoDeProducto = (p: Pick<LandingProduct, "image_url" | "chlorine_type">) =>
  esImagenDelProyecto(p.image_url) ? p.image_url : TIPOS[p.chlorine_type].foto;

const presentacion = (p: LandingProduct) =>
  p.weight_kg ? `${String(p.weight_kg).replace(".", ",")} kg` : p.unit === "litro" ? "por litro" : p.unit === "kg" ? "por kg" : "";

const PASOS_PEDIDO: { titulo: string; texto: ReactNode; icono: ReactNode }[] = [
  {
    titulo: "Elegí tu cloro",
    texto: "Mirá las presentaciones y los precios acá abajo.",
    icono: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3Z" />
        <path d="M9.5 14a2.6 2.6 0 0 0 2.5 2.4" />
      </svg>
    ),
  },
  {
    titulo: "Sumalo al pedido",
    texto: (
      <>
        Tocá <b>Agregar</b> en lo que quieras y mandá el pedido por WhatsApp.
      </>
    ),
    icono: <WaIcon />,
  },
  {
    titulo: "Te lo llevamos",
    texto: "Nuestro equipo te confirma y te lo entrega gratis en Zona\u00a0Norte.",
    icono: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7z" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
      </svg>
    ),
  },
];

export default function Catalogo({ products }: { products: LandingProduct[] }) {
  const tipos = ORDEN.filter((t) => products.some((p) => p.chlorine_type === t));
  const filtros = [{ id: "todos", label: "Todos" }, ...tipos.map((t) => ({ id: t, label: TIPOS[t].plural }))];
  const { activa, setActiva, tabProps } = useTabs(filtros.length);
  // Desde la calculadora: muestra solo un tipo y sube hasta los filtros
  const verTipo = (tipo: LandingProduct["chlorine_type"]) => {
    const i = filtros.findIndex((f) => f.id === tipo);
    if (i < 0) return;
    setActiva(i);
    document.getElementById(`cat-${tipo}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  // Los botones "Ver granulado" de otras secciones (consejos) llegan por un evento
  useEffect(() => {
    const oir = (e: Event) => {
      const tipo = (e as CustomEvent<string>).detail as LandingProduct["chlorine_type"];
      if (filtros.some((f) => f.id === tipo)) verTipo(tipo);
      else document.getElementById("cloro")?.scrollIntoView({ behavior: "smooth" });
    };
    window.addEventListener("lv3-ver-tipo", oir);
    return () => window.removeEventListener("lv3-ver-tipo", oir);
  });
  const [verId, setVerId] = useState<string | null>(null);
  // En el celu los pasos muestran solo el título; al tocar uno aparece su explicación abajo
  const [pasoAbierto, setPasoAbierto] = useState<number | null>(null);
  // En el celu, tocar la foto o el nombre abre el detalle; en pantallas grandes no hace nada
  const abrirDetalle = (id: string) => {
    if (window.matchMedia("(max-width: 650px)").matches) setVerId(id);
  };
  const enDetalle = products.find((x) => x.id === verId);
  const visibles = activa === 0 ? products : products.filter((p) => p.chlorine_type === filtros[activa].id);

  return (
    <section className="v3-products sec" id="cloro">
      <div className="wrap">
        <div className="v3-head">
          <div>
            <h2>El mejor cloro para tu pileta.</h2>
          </div>
        </div>

        <div className="lv3-como">
          <h3 className="lv3-como-titulo">Pedir es fácil, en 3 pasos</h3>
          <ol className="lv3-pasos" aria-label="Cómo pedir">
            {PASOS_PEDIDO.map((paso, n) => (
              <li key={paso.titulo} className={pasoAbierto === n ? "abierto" : undefined}>
                <button type="button" className="lv3-paso-cabeza" aria-expanded={pasoAbierto === n} onClick={() => setPasoAbierto(pasoAbierto === n ? null : n)}>
                  <em aria-hidden="true">{n + 1}</em>
                  <i aria-hidden="true">{paso.icono}</i>
                  <b>{paso.titulo}</b>
                </button>
                <small>{paso.texto}</small>
              </li>
            ))}
          </ol>
          {pasoAbierto !== null && <p className="lv3-paso-detalle">{PASOS_PEDIDO[pasoAbierto].texto}</p>}
        </div>

        {products.length > 1 && filtros.length > 2 && (
          <div className="catalog-tabs lv3-filtros" role="tablist" aria-label="Tipos de producto">
            {filtros.map((f, i) => (
              <button key={f.id} id={`cat-${f.id}`} aria-controls="catalogo-productos" {...tabProps(i)}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        <div
          className="v3-product-grid lv3-catalogo"
          id="catalogo-productos"
          {...(filtros.length > 2 && products.length > 1 ? { role: "tabpanel", "aria-labelledby": `cat-${filtros[activa].id}` } : {})}
        >
          {visibles.map((p) => (
            <article className="v3-product" key={p.id} data-testid="producto">
              <div className="v3-image" onClick={() => abrirDetalle(p.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- foto del producto (propia o del almacenamiento del proyecto) */}
                <img src={fotoDeProducto(p)} alt={p.name} loading="lazy" />
                <span>{p.promo_label || (p.is_featured ? "Destacado" : TIPOS[p.chlorine_type].nombre)}</span>
              </div>
              <div className="v3-product-body">
                <small>
                  {TIPOS[p.chlorine_type].nombre.toUpperCase()}
                  {presentacion(p) && ` · ${presentacion(p)}`}
                </small>
                <h3 onClick={() => abrirDetalle(p.id)}>{p.name}</h3>
                {p.description && <p>{p.description}</p>}
                <p className="lv3-precio">
                  <b>{formatoPrecio(p.price_cents)}</b>
                  <span className={p.in_stock ? "hay" : undefined}>{p.in_stock ? "Disponible" : "Consultar disponibilidad"}</span>
                </p>
                <BotonAgregar producto={{ id: p.id, nombre: p.name, precioCents: p.price_cents, imagen: fotoDeProducto(p), detalle: p.weight_kg ? `${String(p.weight_kg).replace(".", ",")} kg` : undefined }} />
              </div>
            </article>
          ))}

          {products.length === 0 &&
            [
              { foto: TIPOS.pastilla.foto, tag: "Uso regular", kicker: "01 / PASTILLAS TRIPLE ACCIÓN", titulo: "Pastillas triple acción.", texto: "Para el cuidado regular. Presentación y disponibilidad a confirmar con nuestro equipo.", interes: "pastillas triple acción", boton: "Consultar por pastillas triple acción" },
              { foto: TIPOS.combo.foto, tag: "Para organizarte", kicker: "02 / PRESENTACIONES", titulo: "Tu compra de temporada.", texto: "Organizá la reposición según el uso de tu pileta. Te ayudamos a elegir la presentación.", interes: "presentaciones de cloro", boton: "Ver opciones de cloro" },
            ].map((c) => (
              <article className="v3-product" key={c.kicker}>
                <div className="v3-image">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ilustración de la categoría */}
                  <img src={c.foto} alt="Pastillas triple acción junto a la pileta" loading="lazy" />
                  <span>{c.tag}</span>
                </div>
                <div className="v3-product-body">
                  <small>{c.kicker}</small>
                  <h3>{c.titulo}</h3>
                  <p>{c.texto}</p>
                  <BotonConsulta interes={c.interes}>
                    {c.boton} <span aria-hidden="true">↗</span>
                  </BotonConsulta>
                </div>
              </article>
            ))}
        </div>

        {enDetalle && (
          <DetalleProducto
            key={enDetalle.id}
            onCerrar={() => setVerId(null)}
            p={{
              id: enDetalle.id,
              nombre: enDetalle.name,
              foto: fotoDeProducto(enDetalle),
              tipo: TIPOS[enDetalle.chlorine_type].nombre.toUpperCase(),
              presentacion: presentacion(enDetalle),
              descripcion: enDetalle.description,
              precioCents: enDetalle.price_cents,
              disponible: enDetalle.in_stock,
              etiqueta: enDetalle.promo_label || (enDetalle.is_featured ? "Destacado" : TIPOS[enDetalle.chlorine_type].nombre),
              detalleKg: enDetalle.weight_kg ? `${String(enDetalle.weight_kg).replace(".", ",")} kg` : undefined,
            }}
          />
        )}

        <Calculadora verGranulado={tipos.includes("granulado") ? () => verTipo("granulado") : undefined} />
      </div>
    </section>
  );
}
