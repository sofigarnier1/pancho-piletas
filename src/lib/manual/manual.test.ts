import { beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"

// ayudaRapidaAction pasa por requireRole → Supabase: se reemplaza por una sesión de mentira
let mockUser: { id: string; app_metadata: { role: string } } | null = null
let mockStatus = "active"
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    rpc: async () => ({ data: mockStatus }),
  }),
}))

import { TEMAS_ADMIN } from "@/content/manual/admin"
import { TEMAS_EMPLEADO } from "@/content/manual/empleado"
import { TEMAS_CLIENTE } from "@/content/manual/cliente"
import type { Area, Tema } from "@/content/manual/tipos"
import type { UserRole } from "@/lib/supabase/user"
import { areaDeRuta, buscarSeccion, temasPara, textoPlano } from "./resolver"
import { ayudaRapidaAction } from "./actions"

const SRC = path.resolve(__dirname, "../..")
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const rutaDe = (appDir: string, f: string) =>
  "/" + path.relative(appDir, path.dirname(f)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/")
const pantallas = (zona: string) => {
  const dir = path.join(SRC, "app", zona)
  return walk(dir).filter((f) => f.endsWith("/page.tsx")).map((f) => "/" + zona + (rutaDe(dir, f) === "/" ? "" : rutaDe(dir, f)))
}

const POR_AREA: Record<Area, Tema[]> = { admin: TEMAS_ADMIN, employee: TEMAS_EMPLEADO, client: TEMAS_CLIENTE }

describe("cobertura del manual: ninguna pantalla sin ayuda", () => {
  for (const area of ["admin", "employee", "client"] as Area[]) {
    it.each(pantallas(area))(`%s tiene su sección en el manual (${area})`, (ruta) => {
      const concreta = ruta.replace(/\[[^\]]+\]/g, "1")
      expect(buscarSeccion(POR_AREA[area], concreta), `falta ayuda para ${ruta}`).not.toBeNull()
    })
  }

  it("cada pantalla pública de acceso (login, recuperar, restablecer) está explicada en algún manual", () => {
    const rutas = new Set(Object.values(POR_AREA).flat().flatMap((t) => t.secciones.flatMap((s) => s.rutas)))
    for (const r of ["/login", "/recover", "/reset-password"]) expect(rutas.has(r), `falta explicar ${r}`).toBe(true)
  })
})

