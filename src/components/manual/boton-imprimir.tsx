"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BotonImprimir({ etiqueta = "Imprimir / Guardar PDF" }: { etiqueta?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />{etiqueta}
    </Button>
  )
}
