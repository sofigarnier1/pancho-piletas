import { describe, expect, it } from "vitest";
import { cambiarCantidad, errorDelPedido, leerCarrito, mensajePedido, totalCents, unidades, type ItemCarrito } from "./carrito";

const pastillas = { id: "a", nombre: "Pastillas de cloro 1 kg", precioCents: 1250000 };
const granulado = { id: "b", nombre: "Cloro granulado 5 kg", precioCents: 4200000 };

describe("carrito", () => {
  it("suma, resta y saca productos", () => {
    let items: ItemCarrito[] = [];
    items = cambiarCantidad(items, pastillas, 1);
    items = cambiarCantidad(items, pastillas, 1);
    items = cambiarCantidad(items, granulado, 1);
    expect(unidades(items)).toBe(3);
    expect(totalCents(items)).toBe(2 * 1250000 + 4200000);
    items = cambiarCantidad(items, granulado, -1);
    expect(items.map((i) => i.id)).toEqual(["a"]);
    expect(cambiarCantidad([], pastillas, -1)).toEqual([]);
  });

  it("limita la cantidad a 99", () => {
    expect(cambiarCantidad([{ ...pastillas, cantidad: 99 }], pastillas, 5)[0].cantidad).toBe(99);
  });

  it("descarta lo guardado que no tiene forma válida", () => {
    expect(leerCarrito("basura")).toEqual([]);
    expect(leerCarrito(null)).toEqual([]);
    const crudo = JSON.stringify([{ ...pastillas, cantidad: 2 }, { id: "x" }, { ...pastillas, cantidad: 1 }, { ...granulado, cantidad: 0 }]);
    expect(leerCarrito(crudo)).toEqual([{ ...pastillas, cantidad: 2 }]);
  });

  it("pide nombre y dirección", () => {
    expect(errorDelPedido("", "Calle 1")).toMatch(/nombre/);
    expect(errorDelPedido("Ana", " ")).toMatch(/dirección/);
    expect(errorDelPedido("Ana", "Calle 1")).toBeNull();
  });

  it("arma el mensaje con lista, total, nombre y dirección", () => {
    const m = mensajePedido([{ ...pastillas, cantidad: 2 }], " Ana ", "Mitre 123, Tigre");
    expect(m).toContain("• 2 x Pastillas de cloro 1 kg — $25.000");
    expect(m).toContain("Total: $25.000");
    expect(m).toContain("Nombre: Ana");
    expect(m).toContain("Dirección: Mitre 123, Tigre");
  });
});
