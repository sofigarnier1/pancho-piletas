"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Clorito } from "./Clorito";
import {
  ESTADOS_AGUA,
  interesesDe,
  LIMITES,
  PASOS,
  consultaVacia,
  errorDelPaso,
  interesDesde,
  interesPorNecesidad,
  mensajeConsulta,
  waLink,
  type Consulta,
  type Necesidad,
} from "@/lib/landing/consulta";

type AbrirConsulta = (opciones?: { interes?: string; producto?: string }) => void;

const ConsultaCtx = createContext<AbrirConsulta>(() => {});

/** Abre la consulta guiada desde cualquier botón de la landing. */
export const useConsulta = () => useContext(ConsultaCtx);

export function ConsultaProvider({ children }: { children: ReactNode }) {
  // cada apertura arranca un formulario nuevo con el interés del botón que la abrió
  const [apertura, setApertura] = useState<{ n: number; inicial: Consulta } | null>(null);

  const abrir = useCallback<AbrirConsulta>((opciones = {}) => {
    const { necesidad, interes } = interesDesde(opciones.interes ?? "");
    setApertura((prev) => ({ n: (prev?.n ?? 0) + 1, inicial: { ...consultaVacia(), necesidad, interes, producto: opciones.producto } }));
  }, []);

  return (
    <ConsultaCtx.Provider value={abrir}>
      {apertura && <ConsultaDialog key={apertura.n} inicial={apertura.inicial} onCerrar={() => setApertura(null)} />}
      {children}
    </ConsultaCtx.Provider>
  );
}

