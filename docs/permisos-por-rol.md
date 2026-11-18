# Permisos por rol

Qué puede hacer cada rol, con qué límites y dónde se aplica cada regla. Actualizado el 2026-11-11 (migración 34: depósito de cloro, movimientos, venta rápida de mostrador y a granel, segmento de la venta, el cloro del service descuenta del depósito y reporte Cloro del mes; migraciones 19 a 29: catálogo de marketing con el stock del dueño, puntos de marketing con el dueño en solo lectura, nadie se crea una cuenta solo, autos/rutas/registros, Services, encargado, "No se pudo" y En vivo; 30 a 33: recordatorio de visitas sin reprogramar, precios por cliente, cobros y deuda, frecuencia y ubicación de las piletas).

> **Cómo leer esto.** Los permisos se aplican en tres capas, de la más débil a la más fuerte: el menú y las páginas (solo ocultan), `requireRole()` en cada acción del servidor (mensaje claro y corte temprano) y la **base de datos** (RLS + triggers: es la barrera real, no se puede saltear desde el navegador). Esta tabla sale de lo que la base exige y lo que los tests verifican (`tests/db/rls-matrix.test.ts`).

## Resumen

| | Cliente | Empleado | Marketing | Dueño | Súper admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Ve la landing | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ve sus compras, servicios y puntos (portal `/client`)⁴ | ✔ | | | | |
| Marca visitas y registra el service | | ✔ | | ✔² | ✔² |
| Edita el contenido de la web | | | ✔ | | ✔ |
| Reglas de puntos | | | ✔ | | ✔ |
| Niveles y asignar puntos | | | ✔ | ver¹ | ✔ |
| Clientes, piletas, itinerario | | | | ✔ | ✔ |
| Ventas manuales (Venta rápida, mostrador, granel) y reporte Cloro del mes¹⁰ | | | | ✔ | ✔ |
| Productos (crear, editar, precio, Hay/No hay, activar)⁶ | | | ✔ | ✔ | ✔ |
| Cantidad en stock, contenido de cloro y borrar productos | | | | ✔ | ✔ |
| Depósito de cloro: ver¹⁰ | | | ✔ | ✔ | ✔ |
| Depósito de cloro: cargar mercadería, conteo, merma, precio a granel y aviso; Movimientos¹⁰ | | | | ✔ | ✔ |
| Ver historial de service | su pileta | los suyos | | ✔ | ✔ |
| Trabajo del equipo y historial de cambios (`/admin/empleados`)³ | | | | ✔ | ✔ |
| Services y Desagotes del mes, notas del mes (`/admin/services`)⁵ | | | | ✔ | ✔ |
| Precios por cliente (ficha del cliente)⁷ | | | | ✔ | ✔ |
| Cobros y deuda (`/admin/cobros`)⁸ | | anota lo que cobró | | ✔ | ✔ |
| Modo campo: usar la pantalla del empleado (`/employee`)⁹ | | ✔ | | ✔ | ✔ |
| Cambiar roles | | | | | ✔ |

