import { ArrowLeft, ArrowRight, ListTree } from "lucide-react"
import type { Area, Tema } from "@/content/manual/tipos"
import { IconoManual } from "./iconos"
import { SeccionView } from "./seccion-view"
import { BotonImprimir } from "./boton-imprimir"
import { anclaTema } from "./indice-completo"

// Enlaces comunes (no <Link>): con la navegación suave de Next, al ir de una página del manual a otra el clic no hacía nada
function Indice({ tema, temas, base }: { tema: Tema; temas: Tema[]; base: string }) {
  return (
    <>
      <a href={base} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"><ListTree className="h-3.5 w-3.5" />Todo el manual</a>
      {[...new Set(temas.map((t) => t.grupo))].map((g) => (
        <div key={g}>
          <p className="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-[0.16em]">{g}</p>
          <ul className="space-y-0.5 text-sm">
            {temas.filter((t) => t.grupo === g).map((t) => {
              const actual = t.id === tema.id
              return (
                <li key={t.id}>
                  <a href={`${base}/${t.id}`} aria-current={actual ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-1 ${actual ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}><IconoManual nombre={t.icono} className="h-3.5 w-3.5 shrink-0" />{t.titulo}</a>
                  {actual && (
                    <ul className="border-border mb-1 ml-3.5 mt-0.5 space-y-0.5 border-l text-[13px]">
                      {t.secciones.map((x) => (
                        <li key={x.id}><a href={`#${x.id}`} className="text-muted-foreground hover:text-foreground hover:border-primary -ml-px block border-l border-transparent py-0.5 pl-3">{x.titulo}</a></li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </>
  )
}

/** Un tema del manual: índice de temas y pantallas + cada pantalla explicada. `angosto`: índice arriba, en una sola columna (app del empleado) */
export function TemaView({ tema, area, base, temas, completo = false, angosto = false }: { tema: Tema; area: Area; base: string; temas: Tema[]; completo?: boolean; angosto?: boolean }) {
  const i = temas.findIndex((t) => t.id === tema.id)
  const anterior = temas[i - 1]
  const siguiente = temas[i + 1]
  const relacionados = (tema.relacionados ?? []).map((id) => temas.find((t) => t.id === id)).filter((t): t is Tema => !!t)
  const lateral = !completo && !angosto

  return (
    <div id={completo ? anclaTema(tema.id) : undefined} className={completo ? "scroll-mt-20 space-y-6 print:break-before-page" : lateral ? "grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]" : "space-y-6"}>
      {lateral && (
        <aside className="print:hidden">
          <nav className="max-h-[calc(100vh-7rem)] space-y-4 overflow-y-auto pr-2 lg:sticky lg:top-2" aria-label="Índice del manual">
            <Indice tema={tema} temas={temas} base={base} />
          </nav>
        </aside>
      )}
      {!completo && angosto && (
        <details className="border-border bg-card rounded-lg border px-3 py-2 print:hidden">
          <summary className="cursor-pointer text-sm font-medium">Ver todos los temas</summary>
          <nav className="mt-3 space-y-4" aria-label="Índice del manual"><Indice tema={tema} temas={temas} base={base} /></nav>
        </details>
      )}
      <div className="min-w-0 space-y-10">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2.5 text-3xl font-black tracking-tight text-primary-dark"><IconoManual nombre={tema.icono} className="text-primary h-7 w-7" />{tema.titulo}</h2>
            {!completo && <BotonImprimir etiqueta="Imprimir este tema" />}
          </div>
          <p className="text-muted-foreground text-sm">{tema.resumen}</p>
        </header>
        {tema.secciones.map((s) => <SeccionView key={s.id} prefijo={completo ? `${tema.id}--` : ""} dir={`${area}/${tema.id}`} s={s} />)}
        {!completo && (
          <footer className="border-border space-y-4 border-t pt-6 print:hidden">
            {relacionados.length > 0 && (
              <p className="text-sm"><span className="text-muted-foreground">Te puede servir también: </span>
                {relacionados.map((r, k) => <span key={r.id}>{k > 0 && ", "}<a href={`${base}/${r.id}`} className="text-primary hover:underline">{r.titulo}</a></span>)}
              </p>
            )}
            <div className="flex justify-between gap-3 text-sm">
              {anterior ? <a href={`${base}/${anterior.id}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"><ArrowLeft className="h-4 w-4" />{anterior.titulo}</a> : <span />}
              {siguiente && <a href={`${base}/${siguiente.id}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">{siguiente.titulo}<ArrowRight className="h-4 w-4" /></a>}
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}