describe("integridad del contenido", () => {
  for (const [nombre, temas] of Object.entries(POR_AREA) as [string, Tema[]][]) {
    it(`${nombre}: ids únicos de temas, secciones y tareas`, () => {
      const ids = temas.map((t) => t.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).not.toContain("completo")
      for (const t of temas) {
        const sec = t.secciones.map((s) => s.id)
        expect(new Set(sec).size, `${t.id}: secciones repetidas`).toBe(sec.length)
        for (const s of t.secciones) {
          const tar = s.tareas.map((x) => x.id)
          expect(new Set(tar).size, `${t.id}/${s.id}: tareas repetidas`).toBe(tar.length)
        }
      }
    })

    it(`${nombre}: los temas relacionados existen y las capturas de las tareas están declaradas`, () => {
      const ids = new Set(temas.map((t) => t.id))
      for (const t of temas) {
        for (const r of t.relacionados ?? []) expect(ids.has(r), `${t.id} → ${r}`).toBe(true)
        for (const s of t.secciones) {
          const caps = new Set((s.capturas ?? []).map((c) => c.archivo))
          for (const x of s.tareas) if (x.captura) expect(caps.has(x.captura), `${t.id}/${s.id}/${x.id}`).toBe(true)
        }
      }
    })

    it(`${nombre}: cada tarea tiene pasos y cada sección un resumen`, () => {
      for (const t of temas) for (const s of t.secciones) {
        expect(s.resumen.length, `${t.id}/${s.id}`).toBeGreaterThan(10)
        for (const x of s.tareas) expect(x.pasos.length, `${t.id}/${s.id}/${x.id}`).toBeGreaterThan(0)
      }
    })

    it(`${nombre}: ningún texto termina vacío ni deja marcas de negrita sin cerrar`, () => {
      for (const t of temas) for (const s of t.secciones) {
        const plano = textoPlano(t, s)
        expect(plano, `${t.id}/${s.id}`).not.toMatch(/\*\*|undefined|\[object/)
      }
    })
  }

  it("las capturas declaradas existen en public/manual (se generan con npm run manual:capturas)", () => {
    const faltan: string[] = []
    for (const [area, temas] of Object.entries(POR_AREA) as [Area, Tema[]][]) {
      for (const t of temas) for (const s of t.secciones) for (const c of s.capturas ?? []) {
        const f = path.resolve(SRC, "../public/manual", area, t.id, `${c.archivo}.webp`)
        if (!fs.existsSync(f)) faltan.push(`${area}/${t.id}/${c.archivo}`)
      }
    }
    expect(faltan, "capturas sin generar").toEqual([])
  })
})

describe("qué ve cada rol", () => {
  const ids = (t: Tema[]) => t.map((x) => x.id)

  it("el empleado ve solo su manual y el cliente solo el suyo", () => {
    expect(temasPara("employee")).toBe(TEMAS_EMPLEADO)
    expect(temasPara("client")).toBe(TEMAS_CLIENTE)
  })

  it("el súper admin ve todos los temas del equipo", () => {
    expect(ids(temasPara("super_admin"))).toEqual(ids(TEMAS_ADMIN))
  })

  it("el dueño ve su operación y los puntos (solo lectura), pero no el contenido de la web ni roles", () => {
    const v = ids(temasPara("owner"))
    expect(v).toEqual(expect.arrayContaining(["primeros-pasos", "recorrido", "dashboard", "clientes", "piletas", "itinerario", "empleados", "ventas", "stock", "puntos", "glosario"]))
    for (const no of ["landing-cms", "roles"]) expect(v).not.toContain(no)
  })

  it("marketing ve tablero, stock, puntos y contenido de la web, pero no clientes, piletas, itinerario ni ventas", () => {
    const v = ids(temasPara("marketing"))
    expect(v).toEqual(expect.arrayContaining(["primeros-pasos", "dashboard", "stock", "puntos", "landing-cms", "glosario"]))
    for (const no of ["clientes", "piletas", "itinerario", "empleados", "ventas", "roles", "recorrido"]) expect(v).not.toContain(no)
  })

  it("el manual de un rol refleja su menú: ningún tema habla de pantallas que el rol no tiene", () => {
    const texto = (rol: UserRole) => temasPara(rol).flatMap((t) => t.secciones.map((s) => textoPlano(t, s))).join(" ")
    expect(texto("employee")).not.toMatch(/\/admin|Landing CMS|Asignar puntos|Gestión de roles/)
    expect(texto("client")).not.toMatch(/\/admin|\/employee|Landing CMS|Asignar puntos|Gestión de roles|Itinerario|Marcar/)
  })
})

describe("resolución de pantalla → sección", () => {
  const sec = (ruta: string) => buscarSeccion(TEMAS_ADMIN, ruta)?.seccion.id

  it("lo estático gana a lo dinámico", () => {
    expect(sec("/admin/clientes/nuevo")).toBe("nuevo")
    expect(sec("/admin/clientes/5f0e")).toBe("ficha")
    expect(sec("/admin/piletas/nueva")).toBe("nueva")
    expect(sec("/admin/piletas/5f0e")).toBe("detalle")
    expect(sec("/admin/itinerario")).toBe("calendario")
    expect(sec("/admin/itinerario/2026-10-19")).toBe("dia")
  })

  it("ignora los parámetros de la dirección (?q=, ?activas=) y las barras finales", () => {
    expect(sec("/admin/piletas?activas=no")).toBe("lista")
    expect(sec("/admin/clientes?q=ana&filter=active")).toBe("lista")
    expect(sec("/admin/stock/")).toBe("lista")
  })

  it("la edición de un producto tiene su sección y no pisa la de crear", () => {
    expect(sec("/admin/stock/5f0e/editar")).toBe("editar")
    expect(sec("/admin/stock/nuevo")).toBe("nuevo")
  })

  it("una ruta sin ayuda devuelve null", () => {
    expect(sec("/admin/no-existe")).toBeUndefined()
  })

  it("reconoce a qué zona pertenece una ruta", () => {
    expect(areaDeRuta("/admin/stock")).toBe("admin")
    expect(areaDeRuta("/employee/itinerario")).toBe("employee")
    expect(areaDeRuta("/client")).toBe("client")
    expect(areaDeRuta("/administrador")).toBeNull()
    expect(areaDeRuta("//evil.com")).toBeNull()
    expect(areaDeRuta("/api/auth/callback")).toBeNull()
  })
})

describe("ayudaRapidaAction", () => {
  const como = (role: string | null) => { mockUser = role ? { id: "u1", app_metadata: { role } } : null }
  beforeEach(() => { mockUser = null; mockStatus = "active" })

  it("sin sesión no devuelve nada", async () => {
    expect(await ayudaRapidaAction("/admin/clientes")).toBeNull()
  })

  it("rechaza rutas ajenas y entradas absurdas", async () => {
    como("owner")
    expect(await ayudaRapidaAction("/api/admin/clientes")).toBeNull()
    expect(await ayudaRapidaAction("//evil.com")).toBeNull()
    expect(await ayudaRapidaAction("/admin/" + "a".repeat(400))).toBeNull()
    expect(await ayudaRapidaAction(123 as unknown as string)).toBeNull()
  })

  it("nadie recibe la ayuda de otra zona", async () => {
    como("client")
    expect(await ayudaRapidaAction("/admin/clientes")).toBeNull()
    expect(await ayudaRapidaAction("/employee/itinerario")).toBeNull()
    expect((await ayudaRapidaAction("/client/compras"))?.href).toBe("/client/ayuda/compras#lista")
    como("employee")
    expect(await ayudaRapidaAction("/client/compras")).toBeNull()
    expect((await ayudaRapidaAction("/employee/itinerario"))?.href).toBe("/employee/ayuda/hoy#itinerario")
    como("owner")
    expect(await ayudaRapidaAction("/employee/itinerario")).toBeNull()
  })

  it("un rol no recibe ayuda de pantallas que no son de su menú", async () => {
    como("marketing")
    expect((await ayudaRapidaAction("/admin/puntos"))?.tema.id).toBe("puntos")
    expect(await ayudaRapidaAction("/admin/clientes")).toBeNull()
    expect(await ayudaRapidaAction("/admin/roles")).toBeNull()
    como("owner")
    expect((await ayudaRapidaAction("/admin/clientes"))?.tema.id).toBe("clientes")
    expect(await ayudaRapidaAction("/admin/roles")).toBeNull()
    como("super_admin")
    expect((await ayudaRapidaAction("/admin/roles"))?.tema.id).toBe("roles")
  })

  it("una cuenta bloqueada no recibe nada", async () => {
    como("owner")
    mockStatus = "blocked"
    expect(await ayudaRapidaAction("/admin/clientes")).toBeNull()
  })

  it("devuelve la sección y el enlace al manual", async () => {
    como("owner")
    const r = await ayudaRapidaAction("/admin/itinerario/2026-10-19")
    expect(r?.href).toBe("/admin/manual/itinerario#dia")
    expect(r?.seccion.tareas.length).toBeGreaterThan(0)
  })

  it("todas las pantallas del menú de cada rol tienen ayuda rápida", async () => {
    const MENU: Record<UserRole, string[]> = {
      super_admin: ["/admin/dashboard", "/admin/clientes", "/admin/clientes/nuevo", "/admin/clientes/abc", "/admin/piletas", "/admin/piletas/nueva", "/admin/piletas/abc", "/admin/itinerario", "/admin/itinerario/2026-10-19", "/admin/ventas", "/admin/ventas/nueva", "/admin/stock", "/admin/stock/nuevo", "/admin/landing-cms", "/admin/puntos", "/admin/puntos/niveles", "/admin/puntos/asignar", "/admin/roles", "/admin/manual", "/admin/manual/clientes"],
      owner: ["/admin/dashboard", "/admin/clientes", "/admin/clientes/nuevo", "/admin/clientes/abc", "/admin/piletas", "/admin/piletas/nueva", "/admin/piletas/abc", "/admin/itinerario", "/admin/itinerario/2026-10-19", "/admin/ventas", "/admin/ventas/nueva", "/admin/stock", "/admin/stock/nuevo", "/admin/stock/abc/editar", "/admin/puntos", "/admin/puntos/niveles", "/admin/manual", "/admin/manual/clientes"],
      marketing: ["/admin/dashboard", "/admin/stock", "/admin/stock/nuevo", "/admin/stock/abc/editar", "/admin/landing-cms", "/admin/puntos", "/admin/puntos/niveles", "/admin/puntos/asignar", "/admin/manual", "/admin/manual/puntos"],
      employee: ["/employee/itinerario", "/employee/piletas/abc", "/employee/ayuda", "/employee/ayuda/hoy"],
      client: ["/client/dashboard", "/client/compras", "/client/servicios", "/client/puntos", "/client/ayuda", "/client/ayuda/inicio"],
    }
    for (const [rol, rutas] of Object.entries(MENU) as [UserRole, string[]][]) {
      como(rol)
      for (const ruta of rutas) expect(await ayudaRapidaAction(ruta), `${rol} → ${ruta}`).not.toBeNull()
    }
  })
})
