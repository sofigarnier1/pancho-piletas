import type { Tema } from "./tipos"

// Manual del equipo (super admin, dueño y marketing). Cada sección documenta una pantalla o una regla general.
export const primerosPasos: Tema = {
  id: "primeros-pasos",
  titulo: "Primeros pasos",
  grupo: "Primeros pasos",
  icono: "cohete",
  resumen: "Cómo entrar al sistema, recuperar la contraseña, moverte por el menú según tu rol y usar este manual.",
  relacionados: ["glosario"],
  secciones: [
    {
      id: "ingresar",
      titulo: "Ingresar al sistema",
      rutas: ["/login"],
      resumen: "La pantalla de entrada. Con tu email y tu contraseña el sistema te lleva solo a tu panel, según tu rol.",
      queVes: [
        "El título **Iniciar sesión** y los campos **Email** y **Contraseña**.",
        "El enlace **¿Olvidaste tu contraseña?** y el botón **Ingresar**.",
      ],
      tareas: [
        {
          id: "entrar",
          titulo: "Entrar al sistema",
          cuando: "Cada vez que abrís el sistema y no tenés la sesión iniciada.",
          pasos: [
            "Abrí la web y tocá **Ingresar** en el menú de arriba.",
            "Escribí tu **Email** y tu **Contraseña**.",
            "Tocá **Ingresar**.",
          ],
          resultado: "El sistema te lleva a tu panel: el equipo (dueño, marketing y súper admin) al **Dashboard**; el empleado, a su itinerario; el cliente, a su portal.",
          notas: ["Si ya tenés la sesión abierta y volvés a la pantalla de ingreso, el sistema te manda directo a tu panel."],
        },
        {
          id: "cerrar-sesion",
          titulo: "Cerrar la sesión",
          cuando: "Cuando terminás de trabajar, sobre todo si usás una computadora compartida.",
          pasos: ["En el menú de la izquierda, abajo de todo, tocá **Cerrar sesión**."],
          resultado: "Aparece el aviso “Sesión cerrada” y volvés a la pantalla de ingreso.",
        },
      ],
      campos: [
        { nombre: "Email", obligatorio: true, descripcion: "El email con el que se creó tu cuenta. Tiene que ser una dirección válida." },
        { nombre: "Contraseña", obligatorio: true, descripcion: "Mínimo 6 caracteres. Si no la recordás, usá **¿Olvidaste tu contraseña?**." },
      ],
      avisos: [
        { mensaje: "Email o contraseña incorrectos", solucion: "Revisá que el email esté bien escrito y que la contraseña sea la correcta. Si no la recordás, tocá **¿Olvidaste tu contraseña?**." },
        { mensaje: "Tu cuenta está bloqueada. Contactá a Pancho.", solucion: "Tu cuenta fue bloqueada por el dueño y no podés entrar ni operar. Hablá con él para que la vuelva a habilitar." },
        { mensaje: "Email inválido", solucion: "Falta la arroba o el dominio. Escribilo completo, por ejemplo `nombre@correo.com`." },
        { mensaje: "Mínimo 6 caracteres", solucion: "La contraseña es demasiado corta: tiene que tener al menos 6 caracteres." },
        { mensaje: "El acceso de los clientes a la web todavía no está habilitado. Consultanos por WhatsApp.", solucion: "La cuenta tiene rol cliente. Si es alguien del equipo, el súper admin le tiene que cambiar el rol desde **Roles**." },
        { mensaje: "Error inesperado. Intentá de nuevo.", solucion: "Falló la conexión o el servidor. Esperá unos segundos y probá otra vez; si sigue, avisale al súper admin." },
      ],
      faq: [
        { p: "¿Cómo le doy acceso a un empleado o a alguien de marketing?", r: "Por ahora nadie puede crearse una cuenta solo: el súper admin la crea. Después le cambia el rol desde **Roles**. Hasta entonces entra como cliente." },
      ],
    },
    {
      id: "contrasena",
      titulo: "Recuperar la contraseña",
      rutas: ["/recover", "/reset-password"],
      resumen: "Si te olvidaste la contraseña, el sistema te manda por email un enlace para elegir una nueva. Son dos pantallas: primero pedís el enlace y después, desde el mail, elegís la contraseña.",
      queVes: [
        "En la primera pantalla: el título **Recuperar contraseña**, el campo **Email** y los botones **Enviar link** y **Volver**.",
        "Cuando se envía, el título **Revisá tu email** y el botón **Volver al inicio de sesión**.",
        "En la segunda (la que abre el enlace del mail): el título **Nueva contraseña**, los campos **Nueva contraseña** y **Confirmar contraseña** y el botón **Actualizar contraseña**.",
      ],
      tareas: [
        {
          id: "recuperar",
          titulo: "Elegir una contraseña nueva",
          cuando: "Cuando no recordás la contraseña, o cuando te crearon la cuenta y todavía no elegiste una.",
          pasos: [
            "En la pantalla de ingreso, tocá **¿Olvidaste tu contraseña?**.",
            "Escribí tu **Email** y tocá **Enviar link**.",
            "Abrí tu correo (mirá también la carpeta de no deseados) y tocá el enlace que te mandamos.",
            "Escribí la **Nueva contraseña** y repetila en **Confirmar contraseña**.",
            "Tocá **Actualizar contraseña**.",
          ],
          cubre: ["GET /api/auth/callback"],
          resultado: "Aparece “Contraseña actualizada correctamente” y volvés a la pantalla de ingreso para entrar con la nueva.",
          notas: [
            "Por seguridad, el sistema nunca dice si un email está registrado o no: siempre responde que, si lo está, se envió el enlace.",
            "Cuando el dueño te crea una cuenta, no te asigna contraseña: la elegís vos con este mismo procedimiento.",
          ],
        },
      ],
      avisos: [
        { mensaje: "Las contraseñas no coinciden", solucion: "Lo que escribiste en **Confirmar contraseña** es distinto de la **Nueva contraseña**. Escribilas de nuevo, iguales." },
        { mensaje: "Mínimo 6 caracteres", solucion: "La nueva contraseña tiene que tener al menos 6 caracteres." },
        { mensaje: "Error inesperado. Intentá de nuevo.", solucion: "Probá otra vez en unos segundos. Si el enlace del mail venció, pedí uno nuevo desde **Enviar link**." },
      ],
    },
    {
      id: "menu-y-roles",
      titulo: "Tu menú según tu rol",
      rutas: [],
      resumen: "El menú de la izquierda muestra solo lo que tu rol puede usar. Si una sección no aparece, tu rol no tiene acceso a ella.",
      queVes: [
        "Arriba, el logo de **Pancho** (tocalo para volver al **Dashboard**).",
        "En el medio, las secciones disponibles para vos, en dos grupos: **General** (la operación del día a día) y **Administración** (contenido de la web, puntos, roles y **Manual**).",
        "Abajo, tu email, tu rol y **Cerrar sesión**.",
        "En la barra de arriba de cada pantalla, dónde estás (por ejemplo “Administración / Clientes”) y, a la derecha, el botón **?** de ayuda rápida.",
        "Antes de borrar, quitar, bloquear, desactivar o cambiar un rol, se abre una ventanita que explica qué va a pasar, con **Cancelar** y el botón de la acción (en rojo si borra o bloquea). Hasta que no lo confirmás, no cambia nada.",
      ],
      tareas: [
        {
          id: "moverse",
          titulo: "Moverte por el menú",
          pasos: [
            "Tocá una sección del menú de la izquierda para abrirla.",
            "La sección en la que estás queda resaltada en celeste, con un punto a la derecha.",
            "Tocá **Manual** cuando quieras leer esta guía completa, o el botón **?** para ver la ayuda de la pantalla donde estás.",
          ],
          notas: ["En el celular o en una pantalla angosta el menú queda escondido: tocá el botón **Abrir menú** (las tres rayas, arriba a la izquierda) y elegí la sección. El menú se cierra solo al elegir."],
        },
      ],
      reglas: [
        "**Dashboard**: lo ven el dueño, marketing y el súper admin.",
        "**Clientes**, **Piletas**, **Itinerario** y **Ventas**: el dueño y el súper admin.",
        "**Stock**: el dueño y el súper admin lo administran. Marketing lo puede mirar, pero no modificar.",
        "**Landing CMS** y **Puntos**: marketing y el súper admin.",
        "**Roles**: solo el súper admin.",
        "Aunque entres por una dirección que no figura en tu menú, el sistema no te deja hacer lo que tu rol no permite: te avisa “No tenés permisos para esta acción”.",
      ],
    },
    {
      id: "manual",
      titulo: "Este manual y la ayuda rápida",
      rutas: ["/admin/manual", "/admin/manual/[tema]"],
      resumen: "El manual explica cada pantalla paso a paso. Lo ves completo desde **Manual** o, sin salir de lo que estás haciendo, con el botón **?** de cada pantalla.",
      queVes: [
        "La caja **Buscar en el manual**, las tarjetas de cada tema y, al abrir un tema, el índice de la izquierda.",
        "Los botones **Imprimir este tema** y **Imprimir todo el manual**.",
      ],
      capturas: [{ archivo: "ayuda-rapida", alt: "El panel de ayuda rápida abierto sobre la lista de clientes", ruta: "/admin/clientes", como: "owner", abrir: ["Ayuda de esta pantalla"] }],
      tareas: [
        {
          id: "buscar",
          titulo: "Buscar algo en el manual",
          pasos: [
            "Tocá **Manual** en el menú de la izquierda.",
            "Escribí una o dos palabras en **Buscar en el manual**, por ejemplo `itinerario` o `stock`.",
            "Tocá el resultado para ir directo a esa parte. Para volver a las tarjetas, borrá la búsqueda con la **X**.",
          ],
          notas: ["La búsqueda no distingue mayúsculas ni tildes, y solo muestra lo que tu rol puede usar."],
        },
        {
          id: "ayuda-rapida",
          titulo: "Ver la ayuda de la pantalla donde estás",
          pasos: [
            "Tocá el botón **?** de la barra de arriba (o apretá la tecla `?` del teclado, siempre que no estés escribiendo en un campo).",
            "Se abre un panel con los pasos de esa pantalla y los avisos más comunes.",
            "Tocá **Ver en el manual completo** para ir a la explicación entera.",
          ],
          captura: "ayuda-rapida",
        },
        {
          id: "imprimir",
          titulo: "Imprimir o guardar el manual en PDF",
          pasos: [
            "Para un solo tema: abrilo y tocá **Imprimir este tema**.",
            "Para todo: en la portada tocá “Ver todo el manual en una sola página” y después **Imprimir todo el manual**.",
            "En la ventana de impresión elegí “Guardar como PDF”.",
          ],
        },
      ],
    },
    {
      id: "avisos-generales",
      titulo: "Avisos que pueden aparecer en cualquier pantalla",
      rutas: [],
      resumen: "Estos avisos no son de una pantalla en particular: pueden salir al intentar cualquier acción.",
      tareas: [],
      avisos: [
        { mensaje: "No autenticado", solucion: "Tu sesión se cerró o venció. Volvé a entrar desde **Ingresar**." },
        { mensaje: "No tenés permisos para esta acción", solucion: "Tu rol no puede hacer eso. Si creés que debería poder, pedíselo al súper admin." },
        { mensaje: "Tu cuenta está bloqueada. Contactá a Pancho.", solucion: "Tu cuenta fue bloqueada. Hablá con el dueño para que la habilite." },
        { mensaje: "Datos inválidos", solucion: "Algún dato llegó incompleto o con un formato raro (por ejemplo una fecha inexistente). Recargá la pantalla y volvé a intentar; si se repite, avisá al súper admin." },
        { mensaje: "Sesión cerrada", solucion: "Es la confirmación de que saliste del sistema. No hay nada que hacer." },
      ],
    },
  ],
}
