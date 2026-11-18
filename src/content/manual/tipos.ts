import type { UserRole } from "@/lib/supabase/user"

/** El manual tiene tres cuerpos, uno por zona de la app: cada persona ve solo el suyo. */
export type Area = "admin" | "employee" | "client"

// Una captura vive en public/manual/<area>/<tema>/<archivo>.webp y la genera `npm run manual:capturas`
export type Captura = {
  archivo: string
  alt: string
  /** Pantalla que fotografía el script. Admite {cliente} {pileta} {itemHoy} {hoy} {manana} {empleado} */
  ruta: string
  /** Con qué usuario de prueba se saca la foto (por defecto el de más permisos del área) */
  como?: "admin" | "owner" | "marketing" | "employee" | "client"
  /** Botones que se tocan, en orden, antes de sacar la foto (texto literal del botón) */
  abrir?: string[]
}

export type Tarea = {
  id: string
  titulo: string
  /** Cuándo se usa */
  cuando?: string
  /** Pasos numerados. Los botones y campos van entre **negritas**, tal como se ven en pantalla */
  pasos: string[]
  resultado?: string
  notas?: string[]
  /** Acciones de servidor (nombre) y endpoints ("GET /api/...") del código que esta tarea explica: lo mide manual-cobertura.test.ts */
  cubre?: string[]
  /** archivo de una captura de la sección */
  captura?: string
}

export type Campo = { nombre: string; obligatorio?: boolean; descripcion: string }
export type Estado = { nombre: string; descripcion: string; siguiente?: string }
export type Aviso = { mensaje: string; solucion: string }

/** Una pantalla (o grupo de pantallas parecidas) dentro de un tema */
export type Seccion = {
  id: string
  titulo: string
  /** Patrones de ruta: /admin/clientes/[id]. Vacío = no es una pantalla (solo se lee en el manual) */
  rutas: string[]
  resumen: string
  /** Qué elementos se ven en la pantalla */
  queVes?: string[]
  tareas: Tarea[]
  campos?: Campo[]
  estados?: Estado[]
  reglas?: string[]
  avisos?: Aviso[]
  faq?: { p: string; r: string }[]
  capturas?: Captura[]
}

export type Tema = {
  /** slug: /admin/manual/<id> */
  id: string
  titulo: string
  /** Grupo del índice */
  grupo: string
  icono: string
  /** Quién lo ve dentro de su zona. Sin valor: todos los roles de la zona */
  roles?: UserRole[]
  resumen: string
  secciones: Seccion[]
  /** ids de otros temas de la misma zona */
  relacionados?: string[]
}

export type Glosario = { termino: string; definicion: string }
