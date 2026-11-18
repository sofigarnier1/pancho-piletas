import type { Tema } from "./tipos"

export const services: Tema = {
  id: "services",
  titulo: "Services",
  grupo: "Operación",
  icono: "services",
  roles: ["super_admin", "owner"],
  resumen: "Dos planillas tipo Excel, una de Services y otra de Desagotes: pileta por pileta, cuántos se hicieron en el mes, cuánto cloro se puso, las observaciones del equipo y tus notas del mes. También la planilla semanal, como la de papel, para imprimir.",
  relacionados: ["itinerario", "empleados", "clientes", "glosario"],
  secciones: [
    {
      id: "control",
      titulo: "Planillas de services y de desagotes",
      rutas: ["/admin/services"],
      resumen: "Una fila por pileta con lo del mes: cuántos services (o desagotes) se hicieron, el cloro de cada tipo, las observaciones que cargó el equipo y una nota tuya. Se elige el mes (por defecto, el actual), se filtra por auto o por empleado, y tocando una pileta se ve cada visita y se escribe la nota.",
      queVes: [
        "El título **Planilla de services** (o **Planilla de desagotes**) y las pestañas **Services**, **Desagotes** y **Planilla semanal** (las “Vistas de services”).",
        "El mes que estás mirando (al entrar, el actual) con cuántos se hicieron, y las flechas “Mes anterior” y “Mes siguiente” para cambiarlo. Arriba, el cartel **En vivo**: la planilla se actualiza sola cuando el equipo registra.",
        "La barra de la tabla: la búsqueda (**Buscar por N°, cliente, dirección o barrio...**), los filtros **Todas**, **Sin visitas** (solo en Services) y **Con notas**, los selectores de **Auto** y **Empleado**, **Tabla** o **Tarjetas**, **Descargar Excel** y **Compartir**.",
        "La tabla con las columnas **N°**, **Cliente**, **Dirección**, **Barrio**, **Services hechos** (o **Desagotes hechos**), **Cloro líquido (L)**, **Granulado (g)**, **Pastillas**, **Última visita**, **Días sin visita**, **Observaciones del equipo** y **Notas del mes**. Abajo, la fila **Total**.",
        "En Services aparecen todas las piletas activas (en naranja, las que no tuvieron ningún service en el mes). En Desagotes, solo las piletas que tuvieron algún desagote ese mes.",
      ],
      tareas: [
        {
          id: "revisar-mes",
          titulo: "Revisar cómo viene el mes",
          cuando: "Para controlar que no quede ninguna pileta sin atender y ver cuánto cloro se usó.",
          pasos: [
            "Entrá a **Services** desde el menú: se abre la planilla de services del mes actual. Para los desagotes, tocá la pestaña **Desagotes**.",
            "Para ver otro mes, usá las flechas al lado del nombre del mes.",
            "Tocá **Sin visitas** para ver solo las piletas a las que no fuimos.",
            "Para ver lo de un solo auto o una sola persona, elegilo en **Auto** o en **Empleado**.",
            "Tocá el título de una columna para ordenar (por ejemplo, **Días sin visita** de mayor a menor).",
            "Tocá una fila para ver cada visita de esa pileta: el día, cómo quedó (también si se salteó o no estaba el cliente), quién la hizo, el cloro y las observaciones. Desde ahí, “Abrir la visita” lleva a la visita para corregirla.",
          ],
          notas: [
            "“Services hechos” (o “Desagotes hechos”) cuenta las visitas con el registro cargado. Si fueron dos personas a la misma visita, cuenta una vez.",
            "Las visitas que quedaron pendientes, las salteadas y las de “no estaba el cliente” no tienen columna: se ven en el detalle de cada pileta (y quedan guardadas para recordarlas al armar el itinerario).",
            "“Días sin visita” cuenta desde la última visita registrada de ese tipo (aunque haya sido otro mes) hasta hoy, o hasta el fin del mes si mirás un mes pasado.",
            "Con **Auto** o **Empleado** elegido, aparecen solo las piletas que tuvieron visitas de ese auto o de esa persona.",
          ],
          captura: "control",
        },
        {
          id: "notas",
          titulo: "Anotar algo de una pileta para el mes",
          cuando: "Para acordarte de algo de esa pileta ese mes: cobrar, cambiar el filtro, que pidió un desagote...",
          cubre: ["guardarNotaMesAction"],
          pasos: [
            "Tocá la fila de la pileta: se abre su detalle.",
            "Arriba, en **Notas del mes**, escribí lo que quieras.",
            "Tocá **Guardar nota**.",
          ],
          resultado: "Aparece el aviso “Nota guardada” y la nota queda en la columna **Notas del mes**, en la planilla de services y en la de desagotes de ese mes, y sale en el Excel.",
          notas: [
            "Hay una nota por pileta y por mes: el mes siguiente empieza vacía.",
            "Para borrarla, dejá el texto vacío y tocá **Guardar nota** (aparece “Nota borrada”).",
            "La columna **Observaciones del equipo** junta lo que escribieron los empleados al registrar cada visita del mes, con el día adelante. Esa no se edita acá: se corrige en la visita.",
          ],
        },
        {
          id: "excel",
          titulo: "Bajar la planilla a Excel o mandarla por WhatsApp",
          pasos: [
            "Dejá la tabla como la querés (pestaña, mes, filtros y orden): se baja lo que se ve.",
            "Tocá **Descargar Excel** para guardarla, o **Compartir** para mandarla por WhatsApp (en el celular se elige el contacto; en la computadora se descarga y se abre WhatsApp para adjuntarla).",
          ],
        },
      ],
      reglas: [
        "Los números salen del itinerario y de los registros: lo que no se registró no cuenta. Para corregir algo, corregí la visita.",
        "Cada visita va a la planilla de su tipo (service o desagote), según cómo se cargó en el itinerario.",
        "Las notas del mes tienen hasta 2000 caracteres.",
        "Solo lo ven el dueño y el súper admin. No tiene precios.",
      ],
      avisos: [
        { mensaje: "No hay piletas para mostrar con estos filtros.", solucion: "Ninguna pileta tuvo visitas con ese auto o esa persona en el mes. Elegí “todos” en **Auto** o **Empleado**, o cambiá de mes." },
        { mensaje: "No hubo desagotes este mes con estos filtros.", solucion: "En la planilla de desagotes solo aparecen las piletas que tuvieron algún desagote en el itinerario de ese mes. Cambiá de mes o sacá los filtros." },
        { mensaje: "La nota puede tener hasta 2000 caracteres", solucion: "Acortá la nota." },
        { mensaje: "Pileta no encontrada", solucion: "La pileta se borró mientras tenías la pantalla abierta. Recargá la pantalla." },
        { mensaje: "Datos inválidos", solucion: "Recargá la pantalla y volvé a guardar la nota." },
      ],
      capturas: [{ archivo: "control", alt: "La planilla de services del mes, con una fila por pileta, los totales y las notas", ruta: "/admin/services", como: "owner" }],
    },
    {
      id: "planilla",
      titulo: "Planilla semanal del mes",
      rutas: ["/admin/services/planilla"],
      resumen: "La planilla mensual del service, como la de papel: una fila por pileta con el N° y el nombre del cliente titular, la dirección, qué pasó cada semana y el cloro que se le puso. No tiene precios. Se arma sola con el itinerario y los registros.",
      queVes: [
        "El enlace **Planilla de services** para volver, el título **Planilla del mes**, el botón **Imprimir** y las pestañas **Services**, **Desagotes** y **Planilla semanal**.",
        "El mes con cuántas piletas tienen visitas, cuántas visitas hechas y cuántas piletas activas quedaron sin agendar, y las flechas “Mes anterior” y “Mes siguiente”.",
        "El filtro **Todas** / **Sin agendar**: con **Sin agendar** quedan solo las piletas activas que no tienen ninguna visita en el itinerario de ese mes.",
        "La tabla con las columnas **N°**, **Cliente**, **Dirección**, Sem 1 a Sem 5 (debajo de cada una, los días que abarca: 1–7, 8–14, 15–21, 22–28 y 29 al fin de mes) y **Cloro**.",
        "En cada semana, una marca por visita con el día debajo: **S** service hecho, **D** desagote hecho, **X** salteada, **NE** no estaba el cliente y **·** pendiente. Tocá una marca para abrir la visita, o la dirección para abrir la pileta.",
        "Debajo de la tabla, las referencias de las marcas.",
      ],
      tareas: [
        {
          id: "ver-planilla",
          titulo: "Ver e imprimir la planilla del mes",
          pasos: [
            "En **Services**, tocá **Planilla semanal**: se abre el mismo mes que estabas mirando.",
            "Usá las flechas para ir a otro mes.",
            "Para tenerla en papel o en PDF, tocá **Imprimir** y elegí la impresora o “Guardar como PDF”.",
          ],
          resultado: "Sale solo la tabla, en hoja apaisada, sin el menú, los botones ni el filtro.",
          notas: [
            "Aparecen todas las piletas activas, y también las desactivadas que tuvieron visitas ese mes, ordenadas por N° de cliente (las de clientes sin N°, al final, por nombre).",
            "Las piletas activas sin ninguna visita en el mes van resaltadas y dicen “Sin agendar este mes”: así no se pasa ningún cliente. Para agendarlas, andá al “Itinerario”.",
            "El cliente es el titular de la pileta. Si la pileta es compartida, los co-clientes no aparecen en la planilla.",
            "El cloro es la suma de lo que se registró en las visitas de ese mes, por tipo y en su unidad.",
            "Para corregir una marca, abrí la visita y registrá, corregí o salteala desde ahí: la planilla se actualiza sola.",
          ],
          captura: "planilla",
        },
      ],
      avisos: [
        { mensaje: "Todas las piletas activas tienen al menos una visita este mes.", solucion: "Con el filtro **Sin agendar** no queda ninguna: no se pasó ningún cliente. Tocá **Todas** para ver la planilla completa." },
        { mensaje: "No hay piletas activas ni visitas en el itinerario de este mes.", solucion: "Todavía no hay piletas cargadas. Cargalas en “Clientes y piletas”." },
      ],
      capturas: [{ archivo: "planilla", alt: "La planilla del mes con cada pileta, su cliente, su dirección y las marcas de cada semana", ruta: "/admin/services/planilla", como: "owner" }],
    },
  ],
}
