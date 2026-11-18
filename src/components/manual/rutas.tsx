import { notFound } from "next/navigation"
import type { Area } from "@/content/manual/tipos"
import { rolActual } from "@/lib/manual/audiencia"
import { areaDe, BASE, temasPara } from "@/lib/manual/resolver"
import { PaginaManual } from "./pagina-manual"
import { Portada } from "./portada"
import { TemaView } from "./tema-view"
import { BotonImprimir } from "./boton-imprimir"
import { IndiceCompleto } from "./indice-completo"

const TEXTOS: Record<Area, { titulo: string; descripcion: string }> = {
  admin: {
    titulo: "Manual de usuario",
    descripcion: "Todo lo que se puede hacer en el sistema, explicado paso a paso. Cada pantalla también tiene su ayuda rápida con el botón ?.",
  },
  employee: {
    titulo: "Ayuda para el equipo de piletas",
    descripcion: "Cómo ver tu recorrido y marcar cada pileta. Cada pantalla también tiene su ayuda rápida con el botón ?.",
  },
  client: {
    titulo: "Ayuda",
    descripcion: "Cómo usar tu portal: tus compras, tus servicios y tus puntos. Cada pantalla también tiene su ayuda rápida con el botón ?.",
  },
}

// La app del empleado es de una sola columna (pensada para el celular): su manual también
const angosto = (area: Area) => area === "employee"
const marco = (area: Area) => (area === "admin" ? "p-6 sm:p-8" : "")

/** Portada del manual de la zona: tarjetas por tema + buscador */
export async function ManualIndice({ area }: { area: Area }) {
  const rol = await rolActual()
  if (areaDe(rol) !== area) notFound()
  const temas = temasPara(rol)
  return (
    <div className={marco(area)}>
      <PaginaManual clave="portada" {...TEXTOS[area]} temas={temas} base={BASE[area]}>
        <Portada temas={temas} base={BASE[area]} angosto={angosto(area)} />
      </PaginaManual>
    </div>
  )
}

/** Un tema del manual (o "completo": todo en una sola página para imprimir o guardar en PDF) */
export async function ManualTema({ area, params }: { area: Area; params: Promise<{ tema: string }> }) {
  const { tema: id } = await params
  const rol = await rolActual()
  if (areaDe(rol) !== area) notFound()
  const temas = temasPara(rol)
  const base = BASE[area]
  if (id === "completo") {
    return (
      <div className={marco(area)}>
        <PaginaManual clave="completo" titulo={`${TEXTOS[area].titulo} completo`} descripcion="Todo en una sola página. Usá Imprimir para guardarlo como PDF." temas={temas} base={base}>
          <div className="space-y-12">
            <BotonImprimir etiqueta="Imprimir todo el manual" />
            <IndiceCompleto temas={temas} angosto={angosto(area)} />
            {temas.map((t) => <TemaView key={t.id} tema={t} area={area} base={base} temas={temas} completo />)}
          </div>
        </PaginaManual>
      </div>
    )
  }
  const tema = temas.find((t) => t.id === id)
  if (!tema) notFound()
  return (
    <div className={marco(area)}>
      <PaginaManual clave={tema.id} {...TEXTOS[area]} temas={temas} base={base}>
        <TemaView tema={tema} area={area} base={base} temas={temas} angosto={angosto(area)} />
      </PaginaManual>
    </div>
  )
}
