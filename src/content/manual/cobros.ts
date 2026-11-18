import type { Tema } from "./tipos"

export const cobros: Tema = {
  id: "cobros",
  titulo: "Cobros",
  grupo: "Operación",
  icono: "ventas",
  roles: ["super_admin", "owner"],
  resumen: "Cuánto te debe cada cliente, calculado solo: lo hecho (cada visita y el cloro, con el precio de ese cliente que regía ese día) menos lo que pagó. También lo que cobraron los empleados y todavía no te entregaron, y para cargar los pagos que te hacen a vos.",
  relacionados: ["clientes", "itinerario", "glosario"],
  secciones: [
    {
      id: "deuda",
      titulo: "Cobros: la deuda de cada cliente",
      rutas: ["/admin/cobros"],
      resumen: "Una pantalla con todo lo que hay que cobrar: quién debe, cuánto, y quién tiene la plata que ya se cobró.",
      queVes: [
        "El título **Cobros** y tres cuadros: “Te deben” (la suma de lo que deben los clientes), “Lo tienen los empleados” (lo que cobraron y no te entregaron) y “Clientes con cuenta”.",
        "Si algún cliente tiene visitas o cloro sin precio cargado, un aviso naranja: esas cosas cuentan $ 0 hasta que cargues el precio en su ficha.",
        "El bloque **Lo tienen los empleados**: por empleado, cuánto tiene en total con el botón **Confirmar todo**, y cada cobro (monto, cliente, día y nota) con su botón **Confirmar**.",
        "El bloque **Cargar un pago** con **Cliente**, **Monto**, **Fecha**, “Nota (opcional)” y el botón **Guardar pago**.",
        "La tabla con **N°**, **Cliente**, **Services**, **Desagotes**, **Lo hecho ($)**, **Pagó ($)**, **Debe ($)**, **Lo tiene un empleado ($)**, **Último pago** y **Sin precio**, con los filtros **Deben** (al entrar), **Todos** y **Sin precio**, el buscador, los totales y los botones para bajar a Excel o compartir.",
      ],
      tareas: [
        {
          id: "ver",
          titulo: "Ver cuánto te debe cada cliente",
          pasos: [
            "Tocá **Cobros** en el menú.",
            "La tabla arranca con los que deben, de mayor a menor. Tocá **Todos** para ver también los que están al día o tienen saldo a favor.",
            "Tocá un cliente para ver el detalle (ver “Cuenta de un cliente”).",
            "Para pasarlo a una planilla, usá los botones de Excel de arriba de la tabla.",
          ],
          notas: [
            "Se calcula solo, al día de hoy: cada visita hecha (service o desagote) con el precio que regía ese día para ese cliente, más el cloro registrado (por litro, kilo o pastilla), menos los pagos.",
            "Las visitas salteadas o en las que no estaba el cliente no se cobran.",
            "Cada visita se le cobra al titular de la pileta.",
            "Los pagos que anotó un empleado ya cuentan como pagados, aunque todavía no te hayan dado la plata.",
            "Si el saldo es negativo, el cliente tiene plata a favor (“A favor $ …”).",
          ],
        },
        {
          id: "confirmar",
          titulo: "Confirmar la plata que te entrega un empleado",
          cubre: ["confirmarCobroAction", "confirmarCobrosDeAction"],
          pasos: [
            "En **Lo tienen los empleados**, buscá al empleado.",
            "Si te dio todo, tocá **Confirmar todo**. Si te dio solo una parte, tocá **Confirmar** en cada cobro que te dio.",
          ],
          resultado: "Aparece el aviso “Cobro confirmado” (o cuántos se confirmaron) y esos cobros dejan de estar en el bloque. Quedan a tu nombre como recibidos.",
          notas: ["El empleado ya no los puede borrar una vez que los confirmaste."],
        },
        {
          id: "cargar",
          titulo: "Cargar un pago que te hicieron a vos",
          cuando: "Cuando el cliente te paga en mano, por transferencia o de cualquier forma que no pasa por un empleado.",
          cubre: ["cargarPagoAction"],
          pasos: [
            "En **Cargar un pago**, elegí el **Cliente**.",
            "Escribí el **Monto** en pesos y, si no fue hoy, cambiá la **Fecha**.",
            "Si querés, escribí una nota (por ejemplo “transferencia”).",
            "Tocá **Guardar pago**.",
          ],
          resultado: "Aparece el aviso “Pago guardado” y la deuda del cliente baja en el acto.",
        },
      ],
      reglas: [
        "Solo vos y el súper admin ven esta pantalla. Los empleados no ven precios ni deudas: solo anotan cuánto cobraron.",
        "Los precios de cada cliente se cargan en su ficha, en “Precios”.",
      ],
      avisos: [
        { mensaje: "Cobro confirmado", solucion: "Quedó como recibido. No hay nada más que hacer." },
        { mensaje: "Ese cobro ya estaba confirmado", solucion: "Ya lo habías confirmado (o lo confirmó otro usuario). Recargá la pantalla." },
        { mensaje: "No tenía cobros sin entregar", solucion: "Ese empleado ya no tiene cobros pendientes. Recargá la pantalla." },
        { mensaje: "Pago guardado", solucion: "El pago se cargó y la deuda ya está actualizada." },
        { mensaje: "El monto tiene que ser un número mayor que 0 (por ejemplo 15.000 o 15.000,50)", solucion: "Escribí solo el número, sin letras. Los centavos van con coma." },
        { mensaje: "Los pagos son solo de clientes", solucion: "Elegí un cliente de la lista." },
        { mensaje: "Revisá la fecha: tiene que ser entre el año 2000 y el 2100", solucion: "Corregí la **Fecha**." },
        { mensaje: "Cliente no encontrado", solucion: "Ese cliente ya no existe. Recargá la pantalla." },
        { mensaje: "Datos inválidos", solucion: "Recargá la pantalla y volvé a intentar." },
        { mensaje: "Ningún cliente debe nada.", solucion: "Con el filtro **Deben** no queda nadie: están todos al día. Tocá **Todos** para verlos." },
        { mensaje: "Nadie tiene plata cobrada sin entregarte.", solucion: "Todos los cobros de los empleados ya están confirmados." },
      ],
    },
    {
      id: "cuenta",
      titulo: "Cuenta de un cliente",
      rutas: ["/admin/cobros/[clienteId]"],
      resumen: "Todo lo que se le hizo y todo lo que pagó un cliente, línea por línea, con el saldo después de cada movimiento.",
      queVes: [
        "El enlace **Volver a cobros**, el nombre y el N° del cliente, y el botón **Ver precios en la ficha**.",
        "Tres cuadros: lo que **Debe** (o lo que tiene **A favor**), “Lo hecho” (y cuántas cosas no tienen precio) y lo que “Pagó”.",
        "El bloque **Cargar un pago** (ya con este cliente elegido).",
        "El bloque **Movimientos**, del más nuevo al más viejo: **Fecha**, **Concepto** (Service, Desagote, el cloro con su cantidad, o Pago), **Precio** (el que regía ese día, o “Sin precio”), **Cargo**, **Pago** y **Saldo**. Los pagos tienen un tacho para borrarlos.",
      ],
      tareas: [
        {
          id: "revisar",
          titulo: "Revisar la cuenta y corregir un pago",
          cubre: ["borrarPagoAction"],
          pasos: [
            "En **Cobros**, tocá el cliente.",
            "Revisá los movimientos. Si una línea dice “Sin precio”, tocá **Ver precios en la ficha** y cargá el precio desde una fecha anterior a esa visita.",
            "Si un pago está mal, tocá el tacho (“Borrar pago”), confirmá, y cargalo de nuevo bien.",
          ],
          resultado: "Al borrar aparece el aviso “Pago borrado” y el saldo se recalcula.",
          notas: [
            "Para corregir una visita o el cloro, hacelo desde la visita en el “Itinerario”: la cuenta se actualiza sola.",
            "Un pago que dice “(lo tiene un empleado)” todavía no te lo entregaron.",
          ],
        },
      ],
      avisos: [
        { mensaje: "Pago borrado", solucion: "Se borró y el saldo del cliente volvió a subir." },
        { mensaje: "Ese pago ya no estaba", solucion: "Ya lo habían borrado. Recargá la pantalla." },
        { mensaje: "Todavía no hay visitas hechas, cloro ni pagos.", solucion: "Este cliente no tiene movimientos todavía." },
      ],
    },
  ],
}
