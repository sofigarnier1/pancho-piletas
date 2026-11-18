import type { Glosario, Tema } from "./tipos"

const tema = (id: string, resumen: string, terminos: Glosario[]): Tema => ({
  id,
  titulo: "Glosario",
  grupo: "Ayuda",
  icono: "libro",
  resumen,
  secciones: [
    {
      id: "terminos",
      titulo: "Términos del sistema",
      rutas: [],
      resumen: "Tocá una palabra para ver su definición.",
      tareas: [],
      faq: terminos.map((t) => ({ p: t.termino, r: t.definicion })),
    },
  ],
})

export const glosarioEquipo: Tema = tema("glosario", "Qué significa cada palabra que usa el sistema.", [
  { termino: "Pileta", definicion: "Cada pileta que se atiende. Pertenece a un cliente y puede tener un alias para reconocerla rápido. Un cliente puede tener varias." },
  { termino: "Service", definicion: "La visita de mantenimiento a una pileta: limpieza con barrefondo y, si hace falta, cloro. Cada visita es service o desagote, y se elige al armar el itinerario." },
  { termino: "Desagote", definicion: "Una visita para vaciar la pileta. Es el otro tipo de visita (el primero es service)." },
  { termino: "Auto", definicion: "Cada vehículo con el que sale un equipo. Cada día el dueño pone gente en cada auto y le reparte piletas: esa es la ruta del auto." },
  { termino: "Registro de service", definicion: "Lo que se carga al marcar una pileta como hecha: quién, cuándo, el cloro (en litros, gramos o pastillas) y las observaciones. Una visita puede tener varios registros, y cada cambio queda en el historial." },
  { termino: "Historial de cambios", definicion: "La lista de cada alta, edición y borrado de los registros de service, con quién lo hizo y cuándo. La escribe sola la base de datos y la ven el dueño y el súper administrador, en **Empleados** y en cada visita." },
  { termino: "Itinerario", definicion: "La lista de piletas que el equipo visita un día, en orden. Lo arma el dueño y lo ven los empleados en su pantalla **Hoy**." },
  { termino: "Visita", definicion: "Una pileta dentro del itinerario de un día. Tiene un estado: **Pendiente**, **Hecho**, **Salteado** o **No estaba**." },
  { termino: "Barrefondo", definicion: "Limpiar el fondo de la pileta con el aparato barrefondo. Es parte de cada service." },
  { termino: "Estados de un cliente", definicion: "**Activo**: opera normal. **Inactivo**: ya no opera, pero puede entrar. **Bloqueado**: no puede entrar ni usar el sistema, y se le cierran las sesiones." },
  { termino: "Venta manual", definicion: "Una venta que se acordó por fuera de la web (por ejemplo, por WhatsApp) y que el dueño carga a mano. Descuenta stock." },
  { termino: "Pedido online", definicion: "Una compra hecha por el cliente desde la web. La tienda online todavía no está habilitada: hoy todas las ventas son manuales." },
  { termino: "Stock", definicion: "Las unidades que quedan de cada producto. Baja con cada venta y se ajusta a mano en **Stock**. Nunca es negativo." },
  { termino: "Stock insuficiente", definicion: "Cuando se registra una venta de más unidades de las que figuran en stock. La venta se guarda igual, el stock queda en 0 y el sistema avisa cuántas faltaban." },
  { termino: "Producto activo / inactivo", definicion: "Un producto activo se muestra en la web. Uno inactivo no, pero conserva su historial y se puede reactivar." },
  { termino: "Puntos", definicion: "El saldo del programa de fidelidad de cada cliente. Hoy se cargan a mano desde **Asignar puntos**." },
  { termino: "Nivel", definicion: "Bronce, Plata, Oro (u otros que defina marketing). Cada cliente está en el nivel más alto cuyo mínimo de puntos ya alcanzó." },
  { termino: "Regla de puntos", definicion: "Una política del programa que dice cuántos puntos vale cada compra o service. Todavía no suma puntos sola." },
  { termino: "Landing", definicion: "La web pública del negocio, la que ve cualquier persona sin iniciar sesión. Sus textos se editan desde **Landing CMS**." },
  { termino: "Rol", definicion: "El tipo de cuenta: súper admin, dueño (owner), marketing, empleado o cliente. Define qué se ve y qué se puede hacer." },
])

export const glosarioEmpleado: Tema = tema("glosario", "Qué significa cada palabra que vas a ver en tu pantalla.", [
  { termino: "Itinerario", definicion: "La lista de piletas que te toca visitar cada día, en el orden en que las armó el dueño. Si vas en un auto, es la ruta de tu auto." },
  { termino: "Auto", definicion: "El vehículo en el que salís ese día. El dueño arma quién va en cada auto y qué piletas le tocan." },
  { termino: "Service o desagote", definicion: "El tipo de visita: “Service” es la limpieza con barrefondo; “Desagote” es vaciar la pileta. Lo elige el dueño al armar la ruta." },
  { termino: "Marcar", definicion: "Dejar registrado qué pasó con una pileta: la hiciste, no estaba el cliente o la salteás por hoy." },
  { termino: "Hecha", definicion: "Hiciste el service o el desagote. Al marcarla cargás el cloro aplicado y las observaciones. Si fueron dos, cada uno puede sumar su registro." },
  { termino: "Registro", definicion: "Lo que cargás al marcar una pileta como hecha. Los tuyos de la última semana los podés corregir o borrar." },
  { termino: "No estaba el cliente", definicion: "Fuiste pero no se pudo hacer el service porque no había nadie. Queda registrado." },
  { termino: "Saltear por hoy", definicion: "No vas a hacer esa pileta hoy y hay que reprogramarla para otro día." },
  { termino: "Barrefondo", definicion: "Limpiar el fondo de la pileta con el aparato barrefondo." },
  { termino: "Cloro aplicado", definicion: "El tipo y la cantidad que le pusiste a la pileta: líquido en litros, granulado en gramos y pastillas por cantidad (de a media)." },
  { termino: "Cómo llegar", definicion: "Abre el mapa con la dirección de la pileta para que te guíe." },
])

export const glosarioCliente: Tema = tema("glosario", "Qué significa cada palabra que vas a ver en tu portal.", [
  { termino: "Service", definicion: "Cada visita de mantenimiento a tu pileta (limpieza con barrefondo). En **Mis servicios** ves cada una." },
  { termino: "Desagote", definicion: "Una visita para vaciar tu pileta." },
  { termino: "Barrefondo", definicion: "Limpieza del fondo de la pileta con el aparato barrefondo." },
  { termino: "Cloro aplicado", definicion: "El tipo y la cantidad de cloro que se le puso a tu pileta en ese service." },
  { termino: "Puntos", definicion: "Tu saldo del programa de beneficios. Los carga el equipo de Pancho." },
  { termino: "Nivel", definicion: "Tu categoría en el programa (por ejemplo Bronce, Plata u Oro). Cuantos más puntos, más alto el nivel y más beneficios." },
  { termino: "Compra por WhatsApp", definicion: "Una compra que acordaste con Pancho por WhatsApp y que él cargó en el sistema." },
  { termino: "Estado de una compra", definicion: "**Pendiente**, **Pagado**, **Preparando**, **Enviado**, **Entregado** o **Cancelado**. Las compras por WhatsApp figuran como **Entregado**." },
])
