import type { Tema } from "./tipos"

export const empleados: Tema = {
  id: "empleados",
  titulo: "Empleados",
  grupo: "Operación",
  icono: "empleados",
  roles: ["super_admin", "owner"],
  resumen: "Cuánto trabajó cada persona del equipo en el mes, en tablas tipo Excel (resumen y día por día), el detalle de lo que registró y el historial de cambios de los registros de service: quién registró, editó o borró cada uno, y cuándo.",
  relacionados: ["itinerario", "services", "glosario"],
  secciones: [
    {
      id: "lista",
      titulo: "El trabajo del equipo en el mes",
      rutas: ["/admin/empleados"],
      resumen: "El trabajo del equipo en dos tablas tipo Excel: el resumen del mes (una fila por persona) y una grilla día por día. Se ve todo de entrada; tocando una persona se abre su detalle.",
      queVes: [
        "El título **Empleados** y el botón **Historial de cambios**.",
        "El nombre del mes con la cantidad de visitas registradas, y las flechas **Mes anterior** y **Mes siguiente**.",
        "Las pestañas **Resumen del mes** y **Por día** (la “Vista de empleados”).",
        "La barra de la tabla: la búsqueda (**Buscar persona...**), **Tabla** o **Tarjetas**, **Descargar Excel** y **Compartir**.",
        "En **Resumen del mes**, las columnas **Persona** (con su rol debajo; si la cuenta está inactiva o bloqueada, lo dice), **Días trabajados**, **Visitas**, **Services**, **Desagotes**, **Salteadas**, **No estaba**, **Cloro líquido (L)**, **Granulado (g)**, **Pastillas** y **Cambios hechos**. Abajo, la fila **Total** del equipo.",
        "En **Por día**, una fila por persona y una columna por cada día del mes con cuántas piletas hizo ese día, y al final el **Total**. La última fila suma lo que hizo todo el equipo cada día.",
      ],
      tareas: [
        {
          id: "ver-mes",
          titulo: "Ver cuánto trabajó cada uno",
          pasos: [
            "Entrá a **Empleados** desde el menú: se abre el mes actual, en **Resumen del mes**.",
            "Usá **Mes anterior** y **Mes siguiente** para ir a otro mes.",
            "Tocá **Por día** para ver la grilla con lo que hizo cada uno cada día.",
            "Tocá el título de una columna para ordenar (por ejemplo, por **Visitas**), y tocá una persona para ver el detalle de todo lo que registró ese mes.",
            "Para tenerlo en Excel o mandarlo, usá **Descargar Excel** o **Compartir** (se baja la pestaña que estás mirando).",
          ],
          notas: [
            "Una visita se cuenta una vez por persona, aunque esa persona le haya cargado más de un registro. Si fueron dos, la visita le suma a cada una.",
            "**Salteadas** y **No estaba** cuentan las visitas que esa persona marcó así.",
            "**Cambios hechos** cuenta cuántas altas, ediciones y borrados de registros hizo esa persona en el mes (el detalle está en **Historial de cambios**).",
            "El cloro se suma por tipo y no se convierte entre tipos: los litros, los gramos y las pastillas van por separado.",
            "Aparecen los empleados activos (aunque no hayan trabajado ese mes) y cualquier persona que tenga registros en el mes, por ejemplo el dueño, o alguien que ya no trabaja.",
          ],
          captura: "lista",
        },
      ],
      reglas: [
        "Los números salen de los registros de service: lo que no se registró no cuenta. Para corregirlos, corregí el registro desde la visita.",
        "El mes se toma por el día de la visita, no por el día en que se cargó el registro.",
      ],
      avisos: [
        { mensaje: "Todavía no hay empleados cargados.", solucion: "Nadie del equipo tiene rol de empleado. El súper admin asigna los roles desde **Roles**." },
      ],
      capturas: [{ archivo: "lista", alt: "La tabla del mes con los días, las visitas, las salteadas y el cloro de cada persona del equipo", ruta: "/admin/empleados", como: "owner" }],
    },
    {
      id: "detalle",
      titulo: "Lo que registró una persona",
      rutas: ["/admin/empleados/[id]"],
      resumen: "Los totales del mes de una persona y la lista de todos sus registros, día por día, con la pileta, el cliente, el tipo de visita, el cloro y las observaciones.",
      queVes: [
        "El enlace **Empleados** para volver, el rol, el nombre y el botón **Ver sus cambios**.",
        "Tres recuadros: **Visitas** (con cuántas fueron service y cuántas desagote), **Días trabajados** y **Registros**.",
        "El bloque **Cloro del mes**, con la suma de cada tipo en su unidad.",
        "El mes, con las flechas **Mes anterior** y **Mes siguiente**, y debajo los registros agrupados por día, del más nuevo al más viejo. Cada uno con la pileta (tocala para abrir la visita), el tipo (**Service** o **Desagote**), el cliente titular, el barrio, el cloro y las observaciones.",
        "Si no registró nada en el mes, dice **No tiene registros en este mes.**",
      ],
      tareas: [
        {
          id: "ver-detalle",
          titulo: "Revisar lo que hizo una persona y corregir un registro",
          pasos: [
            "En **Empleados**, tocá el nombre de la persona.",
            "Buscá el día y tocá el nombre de la pileta: se abre la visita.",
            "En la visita, corregí o borrá el registro como siempre (ver “Corregir o borrar un registro” en el tema Itinerario).",
          ],
          resultado: "Al volver, los totales y la lista ya muestran el registro corregido.",
          notas: ["Esta pantalla es solo para mirar: los cambios se hacen desde la visita, y quedan en el historial."],
          captura: "detalle",
        },
      ],
      capturas: [{ archivo: "detalle", alt: "El detalle del mes de un empleado: totales, cloro y sus registros día por día", ruta: "/admin/empleados/{empleado}", como: "owner" }],
    },
    {
      id: "cambios",
      titulo: "Historial de cambios",
      rutas: ["/admin/empleados/cambios"],
      resumen: "Cada vez que alguien registró, editó o borró un registro de service: quién lo hizo, cuándo, de qué pileta, y qué cambió. Sirve para saber quién corrigió qué.",
      queVes: [
        "El enlace **Empleados** para volver y el título **Historial de cambios**.",
        "El selector **Filtrar por persona**, con **Todas las personas** o el nombre de alguien del equipo.",
        "El mes con la cantidad de cambios y las flechas **Mes anterior** y **Mes siguiente**.",
        "La lista de cambios, del más nuevo al más viejo. Cada uno dice qué se hizo (“Registró”, “Editó” o “Borró”), quién y cuándo, y la pileta (tocala para abrir la visita).",
        "En una edición, cada dato que cambió con el valor de antes tachado y el nuevo al lado (por ejemplo “Cloro: Pastillas · 2 → Pastillas · 2,5”). En un registro nuevo o borrado, cómo quedó o cómo estaba: quién lo hizo, la fecha, el tipo de visita, el cloro y las observaciones.",
        "Si no hubo cambios, dice “No hay cambios para mostrar.”",
      ],
      tareas: [
        {
          id: "ver-cambios",
          titulo: "Ver quién cambió un registro",
          cuando: "Cuando un número no cierra, o querés saber quién corrigió algo.",
          pasos: [
            "En **Empleados**, tocá **Historial de cambios** (o, en el detalle de una persona, **Ver sus cambios**).",
            "Elegí el mes con **Mes anterior** y **Mes siguiente**.",
            "Si buscás lo de alguien, elegilo en **Filtrar por persona**: aparecen los cambios que hizo y los cambios en sus registros, aunque los haya hecho otro.",
          ],
          notas: [
            "El mes de esta pantalla es el del día en que se hizo el cambio, no el de la visita.",
            "Se muestran hasta los 300 cambios más nuevos del mes; si hay más, un aviso lo dice y conviene filtrar por persona.",
            "Cuando el dueño carga o corrige un registro a nombre de otro, el cambio figura como hecho por el dueño, y el registro, a nombre de la otra persona.",
            "Lo que se cargó directamente en la base de datos, sin pasar por la app, figura como hecho por “El sistema”.",
          ],
          captura: "cambios",
        },
      ],
      reglas: [
        "El historial lo escribe solo la base de datos con cada alta, edición o borrado: nadie lo puede editar ni borrar.",
        "Lo ven únicamente el dueño y el súper administrador. Los empleados no lo ven.",
        "Un registro borrado no desaparece del historial: queda cómo estaba y quién lo borró.",
      ],
      capturas: [{ archivo: "cambios", alt: "El historial de cambios del mes, con quién registró o corrigió cada registro", ruta: "/admin/empleados/cambios", como: "owner" }],
    },
  ],
}
