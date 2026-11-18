import type { Tema } from "@/content/manual/tipos"
import { IconoManual } from "./iconos"

/** Prefijo de los anchors de un tema dentro de la página "completo" (los ids de sección se repiten entre temas) */
export const anclaTema = (id: string) => `tema-${id}`

/** Índice con TODO a la vista (temas, pantallas y tareas), sin buscar ni desplegar: para elegir qué leer */
export function IndiceCompleto({ temas, angosto = false }: { temas: Tema[]; angosto?: boolean }) {
  const grupos = [...new Set(temas.map((t) => t.grupo))]
  return (
    <nav aria-label="Índice del manual" className="border-border bg-card space-y-6 rounded-xl border p-5 print:break-after-page">
      <div>
        <h2 className="text-xl font-bold text-primary-dark">Qué querés hacer</h2>
        <p className="text-muted-foreground text-sm">Elegí el tema, la pantalla o la tarea y andá directo a esa parte.</p>
      </div>
      {grupos.map((g) => (
        <section key={g} className="space-y-3">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">{g}</h3>
          <div className={angosto ? "grid gap-y-5" : "grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3"}>
            {temas.filter((t) => t.grupo === g).map((t) => {
              return (
                <div key={t.id} className="min-w-0">
                  <a href={`#${anclaTema(t.id)}`} className="hover:text-primary flex items-center gap-2 text-base font-bold text-primary-dark"><IconoManual nombre={t.icono} className="text-primary h-4 w-4 shrink-0" />{t.titulo}</a>
                  <ul className="mt-1.5 space-y-1.5 text-sm">
                    {t.secciones.map((s) => (
                      <li key={s.id}>
                        <a href={`#${t.id}--${s.id}`} className="hover:text-primary font-medium">{s.titulo}</a>
                        {s.tareas.length > 0 && (
                          <ul className="text-muted-foreground border-border mt-0.5 space-y-0.5 border-l pl-3 text-xs">
                            {s.tareas.map((x) => <li key={x.id}><a href={`#${t.id}--${s.id}-${x.id}`} className="hover:text-foreground">{x.titulo}</a></li>)}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </nav>
  )
}
