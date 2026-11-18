import type { UserRole } from "@/lib/supabase/user"
import type { Area, Seccion, Tema } from "@/content/manual/tipos"
import { TEMAS_ADMIN } from "@/content/manual/admin"
import { TEMAS_EMPLEADO } from "@/content/manual/empleado"
import { TEMAS_CLIENTE } from "@/content/manual/cliente"

// Lógica pura (sin base de datos): qué manual ve cada rol y qué sección corresponde a una pantalla.
// Refleja el menú de cada zona: el equipo (super_admin, owner, marketing) ve los temas de su rol dentro de /admin;
// el empleado solo el manual de /employee y el cliente solo el de /client.

export const areaDe = (rol: UserRole): Area => (rol === "employee" ? "employee" : rol === "client" ? "client" : "admin")

export const BASE: Record<Area, string> = { admin: "/admin/manual", employee: "/employee/ayuda", client: "/client/ayuda" }
export const base = (rol: UserRole): string => BASE[areaDe(rol)]

/** A qué zona pertenece una ruta de la app (null si no es de ninguna) */
export function areaDeRuta(ruta: string): Area | null {
  const m = /^\/(admin|employee|client)(\/|$)/.exec(ruta)
  return m ? (m[1] as Area) : null
}

export function temasPara(rol: UserRole): Tema[] {
  const area = areaDe(rol)
  if (area === "employee") return TEMAS_EMPLEADO
  if (area === "client") return TEMAS_CLIENTE
  return TEMAS_ADMIN.filter((t) => !t.roles || t.roles.includes(rol))
}

function aRegex(patron: string): RegExp {
  const fuente = patron
    .split("/")
    .map((s) => (/^\[.+\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|\\]/g, "\\$&")))
    .join("/")
  return new RegExp(`^${fuente}/?$`)
}

/** Puntaje de un patrón contra una ruta: -1 si no coincide; más alto = más específico (lo estático gana a lo dinámico) */
function puntaje(patron: string, ruta: string): number {
  if (!aRegex(patron).test(ruta)) return -1
  return patron.split("/").filter((s) => s && !/^\[.+\]$/.test(s)).length * 10
}

export function buscarSeccion(temas: Tema[], ruta: string): { tema: Tema; seccion: Seccion } | null {
  const limpia = ruta.split("?")[0].split("#")[0]
  let mejor: { tema: Tema; seccion: Seccion; p: number } | null = null
  for (const tema of temas) {
    for (const seccion of tema.secciones) {
      for (const patron of seccion.rutas) {
        const p = puntaje(patron, limpia)
        if (p >= 0 && (!mejor || p > mejor.p)) mejor = { tema, seccion, p }
      }
    }
  }
  return mejor ? { tema: mejor.tema, seccion: mejor.seccion } : null
}

/** Texto plano de una sección, para el buscador */
export function textoPlano(t: Tema, s: Seccion): string {
  const partes = [
    t.titulo, s.titulo, s.resumen, ...(s.queVes ?? []), ...(s.reglas ?? []),
    ...s.tareas.flatMap((x) => [x.titulo, x.cuando ?? "", ...x.pasos, x.resultado ?? "", ...(x.notas ?? [])]),
    ...(s.campos ?? []).map((c) => `${c.nombre} ${c.descripcion}`),
    ...(s.estados ?? []).map((e) => `${e.nombre} ${e.descripcion}`),
    ...(s.avisos ?? []).map((a) => `${a.mensaje} ${a.solucion}`),
    ...(s.faq ?? []).map((f) => `${f.p} ${f.r}`),
  ]
  return partes.join(" ").replace(/\*\*|`/g, "")
}

export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