/** Botón que abre la consulta con un interés (y un producto) ya elegidos. */
export function BotonConsulta({
  interes,
  producto,
  className,
  children,
  ...rest
}: { interes?: string; producto?: string; className?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const abrir = useConsulta();
  return (
    <button type="button" className={className} data-boton-consulta="" onClick={() => abrir({ interes, producto })} {...rest}>
      {children}
    </button>
  );
}

const NECESIDADES: { valor: Necesidad; titulo: string; detalle: string }[] = [
  { valor: "cloro", titulo: "Quiero cloro", detalle: "Elegir una presentación o preparar la temporada." },
  { valor: "service", titulo: "Necesito service", detalle: "Mantenimiento o desagote y limpieza." },
];

function ConsultaDialog({ inicial, onCerrar }: { inicial: Consulta; onCerrar: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [c, setC] = useState<Consulta>(inicial);
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState("");
  const enfocar = useRef(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    d?.querySelector<HTMLInputElement>('input[name="need"]:checked')?.focus();
  }, []);

  useEffect(() => {
    if (!enfocar.current) return;
    enfocar.current = false;
    formRef.current?.querySelector<HTMLElement>(`fieldset[data-step="${paso}"] :is(input,select,textarea)`)?.focus();
  }, [paso]);

  const set = <K extends keyof Consulta>(k: K, v: Consulta[K]) => setC((prev) => ({ ...prev, [k]: v }));
  const irA = (p: number) => {
    enfocar.current = true;
    setError("");
    setPaso(p);
  };
  const seguir = () => {
    const e = errorDelPaso(paso, c);
    if (e) {
      setError(e);
      formRef.current?.querySelector<HTMLInputElement>('input[name="zone"]')?.focus();
      return;
    }
    irA(Math.min(2, paso + 1));
  };

  const mensaje = mensajeConsulta(c);

  return (
    <dialog
      id="contactDialog"
      ref={dialogRef}
      aria-labelledby="guideTitle"
      onClose={onCerrar}
      onClick={(e) => {
        // tocar el fondo oscuro cierra la consulta
        if (e.target !== dialogRef.current) return;
        const r = dialogRef.current.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialogRef.current.close();
      }}
    >
      <button type="button" className="close-dialog" aria-label="Cerrar consulta" onClick={() => dialogRef.current?.close()}>
        ×
      </button>
      <div className="guide-mascot">
        <Clorito pose="saludando" alto={68} />
        <div>
          <span className="eyebrow">Con Clorito es más fácil</span>
          <h2 id="guideTitle">Preparemos tu pedido.</h2>
        </div>
      </div>
      <p className="guide-progress" aria-live="polite" id="guideProgress">
        Paso {paso + 1} de 3 · {PASOS[paso]}
      </p>
      <form
        id="guideForm"
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (paso < 2) seguir();
        }}
      >
        <fieldset data-step="0" hidden={paso !== 0}>
          <legend>¿En qué te ayudamos?</legend>
          {NECESIDADES.map((n) => (
            <label className="choice" key={n.valor}>
              <input
                type="radio"
                name="need"
                value={n.valor}
                checked={c.necesidad === n.valor}
                onChange={() => setC((prev) => ({ ...prev, necesidad: n.valor, interes: interesPorNecesidad(n.valor), producto: undefined }))}
              />
              <span>
                <b>{n.titulo}</b>
                <small>{n.detalle}</small>
              </span>
            </label>
          ))}
          <label className="field">
            Tu consulta
            <select name="interest" value={c.interes} onChange={(e) => set("interes", e.target.value as Consulta["interes"])}>
              {interesesDe(c.necesidad).map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          {c.producto && <p className="field-help">Producto elegido: {c.producto}</p>}
          <p className="field-help">La presentación, el precio y la disponibilidad se confirman con Pancho.</p>
        </fieldset>

        <fieldset data-step="1" hidden={paso !== 1}>
          <legend>Contanos un poco más.</legend>
          <label className="field">
            Localidad o barrio <span>(necesario)</span>
            <input
              name="zone"
              value={c.zona}
              onChange={(e) => set("zona", e.target.value)}
              maxLength={LIMITES.zona}
              autoComplete="address-level2"
              placeholder="Por ejemplo: Tigre"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "guideError" : undefined}
            />
          </label>
          <label className="field">
            ¿Cómo está el agua?
            <select name="water" value={c.agua} onChange={(e) => set("agua", e.target.value)}>
              {ESTADOS_AGUA.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Medidas aproximadas <span>(opcional)</span>
            <input
              name="size"
              value={c.medidas}
              onChange={(e) => set("medidas", e.target.value)}
              maxLength={LIMITES.medidas}
              placeholder="Largo × ancho × profundidad, si las sabés"
            />
          </label>
          <p className="field-help">No calculamos dosis. Pancho te orienta según tu pileta y el producto.</p>
        </fieldset>

        <fieldset data-step="2" hidden={paso !== 2}>
          <legend>Así le llegará a Pancho.</legend>
          <label className="field">
            Algo más que quieras contar <span>(opcional)</span>
            <textarea
              name="notes"
              value={c.notas}
              onChange={(e) => set("notas", e.target.value)}
              maxLength={LIMITES.notas}
              rows={2}
              placeholder="Frecuencia de uso, cuándo necesitás el service…"
            />
          </label>
          <div className="sample-message" id="sampleMessage" aria-live="polite" data-testid="mensaje-consulta">
            {mensaje}
          </div>
          <p className="field-help">
            La consulta no reserva productos ni turnos. Podés revisar el mensaje en WhatsApp y sumar una foto antes de enviarlo. Este
            formulario no guarda tus datos.
          </p>
          <a className="btn btn-blue" id="sendWhatsApp" href={waLink(mensaje)} target="_blank" rel="noopener noreferrer">
            Continuar en WhatsApp ↗
          </a>
        </fieldset>

        <p id="guideError" role="alert">
          {error}
        </p>
        <div className="guide-actions">
          {paso > 0 && (
            <button type="button" id="guideBack" onClick={() => irA(paso - 1)}>
              ← Atrás
            </button>
          )}
          {paso < 2 && (
            <button className="btn btn-blue" type="button" id="guideNext" onClick={seguir}>
              Seguir →
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
