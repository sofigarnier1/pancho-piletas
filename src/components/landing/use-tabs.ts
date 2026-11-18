"use client";

import { useRef, useState, type KeyboardEvent } from "react";

/** Pestañas accesibles: una sola enfocable, flechas / Inicio / Fin para moverse (como en la demo). */
export function useTabs(cantidad: number, inicial = 0) {
  const [activa, setActiva] = useState(inicial);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabProps = (i: number) => ({
    role: "tab" as const,
    type: "button" as const,
    "aria-selected": activa === i,
    tabIndex: activa === i ? 0 : -1,
    ref: (el: HTMLButtonElement | null) => {
      refs.current[i] = el;
    },
    onClick: () => setActiva(i),
    onKeyDown: (e: KeyboardEvent) => {
      let next: number | undefined;
      if (e.key === "ArrowRight") next = (i + 1) % cantidad;
      if (e.key === "ArrowLeft") next = (i + cantidad - 1) % cantidad;
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = cantidad - 1;
      if (next === undefined) return;
      e.preventDefault();
      setActiva(next);
      refs.current[next]?.focus();
    },
  });

  return { activa, setActiva, tabProps };
}
