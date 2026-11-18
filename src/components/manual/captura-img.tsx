"use client"

import { useState } from "react"

// La captura se oculta sola si todavía no se generó el archivo (npm run manual:capturas)
export function CapturaImg({ dir, archivo, alt }: { dir: string; archivo: string; alt: string }) {
  const [falla, setFalla] = useState(false)
  if (falla) return null
  return (
    <figure className="border-border bg-card overflow-hidden rounded-lg border">
      {/* eslint-disable-next-line @next/next/no-img-element -- capturas estáticas del manual, ya optimizadas en webp */}
      <img src={`/manual/${dir}/${archivo}.webp`} alt={alt} loading="lazy" onError={() => setFalla(true)} className="h-auto w-full" />
      <figcaption className="text-muted-foreground border-border border-t px-3 py-2 text-xs">{alt}</figcaption>
    </figure>
  )
}
