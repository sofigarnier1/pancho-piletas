"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatoPrecio, waLink } from "@/lib/landing/consulta";
import {
  CLAVE_CARRITO,
  LIMITES_CARRITO,
  cambiarCantidad,
  cantidadDe,
  errorDelPedido,
  leerCarrito,
  mensajePedido,
  totalCents,
  unidades,
  type ItemCarrito,
} from "@/lib/landing/carrito";
import { MessageCircle, ShoppingCart, Trash2 } from "lucide-react";

type Producto = Omit<ItemCarrito, "cantidad">;
type Ctx = {
  items: ItemCarrito[];
  cambiar: (p: Producto, delta: number) => void;
  vaciar: () => void;
  abrir: () => void;
};

const CarritoCtx = createContext<Ctx>({
  items: [],
  cambiar: () => {},
  vaciar: () => {},
  abrir: () => {},
});
export const useCarrito = () => useContext(CarritoCtx);

export function CarritoProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [abierto, setAbierto] = useState(false);
  const cargado = useRef(false);

  // Se lee después de montar (así el HTML del servidor y el del navegador coinciden)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee tras montar para no desfasar la hidratación
      setItems(leerCarrito(localStorage.getItem(CLAVE_CARRITO)));
    } catch {}
    cargado.current = true;
  }, []);

  useEffect(() => {
    if (!cargado.current) return;
    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(items));
    } catch {}
  }, [items]);

  const cambiar = useCallback(
    (p: Producto, delta: number) =>
      setItems((prev) => cambiarCantidad(prev, p, delta)),
    [],
  );
  const vaciar = useCallback(() => setItems([]), []);
  const abrir = useCallback(() => setAbierto(true), []);

  return (
    <CarritoCtx.Provider value={{ items, cambiar, vaciar, abrir }}>
      {children}
      <CarritoPastilla />
      {abierto && <CarritoDialog onCerrar={() => setAbierto(false)} />}
    </CarritoCtx.Provider>
  );
}

/** Botón "Agregar" de cada producto; una vez agregado pasa a − cantidad +. */
export function BotonAgregar({ producto }: { producto: Producto }) {
  const { items, cambiar } = useCarrito();
  const n = cantidadDe(items, producto.id);
  if (n === 0) {
    return (
      <button
        type="button"
        className="lv3-agregar"
        onClick={() => cambiar(producto, 1)}
        aria-label={`Agregar ${producto.nombre} al pedido`}
      >
        <span aria-hidden="true">+</span> Agregar
      </button>
    );
  }
  return (
    <div
      className="lv3-cantidad"
      role="group"
      aria-label={`Cantidad de ${producto.nombre}`}
    >
      <button
        type="button"
        onClick={() => cambiar(producto, -1)}
        aria-label={`Quitar una unidad de ${producto.nombre}`}
      >
        −
      </button>
      <output aria-live="polite">{n}</output>
      <button
        type="button"
        onClick={() => cambiar(producto, 1)}
        aria-label={`Sumar una unidad de ${producto.nombre}`}
      >
        +
      </button>
    </div>
  );
}

/** Pastilla fija abajo con el resumen; en el celu reemplaza a la barra de "Pedí por WhatsApp". */
function CarritoPastilla() {
  const { items, abrir } = useCarrito();
  if (items.length === 0) return null;
  return (
    <div className="lv3-carrito-pastilla" data-origen="carrito">
      <button
        type="button"
        className="btn btn-primary"
        data-boton-consulta=""
        data-etiqueta="Ver mi pedido"
        onClick={abrir}
      >
        <ShoppingCart aria-hidden="true" />
        <span>
          Ver mi pedido ({unidades(items)}) · {formatoPrecio(totalCents(items))}
        </span>
      </button>
    </div>
  );
}

