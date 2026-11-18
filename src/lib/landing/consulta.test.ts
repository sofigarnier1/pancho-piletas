import { describe, expect, it } from "vitest";
import {
  consultaVacia,
  errorDelPaso,
  formatoPrecio,
  interesDeTipo,
  interesDesde,
  interesPorNecesidad,
  mensajeConsulta,
  waLink,
} from "./consulta";

describe("consulta guiada de la landing", () => {
  it("el enlace va siempre al WhatsApp del negocio y codifica el texto", () => {
    expect(waLink()).toBe("https://wa.me/5491100000000");
    const link = waLink("Hola Pancho, ¿tenés cloro?\nZona: Tigre & San Isidro");
    expect(link.startsWith("https://wa.me/5491100000000?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Hola Pancho, ¿tenés cloro?\nZona: Tigre & San Isidro");
    expect(link).not.toContain(" ");
  });

  it("elige la necesidad y el interés según el botón que abrió la consulta (con o sin tildes)", () => {
    expect(interesDesde("pastillas triple acción")).toEqual({ necesidad: "cloro", interes: "Pastillas triple acción" });
    expect(interesDesde("combos de cloro")).toEqual({ necesidad: "cloro", interes: "Combos de cloro" });
    expect(interesDesde("presentaciones de cloro")).toEqual({ necesidad: "cloro", interes: "Compra de temporada" });
    expect(interesDesde("desagote y limpieza de pileta")).toEqual({ necesidad: "service", interes: "Desagote y limpieza" });
    expect(interesDesde("service")).toEqual({ necesidad: "service", interes: "Mantenimiento" });
    expect(interesDesde("")).toEqual({ necesidad: "cloro", interes: "Quiero orientación" });
  });

  it("al cambiar de necesidad propone un interés acorde", () => {
    expect(interesPorNecesidad("cloro")).toBe("Quiero orientación");
    expect(interesPorNecesidad("service")).toBe("Mantenimiento");
  });

  it("traduce el tipo de producto del catálogo a un interés", () => {
    expect(interesDeTipo("pastilla")).toBe("Pastillas triple acción");
    expect(interesDeTipo("combo")).toBe("Combos de cloro");
    expect(interesDeTipo("otro")).toBe("Quiero orientación");
  });

  it("la zona es obligatoria en el segundo paso; los demás no piden nada", () => {
    const c = consultaVacia();
    expect(errorDelPaso(0, c)).toBeNull();
    expect(errorDelPaso(1, c)).toMatch(/localidad o barrio/);
    expect(errorDelPaso(1, { ...c, zona: "   " })).toMatch(/localidad o barrio/);
    expect(errorDelPaso(1, { ...c, zona: "Tigre" })).toBeNull();
    expect(errorDelPaso(2, c)).toBeNull();
  });

  it("el mensaje incluye lo elegido y omite los campos opcionales vacíos", () => {
    const base = { ...consultaVacia(), interes: "Pastillas triple acción" as const, zona: "  Tigre ", agua: "Verde, necesito recuperarla" };
    expect(mensajeConsulta(base)).toBe(
      "Hola Pancho, quiero consultar por cloro para mi pileta.\nMe interesa: Pastillas triple acción.\nMi zona: Tigre.\nEstado del agua: Verde, necesito recuperarla.",
    );
    const completo = mensajeConsulta({ ...base, producto: "Pastillas x 10 kg", medidas: "8 × 4", notas: "La uso todos los días" });
    expect(completo).toContain("Producto: Pastillas x 10 kg.");
    expect(completo).toContain("Medidas aproximadas: 8 × 4.");
    expect(completo.endsWith("La uso todos los días")).toBe(true);
  });

  it("el mensaje cambia la presentación para service", () => {
    expect(mensajeConsulta({ ...consultaVacia(), necesidad: "service", interes: "Desagote y limpieza", zona: "Pilar" })).toMatch(/^Hola Pancho, quiero consultar por service para mi pileta\./);
  });

  it("el precio se muestra en pesos sin centavos", () => {
    expect(formatoPrecio(3500000)).toBe("$35.000");
    expect(formatoPrecio(199999)).toBe("$2.000");
  });
});
