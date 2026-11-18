import type { Tema } from "./tipos"
import { primerosPasos } from "./primeros-pasos"
import { recorrido } from "./recorrido"
import { dashboard } from "./dashboard"
import { clientes } from "./clientes"
import { piletas } from "./piletas"
import { itinerario } from "./itinerario"
import { empleados } from "./empleados"
import { services } from "./services"
import { cobros } from "./cobros"
import { ventas } from "./ventas"
import { stock } from "./stock"
import { puntos } from "./puntos"
import { landingCms } from "./landing-cms"
import { roles } from "./roles"
import { glosarioEquipo } from "./glosario"
import { siAlgoFalla } from "./si-algo-falla"

// Orden = orden de lectura del índice. Cada tema declara qué roles lo ven (sin `roles`: todos los del equipo).
export const TEMAS_ADMIN: Tema[] = [
  primerosPasos, recorrido,
  dashboard, clientes, piletas, itinerario, services, empleados, cobros, ventas, stock,
  puntos, landingCms,
  roles,
  siAlgoFalla, glosarioEquipo,
]
