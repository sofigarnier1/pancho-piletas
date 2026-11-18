import type { Tema } from "./tipos"

// Lo ve todo el mundo (equipo, empleado y cliente): sirve igual en las tres zonas.
export const siAlgoFalla: Tema = {
  id: "si-algo-falla",
  titulo: "Si algo falla",
  grupo: "Ayuda",
  icono: "libro",
  resumen: "Qué hacer cuando aparece el cartel “Algo salió mal”: el error queda anotado solo y podés avisar por WhatsApp.",
  secciones: [
    {
      id: "algo-salio-mal",
      titulo: "El cartel “Algo salió mal”",
      rutas: [],
      resumen: "Si una pantalla se rompe, el sistema anota el error solo para que lo revisemos y te ofrece avisarnos por WhatsApp.",
      queVes: [
        "El título **Algo salió mal** y el **Código del error**, de 6 letras y números.",
        "El botón **Avisar por WhatsApp** y el botón **Reintentar**.",
      ],
      tareas: [
        {
          id: "avisar-por-whatsapp",
          titulo: "Avisar que algo falló",
          cuando: "Cuando aparece el cartel **Algo salió mal** o el aviso del mismo nombre arriba de la pantalla.",
          pasos: [
            "Tocá **Avisar por WhatsApp**: se abre WhatsApp con un mensaje ya escrito que incluye el código del error y la pantalla donde estabas.",
            "Mandá el mensaje sin cambiarlo.",
            "Si querés volver a probar, tocá **Reintentar**.",
          ],
          resultado: "Quien arregla el sistema busca ese código y ve qué pasó. No hace falta que le expliques nada más.",
          notas: [
            "El error ya queda anotado aunque no mandes el WhatsApp: el aviso es para que lo veamos más rápido.",
            "Se anota lo técnico del error, tu rol y qué pantalla era. No se guardan contraseñas ni datos de clientes.",
            "Si no hay internet, el error no se puede anotar: en ese caso el WhatsApp es la única forma de avisar.",
          ],
        },
      ],
      avisos: [
        {
          mensaje: "Ya quedó anotado (código ABC123).",
          solucion: "Es el aviso que aparece arriba cuando algo falla pero la pantalla sigue andando. Tocá **Avisar por WhatsApp** si querés que lo revisemos.",
        },
      ],
      faq: [
        { p: "¿Qué hago con el código del error?", r: "Nada: ya viaja en el mensaje de WhatsApp. Si lo mandás a mano, copialo tal cual." },
        { p: "¿Quién ve los errores anotados?", r: "Solo el dueño y el súper admin, que pueden consultarlos en la base de datos. Todavía no hay una pantalla para verlos." },
      ],
    },
  ],
}
