"use client";

import { useEffect, useRef } from "react";
import { formatoPrecio } from "@/lib/landing/consulta";
import { BotonAgregar } from "./Carrito";

export type DatosDetalle = {
  id: string;
  nombre: string;
  foto: string;
  tipo: string;
  presentacion: string;
  descripcion: string | null;
  precioCents: number;
  disponible: boolean;
  etiqueta: string;
  detalleKg?: string;
};

/** Hoja que sube desde abajo (celu) con la foto grande, la descripción y el botón de agregar. */
export default function DetalleProducto({ p, onCerrar }: { p: DatosDetalle; onCerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    d?.focus(); // el foco no cae en la ×
  }, []);

  return (
    <dialog
      ref={ref}
      className="lv3-detalle"
      aria-labelledby="detalleTitulo"
      tabIndex={-1}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <button type="button" className="close-dialog" aria-label="Cerrar detalle" onClick={() => ref.current?.close()}>
        ×
      </button>
      <div className="lv3-detalle-foto">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto del producto (propia o del almacenamiento del proyecto) */}
        <img src={p.foto} alt={p.nombre} />
        <span>{p.etiqueta}</span>
      </div>
      <small className="lv3-detalle-tipo">
        {p.tipo}
        {p.presentacion && ` · ${p.presentacion}`}
      </small>
      <h2 id="detalleTitulo">{p.nombre}</h2>
      {p.descripcion && <p className="lv3-detalle-desc">{p.descripcion}</p>}
      <p className="lv3-detalle-precio">
        <b>{formatoPrecio(p.precioCents)}</b>
        <span className={p.disponible ? "hay" : undefined}>{p.disponible ? "Disponible" : "Consultar disponibilidad"}</span>
      </p>
      <BotonAgregar producto={{ id: p.id, nombre: p.nombre, precioCents: p.precioCents, imagen: p.foto, detalle: p.detalleKg }} />
    </dialog>
  );
}
