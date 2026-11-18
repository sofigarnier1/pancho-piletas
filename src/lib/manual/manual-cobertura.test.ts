// Cobertura MEDIDA del manual: cada acción de servidor y cada endpoint del código tiene que estar explicado en alguna tarea
// (campo `cubre`) o figurar en EXENTOS con el motivo; y cada mensaje de éxito o error que la app muestra tiene que aparecer
// en el manual del tema que corresponde. Si se agrega una acción, una ruta o un mensaje sin documentar, falla.
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { TEMAS_ADMIN } from "@/content/manual/admin"
import { TEMAS_EMPLEADO } from "@/content/manual/empleado"
import { TEMAS_CLIENTE } from "@/content/manual/cliente"

const SRC = path.resolve(__dirname, "../..")
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

// Lo que existe en el código pero no es "algo que una persona hace" desde una pantalla
const EXENTOS: Record<string, string> = {
  reorderItemAction: "ninguna pantalla la usa: el orden se cambia con Subir y Bajar, que usan reorderItineraryAction (explicada)",
  deleteRuleAction: "existe en el código pero no tiene botón en la pantalla: las reglas se desactivan, no se borran",
  deleteLevelAction: "existe en el código pero no tiene botón en la pantalla: los niveles se editan, no se borran",
}

const TODOS = [...TEMAS_ADMIN, ...TEMAS_EMPLEADO, ...TEMAS_CLIENTE]
const cubiertas = new Set(TODOS.flatMap((t) => t.secciones.flatMap((s) => s.tareas.flatMap((x) => x.cubre ?? []))))

function acciones() {
  const out: string[] = []
  for (const f of walk(path.join(SRC, "app")).filter((f) => /actions\.ts$/.test(f))) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^export async function (\w+)/gm)) out.push(m[1])
  }
  return out
}

function endpoints() {
  const out: string[] = []
  for (const f of walk(path.join(SRC, "app/api")).filter((f) => f.endsWith("/route.ts"))) {
    const route = "/" + path.relative(path.join(SRC, "app"), path.dirname(f)).split(path.sep).join("/")
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/gm)) out.push(`${m[1]} ${route}`)
  }
  return out
}

describe("cobertura medida del manual", () => {
  it("toda acción de servidor está explicada en una tarea", () => {
    const sin = [...new Set(acciones())].filter((a) => !cubiertas.has(a) && !EXENTOS[a])
    expect(sin, "acciones sin documentar en el manual (agregar `cubre` en la tarea que corresponda)").toEqual([])
  })

  it("todo endpoint de la API está explicado en una tarea", () => {
    const sin = endpoints().filter((e) => !cubiertas.has(e) && !EXENTOS[e])
    expect(sin, "endpoints sin documentar en el manual").toEqual([])
  })

  it("`cubre` no menciona nada que ya no exista", () => {
    const reales = new Set([...acciones(), ...endpoints()])
    expect([...cubiertas].filter((c) => !reales.has(c))).toEqual([])
  })

  it("las exenciones siguen siendo reales", () => {
    const reales = new Set([...acciones(), ...endpoints()])
    expect(Object.keys(EXENTOS).filter((e) => !reales.has(e))).toEqual([])
  })

  // ---- Mensajes literales: éxito y error que la persona ve en pantalla ----
  it("cada mensaje de éxito o error literal del código está explicado en el manual de su tema", () => {
    const sin: string[] = []
    for (const [archivo, mensajes] of Object.entries(mensajesLiterales())) {
      const temas = temasDe(archivo)
      expect(temas, `sin tema asignado para ${archivo}: agregarlo a TEMAS_POR_RUTA`).not.toBeNull()
      const texto = temas!.map((t) => textoDelTema(t)).join(" ")
      for (const m of mensajes) if (!texto.includes(norm(m))) sin.push(`${archivo.replace(SRC + "/", "")}: ${m}`)
    }
    expect(sin, "mensajes de la app que el manual no menciona (agregarlos como `avisos` o en los pasos del tema)").toEqual([])
  })
})

// Sin tildes, mayúsculas, signos ni asteriscos: así comparamos el texto del código con el del manual
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\*\*|`/g, "").replace(/[“”"¿?¡!:.…,;()]/g, "").replace(/\s+/g, " ").trim()

function textoDelTema(clave: string): string {
  const [area, id] = clave.split(":")
  const temas = area === "employee" ? TEMAS_EMPLEADO : area === "client" ? TEMAS_CLIENTE : TEMAS_ADMIN
  return norm(JSON.stringify(temas.filter((t) => t.id === id)))
}

const TODOS_PRIMEROS = ["admin:primeros-pasos", "employee:primeros-pasos", "client:primeros-pasos"]
// Archivo → temas donde se explica ("area:tema"). El primer patrón que coincide gana.
const TEMAS_POR_RUTA: [RegExp, string[]][] = [
  [/app\/\(auth\)|components\/layout\/|lib\/auth\//, TODOS_PRIMEROS],
  [/app\/admin\/dashboard/, ["admin:dashboard"]],
  [/app\/admin\/clientes/, ["admin:clientes"]],
  [/app\/admin\/piletas/, ["admin:piletas"]],
  [/app\/admin\/itinerario/, ["admin:itinerario"]],
  [/app\/admin\/services/, ["admin:services"]],
  [/app\/admin\/empleados/, ["admin:empleados"]],
  [/app\/admin\/cobros/, ["admin:cobros"]],
  [/app\/admin\/ventas/, ["admin:ventas"]],
  [/app\/admin\/stock/, ["admin:stock"]],
  [/app\/admin\/puntos/, ["admin:puntos"]],
  [/app\/admin\/landing-cms/, ["admin:landing-cms"]],
  [/app\/admin\/roles/, ["admin:roles"]],
  [/app\/employee\//, ["employee:hoy", "employee:historial"]],
  [/app\/client\/dashboard/, ["client:inicio"]],
  [/app\/client\/compras/, ["client:compras"]],
  [/app\/client\/servicios/, ["client:servicios"]],
  [/app\/client\/puntos/, ["client:puntos"]],
]

function temasDe(archivo: string): string[] | null {
  const rel = archivo.replace(SRC + "/", "")
  for (const [re, temas] of TEMAS_POR_RUTA) if (re.test(rel)) return temas
  return null
}

// Strings literales que la app muestra: { error: "..." } y toast.success/error/warning("...")
function mensajesLiterales(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const archivos = [
    ...walk(path.join(SRC, "app")).filter((f) => /(actions\.ts|\.tsx)$/.test(f) && !/\/(admin|employee|client)\/(manual|ayuda)\//.test(f)),
    ...walk(path.join(SRC, "components/layout")).filter((f) => f.endsWith(".tsx")),
    path.join(SRC, "lib/auth/require-role.ts"),
  ]
  for (const f of archivos) {
    const s = fs.readFileSync(f, "utf8")
    const set = new Set<string>()
    for (const m of s.matchAll(/error: ?(?:"([^"\n]{4,})"|'([^'\n]{4,})')/g)) set.add((m[1] ?? m[2])!)
    for (const m of s.matchAll(/toast\.(?:success|error|warning)\(\s*(?:"([^"\n]{4,})"|'([^'\n]{4,})')/g)) set.add((m[1] ?? m[2])!)
    for (const t of [...set]) if (!/^[A-ZÁÉÍÓÚÑ¿¡]/.test(t) || !t.includes(" ")) set.delete(t)
    if (set.size) out[f] = [...set]
  }
  return out
}
