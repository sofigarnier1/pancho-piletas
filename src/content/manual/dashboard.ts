import type { Tema } from "./tipos"

export const dashboard: Tema = {
  id: "dashboard",
  titulo: "Dashboard",
  grupo: "Operación",
  icono: "dashboard",
  resumen: "La primera pantalla al entrar. Al dueño le muestra el día de hoy: cuántas visitas hay, cuántas se hicieron, botones grandes para registrar un service o agendar piletas, y la tabla de las visitas de hoy. Marketing ve un resumen general con atajos.",
  relacionados: ["itinerario", "services", "clientes", "ventas"],
  secciones: [
    {
      id: "tablero",
      titulo: "El día de hoy (dueño)",
      rutas: ["/admin/dashboard"],
      resumen: "Todo lo de hoy en una sola pantalla: se registra un service o se agenda una pileta sin ir a otra sección.",
      queVes: [
        "Arriba, la fecha de hoy y cuántas piletas hay en el itinerario. Al lado, el cartel verde **En vivo**: cuando un empleado marca o registra una pileta desde el celular, la pantalla se actualiza sola y aparece el aviso “Hay novedades del equipo”.",
        "Cuatro números: **Visitas hoy** (con los desagotes), **Hechas** (con el porcentaje del día), **Faltan** (las pendientes) y **Ventas este mes**. **Visitas hoy** te lleva a armar el día y **Ventas este mes** a Ventas.",
        "Cuatro botones grandes: **Registrar service**, **Agendar pileta**, **Armar el día** y **Nuevo cliente**.",
        "La tabla **Visitas de hoy**, una fila por visita: auto, orden en la ruta, N°, cliente, dirección, barrio, tipo (service o desagote), encargado, estado, quién la hizo y el **Motivo** (la nota que dejó el empleado cuando no se pudo). Arriba tiene el buscador y los filtros **Todas**, **Faltan** y **Hechas**, y se puede ver como **Tabla** o **Tarjetas** y bajar a Excel, igual que las demás tablas.",
        "Si hay visitas de las últimas dos semanas que quedaron pendientes, abajo aparece el bloque **Quedaron sin hacer**, con la fecha, el cliente y la dirección de cada una.",
      ],
      tareas: [
        {
          id: "registrar",
          titulo: "Registrar un service de hoy",
          pasos: [
            "Tocá **Registrar service** (o tocá directamente la fila de la visita en la tabla).",
            "Si entraste por el botón, elegí la visita de la lista: primero aparecen las que faltan. Si la lista es larga, escribí en **Buscar visita** (arriba de la lista) el N°, el cliente, la dirección o el auto para filtrarla (no importan las tildes); si nada coincide, aparece “Ninguna visita de hoy coincide con la búsqueda.”",
            "Se abre una ventana en el medio de la pantalla (en el celular, a pantalla completa) con los datos de la visita. Tocá **Registrar el service**.",
            "Elegí **Quién lo hizo** (viene elegido el encargado o el primero del auto), el **Cloro aplicado** y su cantidad si la sabés, y si hace falta completá **Observaciones (opcional)**.",
            "Tocá **Confirmar**.",
          ],
          resultado: "Aparece el aviso “Service registrado”, la ventana se cierra y la fila pasa a “Hecho” con el nombre de quien la hizo.",
          notas: [
            "Desde la misma ventana también podés marcar **No estaba el cliente** o **Saltear**, o volver una visita a pendiente con **Volver a pendiente**.",
            "Para corregir o borrar un registro, o ver su historial, tocá “Abrir la visita (corregir registros e historial)”: ahí cada registro tiene los botones **Editar registro** (el lápiz) y **Borrar registro** (el tacho). Con “Elegir otra visita” volvés a la lista.",
          ],
          captura: "tablero",
        },
        {
          id: "agendar",
          titulo: "Agendar piletas para hoy u otro día",
          pasos: [
            "Tocá **Agendar pileta**.",
            "Elegí el día (viene hoy) y el auto (o “Sin auto”).",
            "Elegí si van como **Service** o **Desagote**.",
            "Escribí en **Buscar pileta** (N°, cliente, dirección o barrio) y tocá las piletas que van: se numeran en el orden en que las elegís.",
            "Tocá el botón de abajo (“Agregar 1 pileta”, “Agregar 3 piletas”...).",
          ],
          resultado: "Aparece el aviso “Pileta agregada al itinerario” (o cuántas se agregaron). Quedan al final de la ruta de ese auto ese día.",
          notas: ["Si alguna ya estaba en el itinerario de ese día, no se agrega de nuevo y el aviso dice cuántas ya estaban. Para moverla de auto o cambiar el orden, andá a **Armar el día**."],
        },
        {
          id: "atrasadas",
          titulo: "Ver lo que quedó sin hacer",
          pasos: [
            "Mirá el bloque **Quedaron sin hacer** (solo aparece si hay alguna).",
            "Tocá una visita para abrirla: ahí la podés registrar si se hizo, o marcarla como salteada.",
          ],
          notas: ["Para pasarla a otro día, agendala con **Agendar pileta** en el día nuevo y después marcá la vieja como salteada."],
        },
      ],
      reglas: [
        "La tabla muestra solo las visitas del itinerario de hoy (hora de Argentina). Para otros días, andá a Itinerario.",
        "**Quedaron sin hacer** muestra las visitas pendientes de los 14 días anteriores a hoy.",
        "**Ventas este mes** cuenta las ventas manuales del mes calendario (hora de Argentina).",
      ],
      faq: [
        { p: "Visitas hoy muestra 0 y el empleado dice que tiene trabajo. ¿Por qué?", r: "Para que una pileta aparezca hoy tiene que estar cargada en el itinerario de hoy. Agendala con **Agendar pileta** o revisá con **Armar el día**." },
      ],
      capturas: [{ archivo: "tablero", alt: "El Dashboard del dueño con los números del día, los botones grandes y la tabla de visitas de hoy", ruta: "/admin/dashboard", como: "owner" }],
    },
    {
      id: "general",
      titulo: "Resumen general (marketing)",
      rutas: ["/admin/dashboard"],
      resumen: "Marketing ve un resumen del negocio con atajos a lo que más se usa.",
      queVes: [
        "Cuatro tarjetas: **Clientes activos** (con el total de clientes), **Piletas hoy** (con las piletas activas), **Piletas activas** (en toda la cartera) y **Ventas este mes** (ventas manuales).",
        "El bloque **Acciones rápidas**: **Nuevo cliente**, **Itinerario de hoy**, **Registrar venta** y **Nueva pileta**.",
        "El bloque **Últimos clientes** con los cinco más recientes y el enlace **Ver todos**.",
      ],
      tareas: [
        {
          id: "atajos",
          titulo: "Ir directo a una tarea frecuente",
          pasos: ["En **Acciones rápidas**, tocá lo que necesitás."],
          notas: ["Los atajos de clientes, itinerario y ventas solo los puede usar el dueño o el súper admin. Para el resto, el sistema avisa “No tenés permisos para esta acción”."],
        },
      ],
      reglas: ["**Clientes activos** cuenta solo los clientes en estado Activo; el total incluye también los inactivos y los bloqueados."],
    },
  ],
}