¹ El dueño ve **Puntos** (reglas y niveles) en solo lectura: sin formularios, interruptores ni **Asignar puntos**. La base se lo niega (`can_edit_points()`: super_admin y marketing).
² Desde la pantalla de la visita (`/admin/itinerario/visita/[id]`): cualquier fecha pasada (nunca futura), a nombre de cualquiera del equipo; también corrige y borra registros de otros. Todo queda en `service_log_history`.
³ Solo lectura: visitas, días y cloro por persona y mes, el detalle de sus registros, y el historial de altas, ediciones y borrados de los registros (`service_log_history`, lo escribe solo un trigger; RLS: owner o superior). También en cada visita ("Ver cambios", "Registros borrados").
⁴ Nadie se crea una cuenta solo: `/register` manda a `/login` y la landing no muestra "Mi cuenta" ni "Ingresar". Las cuentas las crea el súper admin (**Roles** → **Crear usuario**). Desde la ficha del cliente el dueño **no** le crea cuenta mientras `CLIENT_WEB_ACCESS` esté apagado (`src/lib/client-web.ts`; los tests e2e lo prenden). Un cliente con cuenta entra a su portal.
⁷ `client_prices` (migración 31): precio del service, del desagote y del cloro (por litro, kilo o pastilla) de cada cliente, desde una fecha (`valid_from`). Solo owner y super_admin leen y escriben (ni el cliente ve los suyos); solo para cuentas cliente; `created_by` lo fija la base. `precio_vigente(cliente, tipo, fecha)`. Marketing ve la ficha del cliente pero no el bloque Precios.
⁸ `payments` (migración 32). Deuda = visitas hechas × precio vigente ese día + cloro × su precio − pagos (`movimientos_cuenta`, `deuda_clientes`: solo owner y super_admin). El empleado anota **solo el monto** desde una visita suya de los últimos 7 días (**Cobré**): la base pone el cliente (titular de la pileta), la fecha (la de la visita), quién cobró y el estado `con_empleado`; solo lee los cobros que anotó él y puede borrarlos mientras sigan `con_empleado`. No ve precios ni deudas. El dueño confirma (`recibido`: la base pone quién y cuándo; no vuelve atrás) o carga pagos directos. Cliente y visita de un pago no se cambian. Marketing y el cliente no ven nada.
⁹ El dueño y el súper admin entran a `/employee` con **Modo campo** (botón del backoffice): ven su día con la misma regla que la base aplica al empleado (`src/lib/campo.ts`), registran a su nombre, y además se suben a un auto de hoy y se agregan piletas a su día (a su nombre).
⁵ Planillas de Services y de Desagotes (una fila por pileta y mes) y la Planilla semanal. La **nota del mes** (`pool_month_notes`, migración 27: una por pileta y mes, de 1 a 2000 caracteres) solo la ven y escriben el dueño y el súper admin; quién la escribió lo fija la base. Marketing, empleados y clientes no la ven.
¹⁰ Migración 34. `chlorine_stock`: un depósito por tipo (líquido en litros, granulado en kilos, pastillas); lo leen super_admin, owner y marketing; nadie lo escribe directo: solo `ingresar_stock`, `contar_cloro`, `sacar_merma` y `configurar_deposito` (owner/super_admin con la cuenta habilitada) y los triggers de venta, pedido y service. `stock_movements` (historial) lo lee solo owner/super_admin. El cloro que el empleado registra en un service descuenta del depósito (movimiento `service`) aunque el empleado no vea el depósito. `products.chlorine_content` (cuánto cloro trae una unidad) lo cambia solo el dueño: marketing recibe "Marketing no puede cambiar el contenido de cloro". `reporte_cloro` y `crear_venta_manual`: owner/super_admin. Una venta de mostrador no tiene cliente; el segmento (service / cloro / mostrador) lo fija la base.
⁶ `products.in_stock` (migración 10) es el **Hay / No hay** que muestra la landing; `stock_units` es el conteo interno. Las fotos se suben al bucket público `landing` (migración 11): suben super_admin, owner y marketing.

## Sin cuenta (público)
- Ve la landing: textos del CMS, catálogo de productos activos y combos, preguntas frecuentes, botón de WhatsApp.
- No puede crearse una cuenta: `/register` lo manda a `/login`. Quien tiene cuenta entra y recupera la contraseña.
- Puede leer en la base solo `landing_content`, `client_levels` y los productos activos. Todo lo demás está cerrado.

## Cliente (`client`)
**Pantallas:** Inicio (puntos, nivel y progreso al siguiente), Mis compras (online y manuales), Mis servicios (registros de las visitas a sus piletas), Mis puntos (movimientos).

