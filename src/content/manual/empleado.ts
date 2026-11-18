import type { Tema } from "./tipos"
import { glosarioEmpleado } from "./glosario"
import { siAlgoFalla } from "./si-algo-falla"

// Manual del empleado: la app de /employee, pensada para usar desde el celular.
const primerosPasos: Tema = {
  id: "primeros-pasos",
  titulo: "Primeros pasos",
  grupo: "Primeros pasos",
  icono: "cohete",
  resumen: "Cómo entrar, cambiar tu contraseña si la olvidaste y moverte por la app.",
  relacionados: ["hoy", "glosario"],
  secciones: [
    {
      id: "ingresar",
      titulo: "Ingresar a la app",
      rutas: ["/login"],
      resumen: "Con tu email y tu contraseña entrás directo a tu ruta del día.",
      queVes: [
        "El título **Iniciar sesión** y los campos **Email** y **Contraseña**.",
        "El enlace **¿Olvidaste tu contraseña?** y el botón **Ingresar**.",
        "Abajo, el botón **Instalar app**.",
      ],
      tareas: [
        {
          id: "entrar",
          titulo: "Entrar a la app",
          pasos: [
            "Abrí la web y tocá **Ingresar** (en el celular, el menú de arriba a la derecha).",
            "Escribí tu **Email** y tu **Contraseña**.",
            "Tocá **Ingresar**.",
          ],
          resultado: "Entrás a tu pantalla **Hoy**, con las piletas de hoy.",
          notas: ["Tu cuenta la tiene que habilitar como empleado el administrador. Hasta entonces entrás como cliente y no ves tu itinerario."],
        },
        {
          id: "instalar-app",
          titulo: "Instalar la app en el celular",
          pasos: [
            "En la pantalla de ingreso, tocá **Instalar app**.",
            "En Android, aceptá el cuadro que aparece. En iPhone, tocá Compartir en Safari y elegí “Agregar a inicio”.",
          ],
          resultado: "Queda un ícono de Pancho Piletas en tu celular, que abre la app sin la barra del navegador.",
          notas: ["Si ya la tenés instalada, el botón **Instalar app** no aparece."],
        },
        {
          id: "cerrar-sesion",
          titulo: "Cerrar la sesión",
          pasos: ["Tocá el botón de la flechita de salida (**Cerrar sesión**), arriba a la derecha."],
          resultado: "Aparece “Sesión cerrada” y volvés a la pantalla de ingreso.",
        },
      ],
      avisos: [
        { mensaje: "Email o contraseña incorrectos", solucion: "Revisá el email y la contraseña. Si no la recordás, tocá **¿Olvidaste tu contraseña?**." },
        { mensaje: "Tu cuenta está bloqueada. Contactá a Pancho.", solucion: "Tu cuenta fue bloqueada y no podés entrar. Hablá con Pancho." },
        { mensaje: "Error inesperado. Intentá de nuevo.", solucion: "Falló la conexión. Esperá unos segundos y probá otra vez." },
      ],
    },
    {
      id: "contrasena",
      titulo: "Recuperar la contraseña",
      rutas: ["/recover", "/reset-password"],
      resumen: "Si te olvidaste la contraseña, te llega un enlace por email para elegir una nueva.",
      queVes: [
        "**Recuperar contraseña**: el campo **Email** y los botones **Enviar link** y **Volver**.",
        "Después, **Revisá tu email**, y en la pantalla que abre el enlace, **Nueva contraseña**, **Confirmar contraseña** y **Actualizar contraseña**.",
      ],
      tareas: [
        {
          id: "recuperar",
          titulo: "Elegir una contraseña nueva",
          pasos: [
            "En la pantalla de ingreso, tocá **¿Olvidaste tu contraseña?**.",
            "Escribí tu **Email** y tocá **Enviar link**.",
            "Abrí tu correo (mirá también no deseados) y tocá el enlace.",
            "Escribí la **Nueva contraseña**, repetila en **Confirmar contraseña** y tocá **Actualizar contraseña**.",
          ],
          resultado: "Aparece “Contraseña actualizada correctamente”. Ya podés entrar con la nueva.",
        },
      ],
      avisos: [
        { mensaje: "Las contraseñas no coinciden", solucion: "Escribí las dos iguales." },
        { mensaje: "Mínimo 6 caracteres", solucion: "La contraseña tiene que tener al menos 6 caracteres." },
      ],
    },
    {
      id: "menu",
      titulo: "Moverte por la app",
      rutas: [],
      resumen: "Abajo de todo hay un menú fijo con dos botones grandes, para usar con el pulgar.",
      queVes: [
        "Arriba, **Piletas Pancho** y tu nombre (“Hola, …”), el botón **?** de ayuda y **Cerrar sesión**.",
        "Abajo, el menú: **Hoy** (tu ruta del día) y **Ayuda** (este manual).",
      ],
      tareas: [
        {
          id: "ayuda",
          titulo: "Pedir ayuda sobre la pantalla donde estás",
          pasos: [
            "Tocá el botón **?** de arriba.",
            "Se abre un panel con los pasos de esa pantalla.",
            "Tocá **Ver en el manual completo** si querés leer más.",
          ],
        },
      ],
    },
    {
      id: "manual",
      titulo: "Este manual",
      rutas: ["/employee/ayuda", "/employee/ayuda/[tema]"],
      resumen: "La guía completa de la app. Se abre desde el botón **?** de cualquier pantalla.",
      queVes: [
        "La caja **Buscar en el manual**, los temas en tarjetas y, adentro de cada tema, el botón **Imprimir este tema**.",
      ],
      tareas: [
        {
          id: "buscar",
          titulo: "Buscar algo en el manual",
          pasos: [
            "Escribí una palabra en **Buscar en el manual**, por ejemplo `cloro`.",
            "Tocá el resultado para ir a esa parte.",
          ],
        },
      ],
    },
    {
      id: "avisos-generales",
      titulo: "Avisos que pueden aparecer en cualquier pantalla",
      rutas: [],
      resumen: "No son de una pantalla en particular.",
      tareas: [],
      avisos: [
        { mensaje: "No autenticado", solucion: "Se cerró tu sesión. Volvé a entrar desde **Ingresar**." },
        { mensaje: "No tenés permisos para esta acción", solucion: "Tu cuenta no tiene permiso para eso. Avisale a Pancho." },
        { mensaje: "Tu cuenta está bloqueada. Contactá a Pancho.", solucion: "Hablá con Pancho para que te habilite." },
        { mensaje: "Sesión cerrada", solucion: "Confirma que saliste de la app. No hay que hacer nada." },
      ],
    },
  ],
}

