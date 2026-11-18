"use server"

import { requireRole } from "@/lib/auth/require-role"
import type { UserRole } from "@/lib/supabase/user"
import type { Seccion } from "@/content/manual/tipos"
import { areaDe, areaDeRuta, base, buscarSeccion, temasPara } from "./resolver"

export type AyudaRapida = {
  tema: { id: string; titulo: string }
  seccion: Seccion
  href: string
}

const TODOS: UserRole[] = ["super_admin", "owner", "marketing", "employee", "client"]

/** Ayuda rápida de la pantalla actual: la sección del manual que corresponde a la ruta, según el rol */
export async function ayudaRapidaAction(ruta: string): Promise<AyudaRapida | null> {
  if (typeof ruta !== "string" || ruta.length > 300 || !areaDeRuta(ruta)) return null
  const auth = await requireRole(TODOS)
  if (!auth.ok) return null
  // La ayuda es de la zona del rol: nadie recibe el manual de otra zona
  if (areaDeRuta(ruta) !== areaDe(auth.role)) return null
  const hit = buscarSeccion(temasPara(auth.role), ruta)
  if (!hit) return null
  return {
    tema: { id: hit.tema.id, titulo: hit.tema.titulo },
    seccion: hit.seccion,
    href: `${base(auth.role)}/${hit.tema.id}#${hit.seccion.id}`,
  }
}
