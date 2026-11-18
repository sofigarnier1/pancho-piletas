import type { Tema } from "@/content/manual/tipos"
import { textoPlano } from "@/lib/manual/resolver"
import { ManualBuscador, type EntradaIndice } from "./buscador"

export function indiceBusqueda(temas: Tema[]): EntradaIndice[] {
  return temas.flatMap((t) => t.secciones.map((s) => ({
    tema: t.id, temaTitulo: t.titulo, icono: t.icono, seccion: s.id, seccionTitulo: s.titulo, texto: textoPlano(t, s),
  })))
}

/** Marco común del manual (las tres zonas): título, buscador y el contenido que corresponda */
export function PaginaManual({ titulo, descripcion, temas, base, clave, children }: { titulo: string; descripcion: string; temas: Tema[]; base: string; clave: string; children: React.ReactNode }) {
  return (
    <div className="manual-print mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-primary-dark">{titulo}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{descripcion}</p>
      </div>
      <ManualBuscador key={clave} indice={indiceBusqueda(temas)} base={base}>{children}</ManualBuscador>
    </div>
  )
}