function CarritoDialog({ onCerrar }: { onCerrar: () => void }) {
  const { items, cambiar, vaciar } = useCarrito();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [paso, setPaso] = useState<0 | 1>(0); // 0: ver el pedido y cuánto sale · 1: datos de entrega

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    d?.focus(); // el foco no cae en la ×: así no queda marcada
  }, []);

  // Si se vacía el pedido, se cierra solo
  useEffect(() => {
    if (items.length === 0) dialogRef.current?.close();
  }, [items.length]);

  const falta = errorDelPedido(nombre, direccion);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="carritoTitulo"
      tabIndex={-1}
      className="lv3-carrito-dialog"
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <button
        type="button"
        className="close-dialog"
        aria-label="Cerrar pedido"
        onClick={() => dialogRef.current?.close()}
      >
        ×
      </button>
      <header className="lv3-carrito-cabeza">
        <ShoppingCart aria-hidden="true" />
        <h2 id="carritoTitulo">Tu pedido</h2>
        <span>
          {unidades(items)} {unidades(items) === 1 ? "producto" : "productos"}
        </span>
      </header>
      {paso === 0 ? (
        <>
          <ul className="lv3-carrito-lista">
            {items.map((i) => (
              <li key={i.id}>
                {i.imagen && (
                  // eslint-disable-next-line @next/next/no-img-element -- foto del producto (propia o del almacenamiento del proyecto)
                  <img src={i.imagen} alt="" width={76} height={76} />
                )}
                <div className="lv3-carrito-dato">
                  <b>{i.nombre}</b>
                  {i.detalle && <small>Presentación de {i.detalle}</small>}
                  <span>
                    {i.cantidad} × {formatoPrecio(i.precioCents)}
                  </span>
                </div>
                <div className="lv3-carrito-der">
                  <b className="lv3-carrito-linea">
                    {formatoPrecio(i.cantidad * i.precioCents)}
                  </b>
                  <div className="lv3-carrito-acciones">
                    <button
                      type="button"
                      className="lv3-quitar"
                      onClick={() => cambiar(i, -i.cantidad)}
                      aria-label={`Quitar ${i.nombre} del pedido`}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                    <div
                      className="lv3-cantidad"
                      role="group"
                      aria-label={`Cantidad de ${i.nombre}`}
                    >
                      <button
                        type="button"
                        onClick={() => cambiar(i, -1)}
                        aria-label={`Quitar una unidad de ${i.nombre}`}
                      >
                        −
                      </button>
                      <output>{i.cantidad}</output>
                      <button
                        type="button"
                        onClick={() => cambiar(i, 1)}
                        aria-label={`Sumar una unidad de ${i.nombre}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <dl className="lv3-carrito-resumen">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatoPrecio(totalCents(items))}</dd>
            </div>
            <div>
              <dt>Envío en Zona Norte</dt>
              <dd className="gratis">Gratis</dd>
            </div>
            <div className="total">
              <dt>Total</dt>
              <dd data-testid="carrito-total">
                {formatoPrecio(totalCents(items))}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn btn-blue lv3-llama"
            onClick={() => setPaso(1)}
          >
            <MessageCircle aria-hidden="true" /> Enviar pedido por WhatsApp
          </button>
          <button type="button" className="lv3-carrito-vaciar" onClick={vaciar}>
            Vaciar pedido
          </button>
        </>
      ) : (
        <>
          <p className="lv3-carrito-total-chico">
            <span>Total del pedido</span>
            <b data-testid="carrito-total">
              {formatoPrecio(totalCents(items))}
            </b>
          </p>
          <h3 className="lv3-carrito-sub">Datos de entrega</h3>
          <label className="field">
            Nombre{" "}
            <span className="lv3-obligatorio" aria-hidden="true">
              *
            </span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={LIMITES_CARRITO.nombre}
              autoComplete="name"
              required
            />
          </label>
          <label className="field">
            Dirección de entrega{" "}
            <span className="lv3-obligatorio" aria-hidden="true">
              *
            </span>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              maxLength={LIMITES_CARRITO.direccion}
              autoComplete="street-address"
              placeholder="Calle, número y localidad"
              required
            />
          </label>
          <p className="field-help">
            * Campos obligatorios. Envío gratis solo en Zona Norte.
          </p>
          {falta ? (
            <button
              type="button"
              className="btn btn-blue lv3-carrito-enviar"
              disabled
            >
              <MessageCircle aria-hidden="true" /> Enviar pedido por WhatsApp
            </button>
          ) : (
            <a
              className="btn btn-blue lv3-llama"
              href={waLink(mensajePedido(items, nombre, direccion))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden="true" /> Enviar pedido por WhatsApp
            </a>
          )}
          <button
            type="button"
            className="lv3-carrito-vaciar"
            onClick={() => setPaso(0)}
          >
            ← Volver a mi pedido
          </button>
        </>
      )}
    </dialog>
  );
}