- Solo ve **lo propio**: su perfil, sus piletas (las que tiene como titular y las compartidas donde figura como co-cliente), sus pedidos, sus ventas manuales, los registros de service de esas piletas y sus puntos. No ve nada de otro cliente (de una pileta compartida solo ve su propia fila de `pool_clients`, no a los demás clientes).
- Hoy (MVP) los clientes casi no usan la web: con `CLIENT_WEB_ACCESS` apagado el dueño no les crea cuenta desde la ficha (`enableClientAccessAction`). Si el súper admin le crea una, entra a su portal.
- No puede modificar rol, puntos, nivel ni estado de su cuenta, ni crear pedidos, ventas o puntos.
- Pendiente: comprar online (falta MercadoPago) y agendar un servicio.

## Empleado (`employee`)
**Pantallas (menú fijo abajo):** **Hoy** (la ruta del día con la tarjeta del auto y el avance de **sus** piletas más el total del auto, bloques "Te tocan a vos" / "Del equipo", marcar desde la lista y la ruta completa del auto en Google Maps), detalle de cada pileta con sus registros, y **Ayuda**. **Sin calendario ni historial** (pedido de Pancho, 2026-11-10: el empleado ve solo su día y el control lo tiene el dueño). Ve y marca hoy y hasta 7 días atrás; los días que vienen no se muestran (es la pantalla: la base todavía le deja leer las visitas de su auto de cualquier día).

- Para cada visita marca **Hecha** o **No se pudo** (salteada o no estaba), y puede volver una salteada o "no estaba" a pendiente.
- **Nota de "No se pudo"** (migración 28, `itinerary_items.status_note`, hasta 500 caracteres): el motivo que deja el empleado. Solo existe mientras la visita está salteada o "no estaba": si vuelve a pendiente o se registra el service, la base la borra. La ve el dueño (Dashboard, día, visita).
- **En vivo** (migración 29): las tablas `itinerary_items` y `service_logs` están publicadas para Supabase Realtime. Realtime aplica las mismas políticas (RLS) con la sesión de quien mira: el empleado recibe solo los cambios de lo que ya ve; el dueño, todo; cliente y anónimo, nada (comprobado). La pantalla se recarga sola al recibir un cambio.
- **Hecha** se da únicamente **registrando el service**: el cloro (opcional, en su unidad) y las observaciones. El tipo de visita (service o desagote) lo fija la base desde el itinerario.
- Un mismo envío del formulario repetido (doble toque, reintento) guarda **un solo** registro (`service_logs.request_id`).
- Ve el nombre de sus compañeros de auto y de quien hizo cada registro (función `team_names`: solo nombres, solo de gente del equipo).
- **Ve las visitas del auto en el que trabaja ese día** (equipos por día que arma el dueño). Las visitas que no tienen auto las siguen viendo todos (o solo la persona asignada).
- **Encargado de la visita** (migración 26, "Lo tiene que hacer X"): si la visita tiene encargado, todo el auto la ve ("Le toca a X"), pero **solo X** la registra o la marca (`employee_can_work_item`; si otro lo intenta, "Esta pileta le toca a otra persona: solo ella la puede marcar"). Si X no va en ese auto, la ve igual. El encargado tiene que ser empleado o dueño y no estar bloqueado (lo valida la base).
- **Solo visitas de los últimos 7 días** (hora de Argentina), nunca de días que todavía no llegaron.
- **Varios registros por visita** (puede ir un segundo empleado): quien la cierra primero figura como quien la cerró; los demás suman su registro. Un registro sobre una visita salteada la da por hecha; borrar el último registro la vuelve a pendiente.
- **Edita y borra sus propios registros de los últimos 7 días** (no los de otros), sin cambiar la visita, la pileta, la fecha ni quién lo hizo. Todo alta, cambio y borrado queda en el historial que ve el dueño.
- Puede corregir una visita salteada o "no estaba" (volverla a pendiente o cambiarla); una visita hecha se corrige editando o borrando sus registros.
- La fecha del registro (la de la visita) y quién/cuándo cerró **los fija la base**; no se pueden falsificar.
- No cambia el auto ni el tipo de una visita. No ve ventas, puntos ni datos de otros usuarios; de los clientes ve solo los de las piletas de su itinerario.
- **Cobré** (migración 32): en la visita anota cuánta plata le dio el cliente, sin ver precios ni deuda. Queda "con el empleado" hasta que el dueño confirma que la recibió; mientras tanto la puede borrar. Para el cliente ya cuenta como pagado.

