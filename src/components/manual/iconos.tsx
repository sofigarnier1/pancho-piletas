import { createElement } from "react"
import {
  BookOpen, Rocket, LayoutDashboard, Users, Waves, CalendarDays, ShoppingCart, ShoppingBag, Package, Star, FileText,
  Shield, Route, CalendarCheck, History, Wrench, ClipboardCheck, UserCheck, ClipboardList, type LucideIcon,
} from "lucide-react"

const ICONOS: Record<string, LucideIcon> = {
  libro: BookOpen, cohete: Rocket, dashboard: LayoutDashboard, clientes: Users, piletas: Waves, itinerario: CalendarDays,
  ventas: ShoppingCart, compras: ShoppingBag, stock: Package, puntos: Star, cms: FileText, roles: Shield, recorrido: Route,
  hoy: CalendarCheck, historial: History, servicios: Wrench, marcar: ClipboardCheck, empleados: UserCheck, services: ClipboardList,
}

/** Ícono de un tema por su nombre (`Tema.icono`). Se arma con createElement para no crear un componente nuevo en cada render. */
export function IconoManual({ nombre, className }: { nombre: string; className?: string }) {
  return createElement(ICONOS[nombre] ?? BookOpen, { className })
}
