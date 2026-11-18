import type { Metadata } from "next"
import { ManualTema } from "@/components/manual/rutas"

export const metadata: Metadata = { title: "Manual de usuario" }

export default function ManualTemaPage({ params }: { params: Promise<{ tema: string }> }) {
  return <ManualTema area="admin" params={params} />
}