**Registro de service (migraciones 22 y 23):** cada visita es **service** o **desagote** (se elige al planificar). El cloro es opcional: líquido en **litros** (hasta 500), granulado en **gramos** enteros (hasta 50.000), pastillas por **cantidad** de a media (hasta 100).

## Marketing (`marketing`)
**Menú:** Dashboard, Stock, Landing CMS, Puntos.

- **Contenido de la web:** edita los textos de cada sección. Las URLs que cargue se validan (solo http/https).
- **Puntos:** crea, activa y borra reglas; administra niveles; asigna puntos manualmente (con el súper admin, es el único: `can_edit_points()`).
  - Cada asignación va de **−100.000 a +100.000**, **solo a cuentas con rol cliente**, con origen `manual_grant`; quién la dio lo registra la base.
  - El historial de puntos no se modifica ni se borra.
- **Productos (migración 19, `marketing_crea_productos`):** crea productos (siempre con stock 0) y edita todo lo que se ve en la web (nombre, descripción, tipo, precio, unidad, peso, foto, etiqueta, destacado, orden, **Hay/No hay**); los activa o desactiva. **No** cambia la cantidad en stock (`guard_product_update`) ni borra: el stock lo ve en solo lectura.
- **Lo que ve:** el tablero, el catálogo, clientes (datos de cliente), pedidos y movimientos de puntos.
- **Lo que no ve ni toca:** ventas manuales, perfiles de empleados, historial de service. Del itinerario solo **lee** (el tablero cuenta las visitas del día); no lo escribe.

## Dueño (`owner`, Pancho)
**Menú:** Dashboard, Clientes y piletas, Itinerario, Services, Empleados, Ventas, Stock, Puntos.

- **Dashboard (el día de hoy):** cuántas visitas hay, hechas y faltan; botones **Registrar service** (registra una visita de hoy en una ventana), **Agendar pileta** (cualquier día y auto), **Armar el día** y **Nuevo cliente**; la tabla de las visitas de hoy y las que quedaron sin hacer en las últimas dos semanas. No se registran services sin itinerario. Marketing ve el resumen general.

- **Clientes:** alta junto con su pileta en un solo paso (pileta nueva, una que ya existe o ninguna; todo o nada, función `create_client_with_pool`), edición de nombre, N° de cliente, teléfono y notas, y cambio de estado (activo / inactivo / **bloqueado**: una cuenta bloqueada pierde el acceso al instante, aunque tenga la sesión abierta).
- **Piletas:** alta (la dirección es opcional), activar/desactivar y **clientes de la pileta**: sumar co-clientes (solo cuentas con rol cliente), quitarlos y cambiar el titular. El titular es `pools.client_id` y la base lo sincroniza con `pool_clients`; al titular no se lo quita (primero se elige otro). Marketing solo lee.
- **Itinerario:** carga los **autos** (`/admin/itinerario/autos`: nombre, patente, activar/desactivar; no se borran) y arma cada día: quién va en cada auto (una persona, un auto por día; empleados y dueño), en qué auto va cada visita (o sin auto = la ven todos) y si es **service o desagote**; agrega o quita piletas, ordena la ruta de cada auto, copia la semana anterior (con autos, tipos, encargados y equipos) y elige el **encargado** de cada visita (empleado o dueño). Es el único (con el súper admin) que escribe el itinerario, los autos y los equipos de cada día, y el único que ve el **historial de cambios** de los registros de service.
- **Registros de service:** también puede registrar visitas (de cualquier fecha pasada, nunca futura), a su nombre o al de alguien del equipo, y editarlos o borrarlos, desde la pantalla de la visita.
- **Services** (`/admin/services`): dos planillas tipo Excel, Services (por defecto) y Desagotes (`?tipo=desagote`): una fila por pileta con lo hecho en el mes, lo que quedó sin hacer, el cloro, las observaciones del equipo (solo lectura) y la **nota del mes**, que escribe y borra ahí mismo (`guardarNotaMesAction`). Se baja a Excel.
- **Planilla semanal** (`/admin/services/planilla`): una fila por pileta con N° y titular, dirección, marcas por semana y cloro, sin precios, imprimible. Solo lectura.
- **Clientes sin cuenta web:** puede dar de alta un cliente solo con el nombre (N° de cliente, teléfono y notas opcionales; la dirección y el barrio son de la pileta); si más adelante se le habilita el acceso, la cuenta usa el mismo id y conserva sus datos.
- **Ventas manuales (Venta rápida):**
  - A una cuenta con rol **cliente** o **de mostrador** (sin cuenta, nombre opcional de hasta 80 caracteres). Cloro a granel (litros, kilos o pastillas, con decimales) o productos; una línea inválida frena la venta.
  - El segmento (service, cloro o mostrador) lo fija la base al guardar. No hay ventas fiadas.
  - Fecha **entre hace 1 año y mañana**.
  - Total **de hasta 1e12 centavos**; el total **siempre es la suma de los ítems**.
  - Después de creada, no se editan cliente, vendedor ni total, y no se agregan ni quitan ítems (las notas sí).
  - Se puede vender más que el stock: queda en 0 y el faltante se registra y se avisa.
