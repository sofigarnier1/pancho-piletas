import { describe, expect, it } from "vitest";
import { resumirClicks } from "./clicks";

describe("resumen de toques a WhatsApp", () => {
  const filas = [
    { boton: "Pedí cloro", seccion: "hero", origen: "instagram" },
    { boton: "Pedí cloro", seccion: "hero", origen: "directo" },
    { boton: "Agregar", seccion: "cloro", origen: "instagram" },
    { boton: "Pedí por WhatsApp", seccion: "barra-celu", origen: "instagram" },
  ];

  it("cuenta por sección, botón y origen, de más a menos", () => {
    const r = resumirClicks(filas);
    expect(r.total).toBe(4);
    expect(r.porSeccion[0]).toEqual({ clave: "hero", nombre: "Portada", total: 2 });
    expect(r.porSeccion.map((s) => s.nombre)).toContain("Barra del celu");
    expect(r.porBoton[0]).toEqual({ clave: "Pedí cloro", nombre: "Pedí cloro", total: 2 });
    expect(r.porOrigen[0]).toEqual({ clave: "instagram", nombre: "Instagram", total: 3 });
  });

  it("sin toques devuelve todo vacío", () => {
    expect(resumirClicks([])).toEqual({ total: 0, porSeccion: [], porBoton: [], porOrigen: [] });
  });
});
