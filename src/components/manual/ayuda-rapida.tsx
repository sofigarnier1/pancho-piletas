"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, CircleHelp, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ayudaRapidaAction, type AyudaRapida } from "@/lib/manual/actions"
import { Inline } from "./inline"

// Botón "?" de cada zona: abre la ayuda de la pantalla actual sin salir de ella
export function AyudaRapidaBoton({ manualHref, className }: { manualHref: string; className?: string }) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  // La ayuda se guarda junto con la ruta que la pidió: mientras no coincida con la pantalla actual, se está cargando
  const [resultado, setResultado] = useState<{ ruta: string; ayuda: AyudaRapida | null } | null>(null)

  // Atajo "?": no se activa mientras se escribe en un campo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      setAbierto((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Cada vez que se abre (o cambia la pantalla con el panel abierto) se pide la ayuda de esa ruta
  useEffect(() => {
    if (!abierto) return
    let cancelado = false
    ayudaRapidaAction(pathname).then((ayuda) => { if (!cancelado) setResultado({ ruta: pathname, ayuda }) })
    return () => { cancelado = true }
  }, [abierto, pathname])

  const pending = abierto && resultado?.ruta !== pathname
  const ayuda: AyudaRapida | null | undefined = pending || !resultado ? undefined : resultado.ayuda

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Ayuda de esta pantalla"
          title="Ayuda de esta pantalla (?)"
          data-testid="ayuda-rapida-boton"
          className={cn("flex h-9 w-9 items-center justify-center rounded-md transition-colors", className)}
        >
          <CircleHelp className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto" data-testid="ayuda-rapida-panel">
        <SheetHeader>
          <SheetTitle>{ayuda ? ayuda.seccion.titulo : "Ayuda"}</SheetTitle>
          <SheetDescription>{ayuda ? ayuda.tema.titulo : "Ayuda de esta pantalla"}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          {(pending || ayuda === undefined) && <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Buscando la ayuda de esta pantalla…</p>}
          {ayuda === null && !pending && (
            <p className="text-muted-foreground">Todavía no hay ayuda escrita para esta pantalla. Podés buscarla en el manual completo.</p>
          )}
          {ayuda && !pending && (
            <>
              <p className="text-muted-foreground"><Inline texto={ayuda.seccion.resumen} /></p>
              {ayuda.seccion.tareas.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-medium">Qué podés hacer acá</p>
                  {ayuda.seccion.tareas.map((t) => (
                    <details key={t.id} className="border-border rounded-lg border px-3 py-2 open:bg-card">
                      <summary className="cursor-pointer font-medium">{t.titulo}</summary>
                      <ol className="text-muted-foreground mt-2 list-decimal space-y-1.5 pl-5">
                        {t.pasos.map((p, i) => <li key={i}><Inline texto={p} /></li>)}
                      </ol>
                      {t.resultado && <p className="mt-2 text-xs"><strong>Resultado: </strong><Inline texto={t.resultado} /></p>}
                    </details>
                  ))}
                </div>
              )}
              {ayuda.seccion.avisos && ayuda.seccion.avisos.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-medium">Avisos frecuentes</p>
                  <ul className="space-y-1.5">
                    {ayuda.seccion.avisos.slice(0, 4).map((a, i) => (
                      <li key={i} className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs"><p className="font-medium text-amber-950">“{a.mensaje}”</p><p className="text-muted-foreground"><Inline texto={a.solucion} /></p></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <Link href={ayuda?.href ?? manualHref} onClick={() => setAbierto(false)} className="border-primary/40 text-primary hover:bg-primary/10 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
            <BookOpen className="h-4 w-4" />{ayuda ? "Ver en el manual completo" : "Abrir el manual"}
          </Link>
          <p className="text-muted-foreground text-xs">Tip: apretá <kbd className="bg-muted rounded px-1">?</kbd> en cualquier pantalla para abrir esta ayuda.</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