const hoy: Tema = {
  id: "hoy",
  titulo: "Tu día de trabajo",
  grupo: "Trabajo",
  icono: "hoy",
  resumen: "Ver la ruta de tu auto, llegar a cada pileta con Google Maps y marcar cada una desde la lista.",
  relacionados: ["glosario"],
  secciones: [
    {
      id: "itinerario",
      titulo: "Hoy: tu ruta del día",
      rutas: ["/employee/itinerario"],
      resumen: "Las piletas que te tocan, en el orden que armó el dueño. Cada una se marca ahí mismo, sin cambiar de pantalla.",
      queVes: [
        "Arriba, qué día es (“Hoy”, “Ayer”…) y la fecha. Al lado, el cartelito verde **En vivo**: la pantalla se actualiza sola cuando un compañero marca una pileta.",
        "Las flechas para cambiar de día: **Día anterior** para ver los días anteriores (hasta 7 atrás) y, cuando estás en otro día, **Día siguiente** y **Volver a hoy** para volver.",
        "La tarjeta del día: “Vas en …” con el auto y tus compañeros, cuántas llevás de las que te tocan (“2 de 7 piletas hechas”), cuántas te quedan y una barra verde de avance. Si en el auto también hay piletas de un compañero, el avance cuenta solo las tuyas (“2 de 7 tuyas hechas”) y abajo dice cómo va el auto entero (“En Palio: 5 de 12 hechas”).",
        "El botón **Abrir la ruta completa**, que abre Google Maps con todas las piletas pendientes del auto (también las de tus compañeros, para que el que maneja los lleve) en el orden del recorrido. Si son muchas, aparece partido en partes de 9 paradas (“parte 1”, “parte 2”…).",
        "Si el dueño te asignó piletas a vos, primero el bloque **Te tocan a vos** y después **Del equipo**. Si no, un solo bloque: **Piletas del día**. Cada bloque dice cuántas van hechas.",
        "Una tarjeta por pileta: el número de orden (o un tilde verde si está hecha), el alias o la dirección, el cliente, el barrio, el tipo de visita (“Service” o “Desagote”) y el botón **Cómo llegar**.",
        "En las pendientes, dos botones grandes: **Hecha** y **No se pudo**. Las que ya se resolvieron muestran su estado (**Hecha**, **Salteada** o **No estaba**); las hechas, además, el cloro que se puso, y las que no se pudieron, la nota que dejaron.",
        "Las piletas que le tocan a un compañero dicen “Le toca a …” y no tienen botones.",
        "Cuando no queda ninguna pendiente, el cartel verde **¡Jornada completa!**.",
        "Solo para el dueño (y el súper admin), cuando entra con **Modo campo**: arriba, el recuadro **Modo campo** con el selector “Hoy voy en” (“Sumarme a un auto”), el botón **Agregar a mi día** y **Volver al backoffice**. Los empleados no lo ven.",
      ],
      tareas: [
        {
          id: "ver",
          titulo: "Ver qué piletas te tocan hoy",
          pasos: [
            "Tocá **Hoy** en el menú de abajo.",
            "Recorré la lista de arriba hacia abajo: ese es el orden del recorrido.",
          ],
          notas: [
            "Si vas en un auto, ves las piletas de tu auto. Las piletas que el dueño no puso en ningún auto las ven todos (o solo la persona a la que se las asignó).",
            "Si una pileta te toca a vos, la ves en **Te tocan a vos** aunque vaya en otro auto. Si le toca a un compañero, la ves pero solo él la puede marcar.",
            "No hace falta recargar: con **En vivo**, lo que marca un compañero aparece solo.",
          ],
          captura: "itinerario",
        },
        {
          id: "ruta",
          titulo: "Abrir toda la ruta en Google Maps",
          cuando: "Al salir, para que el celular te lleve pileta por pileta en el orden del día.",
          pasos: [
            "Tocá **Abrir la ruta completa**.",
            "Se abre Google Maps con el recorrido desde donde estás, pasando por las piletas pendientes en orden. Tocá “Iniciar”.",
            "Si la ruta viene partida, cuando llegues a la última parada de la parte 1 volvé a la app y abrí la parte 2.",
          ],
          notas: [
            "Solo entran las piletas pendientes: las que ya marcaste no vuelven a aparecer. Si la abrís de nuevo a mitad del día, arranca con lo que te falta.",
            "Las piletas sin dirección cargada no entran en la ruta. Avisale al dueño para que la complete.",
          ],
        },
        {
          id: "llegar",
          titulo: "Llegar a una sola pileta",
          pasos: [
            "En la tarjeta de la pileta, tocá **Cómo llegar** (el ícono de la flecha).",
            "Se abre Google Maps con el camino desde donde estás hasta esa pileta.",
          ],
        },
        {
          id: "otros-dias",
          titulo: "Cerrar una pileta de un día anterior",
          cuando: "Cuando te quedó una pileta sin marcar, o tenés que corregir un registro de los últimos días.",
          pasos: [
            "Tocá **Día anterior** hasta llegar al día.",
            "Marcá la pileta como siempre, o abrila para corregir tu registro.",
            "Para volver, tocá **Volver a hoy**.",
          ],
          notas: [
            "Se ven hoy y los 7 días anteriores. Los días que vienen no se muestran: la ruta de cada día la arma el dueño.",
          ],
        },
        {
          id: "campo",
          titulo: "Modo campo (solo el dueño)",
          cuando: "Cuando el dueño sale a hacer piletas y quiere marcar lo que hizo desde el celular, como un empleado.",
          cubre: ["sumarmeAAutoAction", "agregarAMiDiaAction"],
          pasos: [
            "En el backoffice, tocá **Modo campo** (arriba a la derecha). Se abre esta misma pantalla, con tu día.",
            "En “Hoy voy en”, elegí el auto en el que salís (o “Ningún auto”). Aparece el aviso “Listo: hoy vas en ese auto” y ves la ruta de ese auto.",
            "Para sumarte una pileta que no estaba en el plan, tocá **Agregar a mi día**, buscala, tocala y confirmá. Aparece el aviso “Pileta agregada a tu día” (o cuántas se agregaron).",
            "Marcá cada pileta con **Hecha** o **No se pudo**, igual que un empleado.",
            "Para volver, tocá **Volver al backoffice** (o **Backoffice** arriba).",
          ],
          notas: [
            "Ves lo mismo que vería un empleado en tu lugar: las piletas de tu auto, las que te tocan a vos y las sin auto que puede hacer cualquiera.",
            "Las piletas que agregás quedan hoy, en el auto en el que vas, a tu nombre (“Le toca a …”), al final de la ruta. Desde el “Itinerario” del backoffice podés cambiarlas como cualquier otra.",
            "Los registros quedan a tu nombre. Para registrar a nombre de un empleado, usá la visita en el backoffice.",
            "Subirte a un auto y agregar piletas solo se puede en el día de hoy. En los días anteriores, solo marcás.",
          ],
        },
        {
          id: "abrir",
          titulo: "Abrir una pileta",
          pasos: ["Tocá el nombre de la pileta en su tarjeta."],
          resultado: "Se abre la pantalla de la pileta, con todos sus datos y sus registros (ver “La pantalla de una pileta”).",
        },
      ],
      reglas: [
        "La ruta la arma el dueño: qué piletas, en qué orden, en qué auto, si es service o desagote, y quién va en cada auto. Puede cambiarla en cualquier momento.",
        "Ves y marcás hoy y hasta 7 días atrás. Los días que vienen no se ven.",
      ],
      avisos: [
        { mensaje: "No hay piletas asignadas para hoy", solucion: "El dueño todavía no cargó tu ruta de hoy. Avisale." },
        { mensaje: "No hay piletas para este día", solucion: "Ese día no tenés piletas cargadas." },
        { mensaje: "¡Jornada completa!", solucion: "Marcaste todas las piletas del día. No hay nada más que hacer." },
        { mensaje: "Listo: hoy vas en ese auto", solucion: "Modo campo: ya figurás en ese auto y ves su ruta." },
        { mensaje: "Listo: hoy no vas en ningún auto", solucion: "Modo campo: te bajaste del auto. Ves las tuyas y las sin auto." },
        { mensaje: "Pileta agregada a tu día", solucion: "Modo campo: la pileta quedó en tu ruta de hoy, a tu nombre." },
        { mensaje: "Esas piletas ya están en el itinerario de hoy", solucion: "Modo campo: ya estaban en el día de hoy (en tu auto o en otro). Buscalas en el “Itinerario” del backoffice." },
        { mensaje: "Auto no encontrado", solucion: "Modo campo: ese auto se borró o se desactivó. Recargá la pantalla y elegí otro." },
        { mensaje: "Modo campo: para sumarte a un auto o agregar piletas, volvé a hoy.", solucion: "En los días anteriores solo se marcan las piletas. Tocá **Volver a hoy**." },
        { mensaje: "Hay novedades del equipo: la pantalla se actualizó", solucion: "Un compañero marcó o registró una pileta. La lista ya muestra el cambio." },
      ],
      capturas: [{ archivo: "itinerario", alt: "La ruta del día con la tarjeta del auto, el avance y los botones Hecha y No se pudo", ruta: "/employee/itinerario", como: "employee" }],
    },
    {
      id: "marcar",
      titulo: "Marcar una pileta",
      rutas: [],
      resumen: "Desde la lista de **Hoy** (o desde la pantalla de la pileta) tocás **Hecha** o **No se pudo**. Sube una ventana desde abajo para completar lo que pasó.",
      queVes: [
        "Con **Hecha**, la ventana “¿Qué se hizo?”: el **Cloro aplicado** en cuatro botones grandes (**Sin cloro**, **Líquido**, **Granulado**, **Pastillas**), la cantidad con los botones **Menos** y **Más** y valores rápidos, **Observaciones (opcional)** y los botones **Cancelar** y **Guardar**.",
        "Con **No se pudo**, la ventana “¿Por qué no se pudo?”: dos opciones, **No estaba el cliente** y **Saltear por hoy**, la **Nota para el dueño (opcional)** y **Cancelar** / **Guardar**.",
      ],
      tareas: [
        {
          id: "hecha",
          titulo: "Marcar una pileta como hecha",
          cuando: "Cuando hiciste el service o el desagote.",
          cubre: ["registrarServiceAction"],
          pasos: [
            "En la tarjeta de la pileta, tocá **Hecha**. Sube la ventana “¿Qué se hizo?”.",
            "En **Cloro aplicado**, tocá el tipo que le pusiste: **Líquido**, **Granulado** o **Pastillas**. Si no le pusiste, dejá **Sin cloro**.",
            "Poné la cantidad: tocá un valor rápido (por ejemplo `300 g` o `2 L`), o ajustala con **Menos** y **Más**, o escribila. Se mide en **Litros** (líquido), **Gramos** (granulado) o **Cantidad de pastillas** (se puede poner media: `1,5`). Si no sabés cuánto, dejala vacía.",
            "Si hay algo para contar (agua muy verde, un skimmer roto), escribilo en **Observaciones (opcional)**.",
            "Tocá **Guardar**. Para no guardar nada, tocá **Cancelar** o la cruz.",
          ],
          resultado: "Aparece “¡Pileta marcada como hecha!”, se cierra la ventana y la pileta queda con el tilde verde y el cloro que pusiste.",
          notas: [
            "No hace falta cargar tareas: si la visita es service o desagote lo decide el dueño al armar la ruta.",
            "Aunque toques **Guardar** dos veces, se guarda un solo registro.",
            "Al cambiar de tipo de cloro, la cantidad se borra para que no quede un número de otra unidad.",
          ],
          captura: "formulario",
        },
        {
          id: "no-se-pudo",
          titulo: "Marcar que no se pudo",
          cuando: "Cuando fuiste y no había nadie, o cuando no vas a poder hacerla hoy.",
          cubre: ["marcarPiletaAction"],
          pasos: [
            "En la tarjeta de la pileta, tocá **No se pudo**. Sube la ventana “¿Por qué no se pudo?”.",
            "Elegí el motivo: **No estaba el cliente** o **Saltear por hoy** (el dueño la reprograma para otro día).",
            "Si querés, contale al dueño qué pasó en **Nota para el dueño (opcional)**: “portón cerrado”, “llovía”, “el cliente pidió el jueves”.",
            "Tocá **Guardar**.",
          ],
          resultado: "Aparece “Registrado: no estaba el cliente” o “Pileta salteada”. La pileta queda **No estaba** o **Salteada**, con tu nota, y el dueño la ve en el momento.",
          notas: ["**Guardar** se habilita cuando elegís un motivo."],
          captura: "no-se-pudo",
        },
      ],
      campos: [
        { nombre: "Cloro aplicado", descripcion: "El tipo de cloro que le pusiste: **Líquido**, **Granulado** o **Pastillas**. Si no le pusiste, **Sin cloro**." },
        { nombre: "Litros", descripcion: "Solo para cloro líquido: cuántos litros, aproximado. **Menos** y **Más** van de a medio litro. Hasta 500. Opcional." },
        { nombre: "Gramos", descripcion: "Solo para granulado: cuántos gramos, en números enteros. **Menos** y **Más** van de a 50. Hasta 50.000. Opcional." },
        { nombre: "Cantidad de pastillas", descripcion: "Solo para pastillas: cuántas, de a media (`0,5`, `1`, `1,5`…), hasta 100. Opcional." },
        { nombre: "Observaciones (opcional)", descripcion: "Cualquier cosa que el dueño o el cliente tengan que saber." },
        { nombre: "Nota para el dueño (opcional)", descripcion: "Solo cuando no se pudo: por qué. Hasta 500 letras. Si después la pileta vuelve a pendiente o se hace, la nota se borra." },
      ],
      reglas: [
        "Solo se pueden marcar visitas de hoy y de los últimos 7 días. Las de días que no llegaron se marcan ese día.",
        "Si la pileta le toca a un compañero, solo él la puede marcar. Si hace falta que la hagas vos, pedile al dueño que la cambie.",
        "Con **Hecha** queda registrado el service (el dueño lo ve en la visita y en la planilla del mes). Con **No se pudo** no se registra un service.",
      ],
      avisos: [
        { mensaje: "¡Pileta marcada como hecha!", solucion: "Quedó guardado." },
        { mensaje: "Pileta salteada", solucion: "Quedó registrado que salteaste la pileta." },
        { mensaje: "Registrado: no estaba el cliente", solucion: "Quedó registrado que no estaba el cliente." },
        { mensaje: "Esta pileta le toca a otra persona: solo ella la puede marcar", solucion: "El dueño se la asignó a un compañero. Si la tenés que hacer vos, pedile al dueño que la cambie." },
        { mensaje: "Tipo de cloro inválido", solucion: "Elegí uno de los botones de **Cloro aplicado**." },
        { mensaje: "Cantidad de cloro inválida", solucion: "La cantidad no corresponde a la unidad: litros hasta 500, gramos enteros hasta 50.000, pastillas de a media hasta 100. O dejala vacía." },
        { mensaje: "Esta visita ya está hecha: para corregirla, editá o borrá sus registros", solucion: "Un compañero la marcó antes que vos. Abrí la pileta para ver su registro." },
        { mensaje: "Solo se pueden registrar visitas de los últimos 7 días", solucion: "Esa visita es de hace más de una semana y ya no se puede cerrar desde la app. Avisale al dueño." },
        { mensaje: "No se pueden registrar visitas de días que todavía no llegaron", solucion: "La visita es de un día futuro: se registra ese día." },
        { mensaje: "Solo se puede marcar el estado de visitas de los últimos 7 días", solucion: "Lo mismo para **No se pudo** o **Volver a pendiente**: avisale al dueño." },
        { mensaje: "Pileta no encontrada", solucion: "El dueño quitó esa pileta del día o la pasó a otro auto. Volvé a la ruta y recargala." },
        { mensaje: "Cobro anotado", solucion: "Quedó guardado. Acordate de darle la plata al dueño." },
        { mensaje: "Cobro borrado", solucion: "Se borró. Si te habían pagado, anotalo de nuevo con el monto correcto." },
        { mensaje: "Escribí cuánto te dieron, en pesos (por ejemplo 15000 o 15.000)", solucion: "Escribí solo el número, sin letras. Los centavos van con coma." },
        { mensaje: "Ese cobro ya no se puede borrar (ya se lo entregaste al dueño, o no es tuyo)", solucion: "El dueño ya lo confirmó. Si hay un error, avisale a él." },
        { mensaje: "Solo se anotan cobros de visitas de los últimos 7 días", solucion: "Esa visita es de hace más de una semana. Avisale al dueño para que lo cargue él." },
        { mensaje: "Datos inválidos", solucion: "Volvé a la ruta y abrí la pileta de nuevo." },
      ],
      capturas: [
        { archivo: "formulario", alt: "La ventana “¿Qué se hizo?” con el cloro en botones, la cantidad y las observaciones", ruta: "/employee/itinerario", como: "employee", abrir: ["Hecha"] },
        { archivo: "no-se-pudo", alt: "La ventana “¿Por qué no se pudo?” con el motivo y la nota", ruta: "/employee/itinerario", como: "employee", abrir: ["No se pudo"] },
      ],
    },
    {
      id: "pileta",
      titulo: "La pantalla de una pileta",
      rutas: ["/employee/piletas/[id]"],
      resumen: "Todos los datos de la pileta y sus registros. Desde acá también se marca, se suman registros y se corrige.",
      queVes: [
        "El enlace **Volver al itinerario**, el día de la visita, el alias o la dirección de la pileta y su estado (**Pendiente**, **Hecha**, **Salteada** o **No estaba el cliente**).",
        "El tipo de visita (“Service” o “Desagote”), el auto, el cliente, la dirección completa, el tipo de pileta y las notas, y el botón **Cómo llegar**.",
        "Si no se pudo, la nota que dejó quien la marcó.",
        "Si el dueño eligió quién la tiene que hacer, un cartel: “Esta pileta te toca a vos” o “Esta pileta le toca a …: solo esa persona la puede marcar” (en ese caso no aparecen los botones para marcarla).",
        "Si está pendiente, la pregunta “¿Qué pasó con esta pileta?” con **Hecha** y **No se pudo** (las mismas ventanas que en la lista).",
        "Si ya tiene registros, el bloque **Registros de esta visita**: quién lo hizo (“Vos” o el nombre del compañero), a qué hora, el cloro y las observaciones. Los que corregiste dicen “(corregido)”.",
        "Al final, el bloque **Cobros de esta visita** con el botón **Cobré** y lo que ya anotaste (“Cobraste $ 15.000”), si todavía lo tenés vos (“Falta entregárselo al dueño”) o ya se lo diste (“Ya lo tiene el dueño”).",
      ],
      tareas: [
        {
          id: "cobre",
          titulo: "Anotar que el cliente te pagó",
          cuando: "Cuando el cliente te da plata en la visita.",
          cubre: ["anotarCobroAction", "borrarCobroAction"],
          pasos: [
            "Abrí la pileta y bajá hasta **Cobros de esta visita**.",
            "Tocá **Cobré**.",
            "En “¿Cuánto te dieron?” escribí el monto en pesos (por ejemplo 15000 o 15.000). Si querés, dejá una nota.",
            "Tocá **Anotar cobro**.",
          ],
          resultado: "Aparece el aviso “Cobro anotado” y el cobro queda en la lista como “Falta entregárselo al dueño”. Para el cliente ya cuenta como pagado. Cuando le des la plata al dueño, él lo confirma y pasa a “Ya lo tiene el dueño”.",
          notas: [
            "Anotá solo lo que te dieron: no hace falta saber cuánto debe el cliente ni cuánto sale el service.",
            "Si te equivocaste, tocá el tacho (“Borrar cobro”) y anotalo de nuevo. Aparece el aviso “Cobro borrado”. Se puede mientras no se lo hayas entregado al dueño.",
            "Se anotan cobros de las visitas de hoy y de los últimos 7 días, como todo lo demás.",
          ],
        },
        {
          id: "otro-registro",
          titulo: "Sumar otro registro a una pileta ya hecha",
          cuando: "Cuando fueron dos a la misma pileta, o volviste a ponerle cloro más tarde.",
          cubre: ["registrarServiceAction"],
          pasos: [
            "Abrí la pileta y tocá **Agregar otro registro**.",
            "Completá el cloro y las observaciones y tocá **Guardar**.",
          ],
          resultado: "Aparece “Registro agregado” y el registro nuevo se suma en **Registros de esta visita**. Quien la cerró primero sigue figurando como quien la cerró.",
        },
        {
          id: "corregir",
          titulo: "Corregir un registro tuyo",
          cuando: "Cuando te equivocaste en el cloro o en las observaciones.",
          cubre: ["editarRegistroAction"],
          pasos: [
            "Abrí la pileta desde la ruta de ese día (con **Día anterior** llegás hasta 7 días atrás).",
            "En **Registros de esta visita**, tocá el lápiz (**Editar registro**) de tu registro.",
            "Cambiá lo que haga falta y tocá **Guardar cambios**.",
          ],
          resultado: "Aparece “Registro actualizado” y el registro queda marcado como corregido.",
          notas: ["El dueño ve el historial completo de cada registro: qué se cargó, qué se cambió, quién y cuándo."],
        },
        {
          id: "borrar",
          titulo: "Borrar un registro tuyo",
          cuando: "Cuando cargaste un registro por error (por ejemplo, en la pileta equivocada).",
          cubre: ["borrarRegistroAction"],
          pasos: [
            "En **Registros de esta visita**, tocá el tacho (**Borrar registro**) de tu registro.",
            "Confirmá con **Sí, borrar** (o tocá **No** para dejarlo).",
          ],
          resultado: "Aparece “Registro borrado”. Si era el único registro, la pileta vuelve a pendiente.",
        },
        {
          id: "deshacer",
          titulo: "Corregir una pileta que no se pudo",
          cuando: "Cuando la marcaste salteada o “no estaba” y al final se hizo, o te equivocaste.",
          cubre: ["marcarPiletaAction"],
          pasos: [
            "Abrí la pileta.",
            "Si al final se hizo, tocá **Al final se hizo: registrar el service** y completá la ventana como siempre.",
            "Si querés dejarla como estaba, tocá **Volver a pendiente**.",
          ],
          resultado: "Con el registro queda hecha (“¡Pileta marcada como hecha!”). Con **Volver a pendiente** aparece “La pileta volvió a pendiente” y vuelven **Hecha** y **No se pudo**. En los dos casos la nota del motivo se borra.",
        },
      ],
      reglas: [
        "Una pileta puede tener varios registros (por ejemplo, si fueron dos). Quien la cierra primero figura como quien la cerró.",
        "Podés corregir o borrar solo tus registros, y solo de los últimos 7 días. Los de tus compañeros los ves pero no los podés cambiar. Pasado ese plazo, avisale al dueño.",
        "Una pileta hecha no se puede pasar a salteada: primero hay que borrar sus registros.",
      ],
      avisos: [
        { mensaje: "Registro agregado", solucion: "Se sumó tu registro a la pileta, que ya estaba hecha." },
        { mensaje: "Registro actualizado", solucion: "Se guardó la corrección." },
        { mensaje: "Registro borrado", solucion: "Se borró tu registro. Si era el único, la pileta volvió a pendiente." },
        { mensaje: "La pileta volvió a pendiente", solucion: "La pileta quedó como si no la hubieras marcado." },
        { mensaje: "Ese registro ya no se puede cambiar (es de otra persona o de hace más de 7 días)", solucion: "Solo podés corregir tus registros de la última semana. Avisale al dueño." },
        { mensaje: "Esta visita es de un día que todavía no llegó: la vas a poder marcar ese día.", solucion: "Abriste una pileta de un día futuro. Solo se puede mirar." },
        { mensaje: "Pasaron más de 7 días: esta visita ya no se puede cambiar desde la app.", solucion: "Si hay que corregir algo, avisale al dueño." },
      ],
      capturas: [
        { archivo: "pantalla", alt: "La pantalla de una pileta con los botones Hecha y No se pudo", ruta: "/employee/piletas/{itemHoy}", como: "employee" },
      ],
    },
  ],
}

export const TEMAS_EMPLEADO: Tema[] = [primerosPasos, hoy, siAlgoFalla, glosarioEmpleado]
