import type { Tema } from "./tipos"

// El hilo que une las pantallas: de dar de alta un cliente a ver el service hecho. Sirve para entender cómo encajan los módulos.
export const recorrido: Tema = {
  id: "recorrido",
  titulo: "Recorrido de un día de trabajo",
  grupo: "Primeros pasos",
  icono: "recorrido",
  roles: ["super_admin", "owner"],
  resumen: "De punta a punta: dar de alta un cliente y su pileta, armar el día con autos y equipos, qué hace el empleado, cómo ves el resultado del día y del mes, y cómo registrás una venta.",
  relacionados: ["clientes", "itinerario", "services", "empleados", "ventas"],
  secciones: [
    {
      id: "dia-de-trabajo",
      titulo: "Un día de trabajo, paso a paso",
      rutas: [],
      resumen: "Así encajan las pantallas entre sí. Cada paso remite al tema donde está explicado en detalle.",
      tareas: [
        {
          id: "cliente-y-pileta",
          titulo: "1. Dar de alta un cliente nuevo y su pileta",
          cuando: "Cuando entra un cliente nuevo.",
          pasos: [
            "En **Clientes y piletas** tocá **Nuevo cliente** y escribí el **Nombre** (es lo único obligatorio; el **N° de cliente** viene sugerido).",
            "En “Pileta”, dejá **Pileta nueva** y completá la dirección (o elegí **Una pileta que ya existe** si la comparte con otro cliente).",
            "Tocá **Crear cliente**.",
          ],
          resultado: "El cliente y su pileta quedan cargados en un solo paso. Los clientes todavía no entran a la web: todo lo carga el equipo.",
        },
        {
          id: "armar-itinerario",
          titulo: "2. Armar el día: autos, equipos y ruta",
          cuando: "El día anterior o a primera hora.",
          pasos: [
            "En **Itinerario** mirá el calendario (los días celestes ya están programados) y tocá **Hoy** o el día que quieras armar.",
            "Si el recorrido se repite, tocá **Copiar itinerario de la semana anterior**: copia las piletas, el auto, el tipo y el encargado de cada visita, y quién iba en cada auto.",
            "En la misma pantalla están todos los autos. En cada uno, sumá a la gente con **Sumar al auto...** (no es obligatorio).",
            "Para agregar piletas a un auto, tocá **Agregar piletas** en su tarjeta, tocá las que van (en orden) y confirmá.",
            "Si una pileta la tiene que hacer alguien en particular, elegilo en **Lo tiene que hacer**.",
            "Ordená la ruta de cada auto con **Subir** y **Bajar**.",
          ],
          resultado: "Cada persona ve en su celular la ruta de su auto, en ese orden, y con quién va.",
        },
        {
          id: "el-empleado",
          titulo: "3. Qué hace el empleado",
          pasos: [
            "Abre su ruta del día y entra a cada pileta.",
            "Al terminar toca **Hecha** en la lista y anota el cloro (si puso) y observaciones; o toca **No se pudo**, elige **No estaba el cliente** o **Saltear por hoy** y deja una nota con el motivo. El dueño lo ve en el momento: las pantallas con el cartel **En vivo** se actualizan solas.",
            "Si va otra persona a la misma pileta, también puede sumar su registro.",
          ],
          notas: ["El empleado puede registrar visitas de los últimos 7 días (nunca de días que todavía no llegaron) y corregir o borrar sus propios registros de esa semana. Todo cambio queda en el historial."],
        },
        {
          id: "ver-resultado",
          titulo: "4. Ver cómo salió el día y el mes",
          pasos: [
            "En el **Itinerario** del día, cada pileta muestra su estado y quién la hizo. Tocando el nombre de la pileta abrís la visita: ahí también podés registrar, corregir o borrar, de cualquier fecha pasada.",
            "En **Services** ves, pileta por pileta, cuántas veces fuimos en el mes, qué pasó en cada visita y cuánto cloro se puso. Ahí también está la **Planilla semanal**, como la de papel, lista para imprimir.",
            "En **Empleados** ves cuántas visitas, días y cloro hizo cada persona en el mes, día por día, y el historial de cambios de los registros.",
          ],
        },
        {
          id: "vender",
          titulo: "5. Registrar una venta que llegó por WhatsApp",
          pasos: [
            "En **Ventas** tocá **Venta manual**.",
            "Elegí el **Cliente**, los productos y las cantidades y tocá **Registrar venta**.",
            "Si vendiste más de lo que había en stock, el sistema te avisa y deja el stock en 0.",
          ],
          resultado: "La venta queda en el historial y descuenta el stock.",
        },
      ],
    },
  ],
}
