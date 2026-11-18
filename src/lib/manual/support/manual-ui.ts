// Textos de la interfaz por tema del manual: los usan manual-negritas.test.ts y manual-ui.test.ts
import fs from "node:fs"
import path from "node:path"
import { TEMAS_ADMIN } from "@/content/manual/admin"
import { TEMAS_EMPLEADO } from "@/content/manual/empleado"
import { TEMAS_CLIENTE } from "@/content/manual/cliente"
import type { Area, Tema } from "@/content/manual/tipos"

export const SRC = path.resolve(__dirname, "../../..")
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\*\*|`/g, "").replace(/[“”"¿?¡!:.…,;()]/g, "").replace(/\s+/g, " ").trim()

// Archivos de interfaz (relativos a src/) que pertenecen a cada tema, por zona. "primeros-pasos" y el recorrido atraviesan
// varias pantallas: se miden contra toda la interfaz.
const ARCHIVOS: Record<Area, Record<string, RegExp>> = {
  admin: {
    "primeros-pasos": /./,
    recorrido: /./,
    // El Dashboard del dueño abre en ventanas el registro de la visita y el agregado de piletas del itinerario
    dashboard: /app\/admin\/(dashboard|itinerario\/visita\/\[id\]\/VisitaDueno|itinerario\/\[fecha\]\/AgregarPiletas)/,
    clientes: /app\/admin\/clientes/,
    piletas: /app\/admin\/piletas/,
    itinerario: /app\/admin\/itinerario/,
    services: /app\/admin\/services/,
    cobros: /app\/admin\/cobros/,
    empleados: /app\/admin\/empleados/,
    ventas: /app\/admin\/ventas/,
    stock: /(app\/admin\/stock|components\/admin\/(ImageUpload|LandingVista))/,
    puntos: /app\/admin\/puntos/,
    "landing-cms": /(app\/admin\/landing-cms|components\/admin\/(ImageUpload|LandingVista))/,
    roles: /app\/admin\/roles/,
    "si-algo-falla": /(components\/errores|app\/(global-)?error)/,
  },
  employee: {
    "primeros-pasos": /./,
    hoy: /app\/employee\/(itinerario|piletas|calendario)/,
    historial: /app\/employee\/historial/,
    "si-algo-falla": /(components\/errores|app\/(global-)?error)/,
  },
  client: {
    "primeros-pasos": /./,
    inicio: /app\/client\/dashboard/,
    compras: /app\/client\/compras/,
    servicios: /app\/client\/servicios/,
    puntos: /app\/client\/puntos/,
    "si-algo-falla": /(components\/errores|app\/(global-)?error)/,
  },
}
// Piezas compartidas que ven todos los temas (componentes base, menús y encabezados, el propio manual)
const COMUN = /components\/(ui|layout|manual|tabla)\//

export const idCompleto = (t: Tema, area: Area) => `${area}:${t.id}`

let archivos: string[] | null = null
export function todosLosArchivos(): string[] {
  archivos ??= [
    ...walk(path.join(SRC, "components")),
    ...walk(path.join(SRC, "app")).filter((f) => !f.includes("/api/") && !/\/(admin|employee|client)\/(manual|ayuda)\//.test(f)),
  ].filter((f) => /\.tsx$/.test(f)).map((f) => f.replace(SRC + "/", ""))
  return archivos
}

/** Archivos propios del tema (sin las piezas comunes): de ahí salen los botones y campos que el manual debe explicar */
export function archivosPropios(t: Tema, area: Area): string[] {
  const re = ARCHIVOS[area][t.id]
  return re ? todosLosArchivos().filter((rel) => re.test(rel) && !COMUN.test(rel)) : []
}

const cache = new Map<string, string>()
export function textoUI(t: Tema, area: Area): string {
  const key = idCompleto(t, area)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const re = ARCHIVOS[area][t.id]
  let texto = ""
  if (re) for (const rel of todosLosArchivos()) if (re.test(rel) || COMUN.test(rel)) texto += "\n" + fs.readFileSync(path.join(SRC, rel), "utf8")
  cache.set(key, texto)
  return texto
}

export const TEMAS: { tema: Tema; area: Area }[] = [
  ...TEMAS_ADMIN.map((tema) => ({ tema, area: "admin" as Area })),
  ...TEMAS_EMPLEADO.map((tema) => ({ tema, area: "employee" as Area })),
  ...TEMAS_CLIENTE.map((tema) => ({ tema, area: "client" as Area })),
]

/** Partes de una negrita que tienen que estar en pantalla: separa "A / B", saca "(ej: ...)" y lo que viene después de "→" */
export const partesDeNegrita = (n: string) =>
  n.replace(/\([^)]*\)/g, "").replace(/\s*[→>…].*$/, "").split(/\s\/\s|\//).map((x) => norm(x)).filter(Boolean)
