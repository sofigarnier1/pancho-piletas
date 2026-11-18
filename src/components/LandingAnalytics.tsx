"use client";

import { useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { conOrigenEnMensaje, detectarOrigen, guardarOrigen, leerOrigenGuardado } from "@/lib/landing/origen";

type DataLayerWindow = Window & {
  dataLayer?: Array<Record<string, unknown>>;
};

/** Sección de la landing donde está un elemento (para saber qué botón se toca más). */
const seccionDe = (el: Element): string =>
  el.closest<HTMLElement>("[data-origen]")?.dataset.origen || el.closest("section")?.id || (el.closest("header") ? "header" : "otro");

export default function LandingAnalytics() {
  useEffect(() => {
    const origen = detectarOrigen(window.location.search, leerOrigenGuardado());
    guardarOrigen(origen);
    // El asistente de consulta abre un diálogo: el toque final a WhatsApp se cuenta como del botón que lo abrió
    let ultimo: { boton: string; seccion: string } | null = null;

    const registrar = (boton: string, seccion: string) => {
      const fila = { boton: boton.slice(0, 60) || "WhatsApp", seccion: seccion.slice(0, 30), origen };
      void createBrowserSupabaseClient()
        .from("landing_clicks")
        .insert(fila)
        .then(
          () => {},
          () => {},
        );
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const abre = target?.closest<HTMLElement>("[data-boton-consulta]");
      if (abre) ultimo = { boton: abre.dataset.etiqueta || abre.textContent?.trim() || "Consulta", seccion: seccionDe(abre) };

      const link = target?.closest<HTMLAnchorElement>('a[href*="wa.me"]');
      if (!link) return;

      link.href = conOrigenEnMensaje(link.href, origen);
      const enDialogo = Boolean(link.closest("dialog"));
      const boton = enDialogo && ultimo ? ultimo.boton : link.textContent?.trim() || link.getAttribute("aria-label") || "WhatsApp";
      const seccion = enDialogo && ultimo ? ultimo.seccion : seccionDe(link);

      const detail = {
        event: "whatsapp_click",
        label: boton,
        section: seccion,
        path: window.location.pathname,
        source: origen,
        campaign: new URLSearchParams(window.location.search).get("utm_campaign") || undefined,
      };

      window.dispatchEvent(new CustomEvent("landing:whatsapp-click", { detail }));
      (window as DataLayerWindow).dataLayer?.push(detail);
      registrar(boton, seccion);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
