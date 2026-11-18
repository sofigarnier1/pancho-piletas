import { AlertTriangle, CircleHelp, Lightbulb, Eye } from "lucide-react"
import type { Seccion, Tarea } from "@/content/manual/tipos"
import { Inline } from "./inline"
import { CapturaImg } from "./captura-img"

function Pasos({ pasos }: { pasos: string[] }) {
  return (
    <ol className="space-y-2">
      {pasos.map((p, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <span className="bg-primary/15 text-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">{i + 1}</span>
          <span className="text-muted-foreground"><Inline texto={p} /></span>
        </li>
      ))}
    </ol>
  )
}

function TareaView({ t, dir, s, p }: { t: Tarea; dir: string; s: Seccion; p: string }) {
  const cap = t.captura ? s.capturas?.find((c) => c.archivo === t.captura) : undefined
  return (
    <article id={`${p}${s.id}-${t.id}`} className="border-border bg-card scroll-mt-20 space-y-3 rounded-lg border p-4 print:break-inside-avoid">
      <div>
        <h4 className="text-lg font-bold text-primary-dark">{t.titulo}</h4>
        {t.cuando && <p className="text-muted-foreground text-xs"><Inline texto={t.cuando} /></p>}
      </div>
      <Pasos pasos={t.pasos} />
      {t.resultado && (
        <p className="border-primary/30 bg-primary/5 rounded-md border px-3 py-2 text-sm"><strong>Resultado: </strong><Inline texto={t.resultado} /></p>
      )}
      {t.notas && t.notas.length > 0 && (
        <ul className="text-muted-foreground space-y-1 text-xs">
          {t.notas.map((n, i) => <li key={i} className="flex gap-2"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /><span><Inline texto={n} /></span></li>)}
        </ul>
      )}
      {cap && <CapturaImg dir={dir} archivo={cap.archivo} alt={cap.alt} />}
    </article>
  )
}

/** Sección completa del manual: lo que se ve, tareas paso a paso, campos, estados, avisos y preguntas frecuentes */
export function SeccionView({ dir, s, prefijo = "" }: { dir: string; s: Seccion; prefijo?: string }) {
  const sueltas = (s.capturas ?? []).filter((c) => !s.tareas.some((t) => t.captura === c.archivo))
  return (
    <section id={`${prefijo}${s.id}`} className="scroll-mt-20 space-y-5">
      <header className="border-border border-b pb-3">
        <h3 className="text-2xl font-bold text-primary-dark">{s.titulo}</h3>
        <p className="text-muted-foreground mt-1 text-sm"><Inline texto={s.resumen} /></p>
      </header>

      {s.tareas.length > 1 && (
        <nav aria-label={`Tareas de ${s.titulo}`} className="border-border bg-card rounded-lg border px-4 py-3 print:hidden">
          <p className="mb-1.5 text-sm font-semibold">En esta pantalla podés:</p>
          <ul className="text-sm sm:columns-2">
            {s.tareas.map((t) => <li key={t.id} className="break-inside-avoid py-0.5"><a href={`#${prefijo}${s.id}-${t.id}`} className="text-muted-foreground hover:text-primary">{t.titulo}</a></li>)}
          </ul>
        </nav>
      )}

      {sueltas.length > 0 && <div className="grid gap-3 md:grid-cols-2">{sueltas.map((c) => <CapturaImg key={c.archivo} dir={dir} archivo={c.archivo} alt={c.alt} />)}</div>}

      {s.queVes && s.queVes.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Eye className="text-primary h-4 w-4" />Qué vas a ver en esta pantalla</h4>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">{s.queVes.map((q, i) => <li key={i}><Inline texto={q} /></li>)}</ul>
        </div>
      )}

      {s.tareas.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Cómo hacerlo, paso a paso</h4>
          {s.tareas.map((t) => <TareaView key={t.id} t={t} dir={dir} s={s} p={prefijo} />)}
        </div>
      )}

      {s.campos && s.campos.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Los campos, uno por uno</h4>
          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {s.campos.map((c) => (
                  <tr key={c.nombre} className="border-border border-b last:border-0 align-top">
                    <td className="w-44 px-3 py-2 font-medium">{c.nombre}{c.obligatorio && <span className="text-destructive ml-1" title="Obligatorio">*</span>}</td>
                    <td className="text-muted-foreground px-3 py-2"><Inline texto={c.descripcion} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.campos.some((c) => c.obligatorio) && <p className="text-muted-foreground mt-1 text-xs"><span className="text-destructive">*</span> Obligatorio</p>}
        </div>
      )}

      {s.estados && s.estados.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Estados y qué significa cada uno</h4>
          <ul className="space-y-2">
            {s.estados.map((e) => (
              <li key={e.nombre} className="border-border rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{e.nombre}</span>
                <span className="text-muted-foreground"> — <Inline texto={e.descripcion} /></span>
                {e.siguiente && <p className="text-muted-foreground mt-1 text-xs">Puede pasar a: <Inline texto={e.siguiente} /></p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.reglas && s.reglas.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Reglas que conviene saber</h4>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">{s.reglas.map((r, i) => <li key={i}><Inline texto={r} /></li>)}</ul>
        </div>
      )}

      {s.avisos && s.avisos.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" />Avisos que podés ver y qué hacer</h4>
          <ul className="space-y-2">
            {s.avisos.map((a, i) => (
              <li key={i} className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm">
                <p className="font-medium text-amber-950">“{a.mensaje}”</p>
                <p className="text-muted-foreground"><Inline texto={a.solucion} /></p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.faq && s.faq.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CircleHelp className="text-primary h-4 w-4" />Preguntas frecuentes</h4>
          <div className="space-y-1.5">
            {s.faq.map((f, i) => (
              <details key={i} className="border-border group rounded-lg border px-3 py-2 text-sm open:bg-card print:open">
                <summary className="cursor-pointer font-medium">{f.p}</summary>
                <p className="text-muted-foreground mt-1.5"><Inline texto={f.r} /></p>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
