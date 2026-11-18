import { Fragment } from "react"

// Texto del manual: **negrita** para botones y campos, `código` para valores literales
export function Inline({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("**") ? <strong key={i} className="text-foreground font-semibold">{p.slice(2, -2)}</strong>
        : p.startsWith("`") ? <code key={i} className="bg-muted rounded px-1 py-0.5 text-[0.85em]">{p.slice(1, -1)}</code>
        : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  )
}
