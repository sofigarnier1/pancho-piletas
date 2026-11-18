import type { Metadata } from "next"
import { ManualIndice } from "@/components/manual/rutas"

export const metadata: Metadata = { title: "Manual de usuario" }

export default function ManualPage() {
  return <ManualIndice area="client" />
}
