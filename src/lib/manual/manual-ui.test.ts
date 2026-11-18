// Al revés que manual-negritas: cada botón, etiqueta de campo, título de diálogo y aria-label/title de la interfaz de un tema
// tiene que aparecer en el manual de ese tema. Lo que todavía falte vive en support/manual-ui-pendientes.json (no puede crecer:
// si agregás algo a la interfaz sin documentarlo, falla; si lo documentás, hay que sacarlo de la lista).
// MANUAL_FALTANTES=1 regenera esa lista.
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { TEMAS, SRC, archivosPropios, idCompleto, norm } from "./support/manual-ui"

const PENDIENTES_FILE = path.join(__dirname, "support/manual-ui-pendientes.json")

// Textos genéricos que no hace falta explicar pantalla por pantalla
const GENERICOS = new Set(
  ["cancelar", "guardar", "cerrar", "aceptar", "confirmar", "volver", "siguiente", "anterior", "si", "no", "crear", "editar", "eliminar", "buscar", "todos", "todas", "ver", "nuevo", "nueva", "activo", "inactivo", "ok", "cargando", "guardando", "creando", "enviando"].map(norm),
)

function etiquetas(src: string): string[] {
  const out = new Set<string>()
  const add = (raw: string) => {
    const t = raw.replace(/\s*\*$/, "").trim()
    const n = norm(t)
    if (n.length < 4 || n.length > 60 || GENERICOS.has(n)) return
    if (/[{}$=<>\\]|^\W*$|^\d/.test(t) || !/[a-záéíóúñ]/i.test(t)) return
    out.add(t)
  }
  // los placeholders son ejemplos de lo que se escribe, no etiquetas: no se exigen
  for (const m of src.matchAll(/(?:aria-label|title)="([^"{}]+)"/g)) add(m[1])
  for (const m of src.matchAll(/<(?:Button|Label|DialogTitle|SheetTitle|th|CardTitle)\b[^>]*>\s*([^<{}\n][^<{}\n]*?)\s*</g)) add(m[1])
  return [...out]
}

export function faltantes() {
  const res: Record<string, string[]> = {}
  for (const { tema, area } of TEMAS) {
    if (["glosario", "primeros-pasos", "recorrido"].includes(tema.id)) continue
    const manual = norm(JSON.stringify(tema))
    const sin = new Set<string>()
    for (const f of archivosPropios(tema, area)) {
      for (const e of etiquetas(fs.readFileSync(path.join(SRC, f), "utf8"))) if (!manual.includes(norm(e))) sin.add(e)
    }
    if (sin.size) res[idCompleto(tema, area)] = [...sin].sort()
  }
  return res
}

describe("la interfaz de cada tema está explicada en el manual", () => {
  const actual = faltantes()
  const pendientes: Record<string, string[]> = fs.existsSync(PENDIENTES_FILE) ? JSON.parse(fs.readFileSync(PENDIENTES_FILE, "utf8")) : {}
  if (process.env.MANUAL_FALTANTES) fs.writeFileSync(PENDIENTES_FILE, JSON.stringify(actual, null, 2) + "\n")

  it("no aparecen elementos nuevos sin documentar", () => {
    const nuevos = Object.entries(actual).flatMap(([t, l]) => l.filter((e) => !(pendientes[t] ?? []).includes(e)).map((e) => `${t}: ${e}`))
    expect(nuevos, "elementos de la interfaz que el manual no menciona: documentarlos en el tema").toEqual([])
  })

  it("la lista de pendientes no tiene elementos ya resueltos", () => {
    const resueltos = Object.entries(pendientes).flatMap(([t, l]) => l.filter((e) => !(actual[t] ?? []).includes(e)).map((e) => `${t}: ${e}`))
    expect(resueltos, "ya están en el manual: sacarlos de support/manual-ui-pendientes.json (MANUAL_FALTANTES=1 la regenera)").toEqual([])
  })
})