- **Stock:** crea y edita productos (también el precio y el contenido de cloro), ajusta cantidades, activa o desactiva y borra. Es el único (con el súper admin) que cambia la cantidad en stock.
- **Depósito de cloro (migración 34):** **Cargar mercadería** (a granel o por presentación, con costo y proveedor opcionales), conteo (ajusta la diferencia), merma (con motivo), precio a granel y aviso de stock bajo por tipo; ve **Movimientos** y el reporte **Cloro del mes**. El stock nunca queda negativo: si falta, queda en 0 y se anota el faltante.
- **Pedidos online:** puede avanzar su estado (hoy sin pantalla para eso; lo permite la base); el stock se descuenta **una sola vez** al llegar a pagado, se repone al cancelar, y los estados **no retroceden** (cancelado es final).
- **Puntos:** solo los mira (reglas y niveles).
- **No puede:** editar el contenido de la web, los puntos (reglas, niveles, asignación) ni los roles.

## Súper administrador (`super_admin`, desarrollador)
Todo lo del dueño y de marketing, más:
- **Cambiar roles** de cualquier usuario (nunca el propio). Es el único rol que puede.
- **Crear usuario** (nadie se crea una cuenta solo) y **Bloquear / Desbloquear** cuentas, desde **Roles**.
- Los mismos límites de datos que los demás (topes, fechas, totales): se aplican a todos los roles.

## Manual y ayuda
Cada rol tiene su manual (`/admin/manual`, `/employee/ayuda`, `/client/ayuda`) y un botón **?** con la ayuda de cada pantalla. Cada uno ve **solo** lo suyo: los temas siguen el mismo reparto de permisos de esta página, y nadie recibe la ayuda de una zona que no es la suya.

## Reglas que valen para todos
- `profiles.status = 'blocked'` niega el acceso a todas las tablas privadas; `inactive` no bloquea.
- El rol vive en `profiles.role` y la base lo lee de ahí (no de un token viejo): un cambio rige de inmediato.
- Las fechas de negocio son en hora de Argentina.
- Las funciones internas de la base (guardianes, descuento de stock) no las puede ejecutar ningún usuario.

## Dónde está cada cosa en el código
| Regla | Dónde |
|---|---|
| Acceso a rutas por rol | `src/proxy.ts` |
| Rol requerido por acción | `src/lib/auth/require-role.ts` y cada `actions.ts` |
| Políticas de acceso (RLS) | `supabase/migrations/…0009_rls.sql`, `…0010`, `…0011`, `…0015`, `…0017`, `…0019`, `…0020` |
| Matriz probada rol × tabla × operación | `tests/db/rls-matrix.test.ts` |
| Regresiones de seguridad | `tests/db/red-team.test.ts` |
