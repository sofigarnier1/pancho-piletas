// Cada **texto en negrita** del manual (botón, campo, pestaña) tiene que existir literal en la interfaz del tema.
import { describe, expect, it } from "vitest"
import { TEMAS, idCompleto, norm, partesDeNegrita, textoUI } from "./support/manual-ui"
import type { Tema } from "@/content/manual/tipos"

// Negritas que no son un texto de pantalla (nombres de sección, valores de ejemplo). Con motivo.
const EXENTAS: Record<string, string> = {
  X: "es el botón de cerrar la búsqueda del manual, que es un ícono",
}

function negritas(t: Tema): string[] {
  const out = new Set<string>()
  for (const m of JSON.stringify(t).matchAll(/\*\*([^*]{1,80}?)\*\*/g)) out.add(m[1].replace(/\\"/g, '"'))
  return [...out]
}

describe("las negritas del manual existen en la interfaz", () => {
  for (const { tema, area } of TEMAS) {
    if (tema.id === "glosario") continue // el glosario explica palabras, no pantallas
    it(idCompleto(tema, area), () => {
      const ui = norm(textoUI(tema, area))
      const sin = negritas(tema).filter((n) => !EXENTAS[n] && !partesDeNegrita(n).every((p) => ui.includes(p)))
      expect(sin, "negritas que no se encuentran en los componentes del tema (corregir el texto o justificar en EXENTAS)").toEqual([])
    })
  }
})
