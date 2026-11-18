import { Printer } from "lucide-react"
import type { Tema } from "@/content/manual/tipos"
import { IconoManual } from "./iconos"

/** Tarjetas del índice del manual agrupadas por tema. `angosto`: pantalla de una sola columna (app del empleado) */
export function Portada({ temas, base, angosto = false }: { temas: Tema[]; base: string; angosto?: boolean }) {
  const grupos = [...new Set(temas.map((t) => t.grupo))]
  return (
    <div className="space-y-8">
      {grupos.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">{g}</h2>
          <div className={angosto ? "grid gap-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
            {temas.filter((t) => t.grupo === g).map((t) => {
              const tareas = t.secciones.reduce((n, s) => n + s.tareas.length, 0)
              return (
                <a key={t.id} href={`${base}/${t.id}`} className="border-border bg-card hover:border-primary/50 group flex flex-col gap-2 rounded-xl border p-4 transition-colors">
                  <span className="flex items-center gap-2.5"><IconoManual nombre={t.icono} className="text-primary h-5 w-5" /><span className="text-lg font-bold text-primary-dark">{t.titulo}</span></span>
                  <span className="text-muted-foreground text-sm">{t.resumen}</span>
                  <span className="text-muted-foreground mt-auto pt-1 text-xs">{t.secciones.length} pantalla{t.secciones.length === 1 ? "" : "s"} · {tareas} tarea{tareas === 1 ? "" : "s"} paso a paso</span>
                </a>
              )
            })}
          </div>
        </section>
      ))}
      <a href={`${base}/completo`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm print:hidden"><Printer className="h-4 w-4" />Ver todo el manual en una sola página (para imprimir o guardar en PDF)</a>
    </div>
  )
}
