import type { Tema } from "./tipos"
import { glosarioCliente } from "./glosario"
import { siAlgoFalla } from "./si-algo-falla"

// Manual del cliente: el portal de /client.
const primerosPasos: Tema = {
  id: "primeros-pasos",
  titulo: "Primeros pasos",
  grupo: "Primeros pasos",
  icono: "cohete",
  resumen: "Cómo entrar a tu portal, recuperar la contraseña y moverte por las pantallas.",
  relacionados: ["inicio", "glosario"],
  secciones: [
    {
      id: "ingresar",
      titulo: "Ingresar a tu portal",
      rutas: ["/login"],
      resumen: "Con tu email y tu contraseña entrás a tu portal, donde ves tus compras, tus servicios y tus puntos.",
      queVes: [
        "El título **Iniciar sesión** y los campos **Email** y **Contraseña**.",
        "El enlace **¿Olvidaste tu contraseña?** y el botón **Ingresar**.",
        "Abajo, el botón **Instalar app**.",
      ],
      tareas: [
        {
          id: "entrar",
          titulo: "Entrar a tu portal",
          pasos: [
            "Abrí la web y tocá **Ingresar**.",
            "Escribí tu **Email** y tu **Contraseña** y tocá **Ingresar**.",
          ],
          resultado: "Entrás a tu **Inicio**.",
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
          pasos: ["En el menú de arriba, tocá el botón de la flechita de salida (**Cerrar sesión**)."],
          resultado: "Aparece “Sesión cerrada” y salís del portal.",
        },
      ],
      avisos: [
        { mensaje: "Email o contraseña incorrectos", solucion: "Revisá el email y la contraseña. Si no la recordás, tocá **¿Olvidaste tu contraseña?**." },
        { mensaje: "Tu cuenta está bloqueada. Contactá a Pancho.", solucion: "Tu cuenta fue bloqueada y no podés entrar. Hablá con Pancho." },
        { mensaje: "Error inesperado. Intentá de nuevo.", solucion: "Falló la conexión. Probá de nuevo en unos segundos." },
      ],
    },
    {
      id: "contrasena",
      titulo: "Recuperar la contraseña",
      rutas: ["/recover", "/reset-password"],
      resumen: "Si te olvidaste la contraseña, te mandamos un enlace por email para que elijas una nueva.",
      queVes: [
        "**Recuperar contraseña**: el campo **Email** y los botones **Enviar link** y **Volver**.",
        "Después, **Revisá tu email**, y al abrir el enlace, **Nueva contraseña**, **Confirmar contraseña** y **Actualizar contraseña**.",
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
      titulo: "Moverte por tu portal",
      rutas: [],
      resumen: "El menú de arriba te lleva a las cuatro pantallas de tu portal.",
      queVes: [
        "Arriba, el logo de **Piletas Pancho** (te lleva a tu panel), los botones **Inicio**, **Compras**, **Servicios** y **Puntos**, el botón **?** de ayuda y **Cerrar sesión**.",
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
      rutas: ["/client/ayuda", "/client/ayuda/[tema]"],
      resumen: "La guía completa de tu portal. Se abre desde el botón **?** de cualquier pantalla.",
      queVes: ["La caja **Buscar en el manual**, los temas en tarjetas y, adentro de cada tema, el botón **Imprimir este tema**."],
      tareas: [
        {
          id: "buscar",
          titulo: "Buscar algo en el manual",
          pasos: ["Escribí una palabra en **Buscar en el manual**, por ejemplo `puntos`.", "Tocá el resultado para ir a esa parte."],
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
        { mensaje: "No tenés permisos para esta acción", solucion: "Tu cuenta no puede hacer eso." },
        { mensaje: "Tu cuenta está bloqueada. Contactá a Pancho.", solucion: "Hablá con Pancho para que te habilite." },
        { mensaje: "Sesión cerrada", solucion: "Confirma que saliste. No hay nada que hacer." },
      ],
    },
  ],
}

const inicio: Tema = {
  id: "inicio",
  titulo: "Inicio",
  grupo: "Tu portal",
  icono: "dashboard",
  resumen: "Tus puntos, tu nivel y los accesos a tus compras, tus servicios y tus movimientos de puntos.",
  relacionados: ["puntos", "compras", "servicios"],
  secciones: [
    {
      id: "inicio",
      titulo: "Tu pantalla de inicio",
      rutas: ["/client/dashboard"],
      resumen: "Es lo primero que ves al entrar: cuántos puntos tenés, en qué nivel estás y cuánto te falta para el siguiente.",
      queVes: [
        "El saludo con tu nombre (“Hola, …”).",
        "La tarjeta **Mis puntos**: tu saldo, tu nivel, el **Próximo nivel** con cuántos puntos te faltan y una barra de avance. Si ya estás en el nivel más alto, ves “¡Estás en el nivel máximo!”.",
        "**Beneficios de tu nivel**: lo que te corresponde por estar en ese nivel.",
        "Tres accesos: **Mis compras**, **Mis servicios** y **Mis puntos**.",
      ],
      tareas: [
        {
          id: "leer",
          titulo: "Ver tu nivel y cuánto te falta",
          pasos: [
            "Mirá el número grande de **Mis puntos**: es tu saldo actual.",
            "El nombre de tu nivel está arriba a la derecha de la tarjeta.",
            "Debajo ves cuántos puntos te faltan para el **Próximo nivel**, con la barra de avance.",
            "Tocá **Mis compras**, **Mis servicios** o **Mis puntos** para ver el detalle.",
          ],
          captura: "inicio",
        },
      ],
      avisos: [
        { mensaje: "¡Estás en el nivel máximo!", solucion: "Ya alcanzaste el nivel más alto. No hay un nivel siguiente." },
      ],
      capturas: [{ archivo: "inicio", alt: "La pantalla de inicio del portal con los puntos y el nivel", ruta: "/client/dashboard", como: "client" }],
    },
  ],
}

const compras: Tema = {
  id: "compras",
  titulo: "Mis compras",
  grupo: "Tu portal",
  icono: "compras",
  resumen: "El historial de lo que compraste, con lo que llevaste, el importe y el estado.",
  relacionados: ["inicio", "glosario"],
  secciones: [
    {
      id: "lista",
      titulo: "Tu historial de compras",
      rutas: ["/client/compras"],
      resumen: "Todas tus compras, de la más reciente a la más antigua. Hoy son las que acordás con Pancho por WhatsApp y que él carga en el sistema.",
      queVes: [
        "El título **Mis compras** y cuántas compras hiciste en total.",
        "Una tarjeta por compra: la fecha, lo que llevaste (por ejemplo “2× Pastillas”), las notas, el importe y el estado.",
        "Las compras que acordaste por WhatsApp llevan la etiqueta **WhatsApp**.",
        "El estado puede ser **Pendiente**, **Pagado**, **Preparando**, **Enviado**, **Entregado** o **Cancelado**.",
      ],
      tareas: [
        {
          id: "revisar",
          titulo: "Revisar tus compras",
          pasos: [
            "Tocá **Compras** en el menú de arriba.",
            "Recorré la lista hacia abajo para ver las compras anteriores.",
          ],
          notas: [
            "Las compras por WhatsApp figuran como **Entregado**.",
            "La tienda online todavía no está habilitada; por ahora las compras las coordinás con Pancho por WhatsApp.",
            "Los pedidos cancelados no aparecen en la lista.",
          ],
          captura: "lista",
        },
      ],
      avisos: [
        { mensaje: "Sin compras registradas", solucion: "Todavía no tenés compras. Tus pedidos van a aparecer acá." },
      ],
      capturas: [{ archivo: "lista", alt: "El historial de compras del cliente", ruta: "/client/compras", como: "client" }],
    },
  ],
}

const servicios: Tema = {
  id: "servicios",
  titulo: "Mis servicios",
  grupo: "Tu portal",
  icono: "servicios",
  resumen: "El historial de mantenimiento de tu pileta: qué se hizo en cada visita y cuánto cloro se le puso.",
  relacionados: ["inicio", "glosario"],
  secciones: [
    {
      id: "lista",
      titulo: "Tu historial de servicios",
      rutas: ["/client/servicios"],
      resumen: "Cada visita que le hicimos a tu pileta en el último año, de la más reciente a la más antigua.",
      queVes: [
        "El título **Mis servicios** y cuántos services hay en el último año.",
        "Una tarjeta por visita: la pileta, el día, el tipo de visita (“Service”, que es la limpieza con barrefondo, o “Desagote”), el cloro aplicado (tipo y cantidad: líquido en litros, granulado en gramos, pastillas por cantidad) y las observaciones del técnico.",
      ],
      tareas: [
        {
          id: "revisar",
          titulo: "Ver qué se le hizo a tu pileta",
          pasos: [
            "Tocá **Servicios** en el menú de arriba.",
            "Buscá la fecha de la visita y leé el tipo de visita y el cloro aplicado.",
          ],
          notas: ["Cada visita aparece en cuanto el técnico la marca como hecha."],
          captura: "lista",
        },
      ],
      avisos: [
        { mensaje: "Sin servicios registrados", solucion: "Todavía no hay visitas registradas para tu pileta. Los mantenimientos van a aparecer acá." },
      ],
      capturas: [{ archivo: "lista", alt: "El historial de servicios de la pileta del cliente", ruta: "/client/servicios", como: "client" }],
    },
  ],
}

const puntos: Tema = {
  id: "puntos",
  titulo: "Mis puntos",
  grupo: "Tu portal",
  icono: "puntos",
  resumen: "Tu saldo de puntos, los niveles del programa con sus beneficios y tus últimos movimientos.",
  relacionados: ["inicio", "glosario"],
  secciones: [
    {
      id: "saldo",
      titulo: "Tu saldo y tus movimientos",
      rutas: ["/client/puntos"],
      resumen: "Cuántos puntos tenés, qué niveles existen y cuáles ya alcanzaste, y el detalle de cada movimiento. Hoy los puntos los carga el equipo de Pancho.",
      queVes: [
        "La tarjeta con tu **Saldo actual** y el nombre de tu nivel.",
        "El bloque **Niveles**: cada nivel con sus puntos mínimos y sus beneficios. El tuyo lleva la marca **Tu nivel actual**.",
        "**Últimos movimientos**: cada vez que te cargaron o descontaron puntos, con el motivo, la fecha y la cantidad (en verde si suma, en rojo si resta).",
      ],
      tareas: [
        {
          id: "ver",
          titulo: "Ver tus puntos y de dónde vienen",
          pasos: [
            "Tocá **Puntos** en el menú de arriba.",
            "Mirá tu **Saldo actual** y, más abajo, en **Niveles**, qué te falta para subir.",
            "En **Últimos movimientos** ves el origen de cada movimiento: compra online, compra por WhatsApp, service de pileta, bonus manual o ajuste.",
          ],
          notas: ["Se muestran tus 50 últimos movimientos."],
          captura: "saldo",
        },
      ],
      avisos: [
        { mensaje: "Aún no tenés movimientos de puntos", solucion: "Todavía no te cargaron puntos. Cuando te los carguen, van a aparecer acá con el motivo." },
      ],
      capturas: [{ archivo: "saldo", alt: "Tu saldo de puntos, los niveles y tus últimos movimientos", ruta: "/client/puntos", como: "client" }],
    },
  ],
}

export const TEMAS_CLIENTE: Tema[] = [primerosPasos, inicio, compras, servicios, puntos, siAlgoFalla, glosarioCliente]
