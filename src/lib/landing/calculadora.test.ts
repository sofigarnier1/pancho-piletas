import { describe, expect, it } from "vitest";
import { kgPorMes, litrosDePileta, pastillasPorSemana, recomendar } from "./calculadora";

describe("calculadora de cloro", () => {
  it("calcula los litros de una pileta rectangular", () => {
    expect(litrosDePileta({ largo: 8, ancho: 4, profundidad: 1.5 })).toBe(48000);
  });

  it("devuelve 0 si falta una medida o es absurda", () => {
    expect(litrosDePileta({ largo: 0, ancho: 4, profundidad: 1.5 })).toBe(0);
    expect(litrosDePileta({ largo: 8, ancho: Number.NaN, profundidad: 1.5 })).toBe(0);
    expect(litrosDePileta({ largo: 800, ancho: 4, profundidad: 1.5 })).toBe(0);
  });

  it("redondea las pastillas por semana para arriba, de a media", () => {
    expect(pastillasPorSemana(20000)).toBe(1);
    expect(pastillasPorSemana(30000)).toBe(1.5);
    expect(pastillasPorSemana(48000)).toBe(2.5);
    expect(pastillasPorSemana(1000)).toBe(0.5);
    expect(pastillasPorSemana(0)).toBe(0);
  });

  it("estima los kilos por mes y arma la recomendación", () => {
    expect(kgPorMes(2.5)).toBe(2.2);
    expect(recomendar({ largo: 8, ancho: 4, profundidad: 1.5 })).toEqual({ litros: 48000, pastillasSemana: 2.5, kgMes: 2.2 });
    expect(recomendar({ largo: 0, ancho: 0, profundidad: 0 })).toBeNull();
  });
});
