"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Search, X } from "lucide-react"
import { normalizar } from "@/lib/manual/resolver"
import { IconoManual } from "./iconos"

export type EntradaIndice = { tema: string; temaTitulo: string; icono: string; seccion: string; seccionTitulo: string; texto: string }

function fragmento(texto: string, palabras: string[]) {
  const plano = normalizar(texto)
  const i = Math.max(0, plano.indexOf(palabras[0]) - 50)
  return (i > 0 ? "…" : "") + texto.slice(i, i + 160) + (texto.length > i + 160 ? "…" : "")
}

// Busca en todo el manual que el rol puede ver (sin tildes ni mayúsculas, todas las palabras). Sin búsqueda muestra `children`.
export function ManualBuscador({ indice, base, children }: { indice: EntradaIndice[]; base: string; children: ReactNode }) {
  const [q, setQ] = useState("")
  const palabras = useMemo(() => normalizar(q).split(/\s+/).filter((p) => p.length > 1), [q])
  const resultados = useMemo(() => {
    if (palabras.length === 0) return []
    return indice
      .map((e) => {
        const t = normalizar(e.texto)
        const titulo = normalizar(e.seccionTitulo + " " + e.temaTitulo)
        if (!palabras.every((p) => t.includes(p))) return null
        return { e, peso: palabras.filter((p) => titulo.includes(p)).length }
      })
      .filter((x): x is { e: EntradaIndice; peso: number } => !!x)
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 30)
  }, [palabras, indice])

  return (
    <div className="space-y-5">
      <div className="relative print:hidden">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar: “agregar pileta”, “stock”…"
          aria-label="Buscar en el manual"
          className="border-input bg-card focus-visible:ring-ring/50 h-11 w-full rounded-lg border pr-10 pl-9 text-sm outline-none focus-visible:ring-2 print:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {palabras.length === 0 ? children : (
        <div className="space-y-2" data-testid="manual-resultados">
          <p className="text-muted-foreground text-xs">{resultados.length === 0 ? "No encontramos nada con esas palabras. Probá con otras más simples." : `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}`}</p>
          {resultados.map(({ e }) => {
            return (
              <a key={e.tema + e.seccion} href={`${base}/${e.tema}#${e.seccion}`} className="border-border bg-card hover:border-primary/50 block rounded-lg border px-4 py-3 transition-colors">
                <p className="flex items-center gap-2 text-sm font-medium"><IconoManual nombre={e.icono} className="text-primary h-4 w-4" />{e.temaTitulo} <span className="text-muted-foreground">›</span> {e.seccionTitulo}</p>
                <p className="text-muted-foreground mt-1 text-xs">{fragmento(e.texto.replace(/\s+/g, " "), palabras)}</p>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
