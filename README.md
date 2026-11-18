# Cloro y Piletas Pancho — Web Integral

> Proyecto hecho en equipo con otro desarrollador para un negocio real, todavía en desarrollo y sin publicar. **Por mi parte (Sofía Garnier)**, diseñé y desarrollé la landing, las pantallas del backoffice (diseñadas a partir de cómo trabaja el dueño, pensando en el día a día) y las tablas, consultas y migraciones de la base de datos. Los datos de este repositorio son todos de prueba.

Sistema web completo para el emprendimiento familiar de mantenimiento de piletas y venta de cloro en Zona Norte, Buenos Aires.

**Next.js 16** · **React 19** · **TypeScript** · **Supabase** · **Tailwind CSS v4** · **shadcn/ui**

---

## El Negocio

**Cloro y Piletas Pancho** opera dos líneas de negocio bajo la misma plataforma:

| Línea | Descripción |
|---|---|
| Venta de Cloro | E-commerce con pastillas, granulado, líquido y combos. Delivery en Zona Norte. Pago con MercadoPago. |
| Service de Piletas | Mantenimiento recurrente (~100 clientes): limpieza, barrefondo, aplicación de cloro y pintado. No incluye arreglos de pérdidas ni instalación de piletas plásticas. |

Ambas líneas comparten base de datos, autenticación y portal de clientes, pero tienen circuitos de stock separados: el cloro usado en services se registra pero no descuenta del stock de venta.

---

## Stack Técnico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 16.3.8 |
| UI Library | React | 19.2.4 |
| Lenguaje | TypeScript | ^5 |
| Estilos | Tailwind CSS | ^4 |
| Componentes | shadcn/ui + Radix UI | — |
| Íconos | lucide-react | ^1.8.0 |
| Animaciones | Framer Motion | ^12.38.0 |
| Formularios | React Hook Form + Zod | ^7 / ^4 |
| Estado global | Zustand | ^5 |
| Base de datos | Supabase (PostgreSQL + Auth + RLS) | ^2.105.1 |
| Notificaciones | Sonner | ^2 |
| Pagos | MercadoPago SDK | pendiente de credenciales |
| Calendario | Google Calendar API | pendiente de credenciales |
| Testing | Vitest (unitarios, base de datos, acciones) + Playwright (E2E, flujos) | ^5 / ^1.59 |
| Deploy | Vercel | pendiente |

---

## Funcionalidades por Módulo

### Landing Pública (`/`)
- Diseño V3 (octubre 2026, a partir de la demo `demo-v3/`): hero con video, catálogo, service, barrefondo interactivo, Mi cuenta, Nosotros, testimonios, preguntas frecuentes y cierre
- **Catálogo con los productos reales** de Stock: filtro por tipo, precio y disponibilidad
- **Consulta guiada** en 3 pasos (qué necesitás → zona y estado del agua → revisar): arma el mensaje y abre WhatsApp solo cuando la persona lo confirma. No guarda datos ni crea pedidos
- Textos, condiciones de entrega, testimonios y pie desde el CMS (sin deploy)
- Barra con sesión (Ingresar / Mi panel / Cerrar sesión) y botón flotante de WhatsApp
- Estilos propios con alcance `.lv3` (`src/components/landing/landing.css`), sin afectar al backoffice ni al portal

### Manual de usuario y ayuda en pantalla (`/admin/manual`, `/employee/ayuda`, `/client/ayuda`)
- Un manual por zona, escrito paso a paso para cada rol, con buscador, índice, capturas de pantalla y una versión "completa" para imprimir
- Botón **?** en cada pantalla (también la tecla `?`): abre la ayuda de esa pantalla sin salir de ella
- Cada rol ve solo su manual: marketing no ve Clientes, el empleado no ve el backoffice
- Los tests exigen que no quede ninguna pantalla, acción ni mensaje sin documentar; el contenido vive en `src/content/manual/`
- PDF por rol con `npm run manual:pdf` (se guardan en `docs/manual/`)

### Autenticación (`/login`, `/register`, `/recover`, `/reset-password`)
- Login y registro con email/contraseña
- Recuperación y reset de contraseña por email
- Guards automáticos por rol en el proxy de Next (`src/proxy.ts`); las cuentas bloqueadas pierden el acceso
- Redirección post-login según rol del usuario

### Backoffice Admin (`/admin/...`) — roles: `super_admin`, `owner`, `marketing`

Cada sección la ve solo el rol que corresponde (detalle completo en [docs/permisos-por-rol.md](docs/permisos-por-rol.md)).

| Sección | Quién | Funcionalidad |
|---|---|---|
| Dashboard | los tres | Clientes activos, piletas del día, ventas del mes |
| Clientes | dueño | Alta, búsqueda, detalle y cambio de estado (activo / inactivo / bloqueado); **Precios** de cada cliente (service, desagote y cloro, con fecha desde la que rige) |
| Cobros | dueño | Deuda por cliente (lo hecho con el precio de cada día − lo pagado), lo que cobraron los empleados sin entregar (**Confirmar**), cargar pagos, detalle por cliente y Excel |
| Piletas | dueño | Alta, detalle y activar/desactivar por pileta; frecuencia (semanal, quincenal, mensual) y ubicación en el mapa |
| Itinerario | dueño | Vista mensual + detalle por día: agregar, quitar y reordenar piletas, "Copiar semana anterior", recordatorio de lo que quedó sin hacer y **Sugerir** (sin IA); botón **Modo campo** para usar la pantalla del empleado |
| Stock | dueño (marketing solo mira) | Alta de productos, ajuste manual de stock, activar/desactivar producto |
| Ventas | dueño | Ventas manuales (WhatsApp) en una transacción, con aviso si se vende más que el stock + historial |
| Puntos | marketing | Reglas de acumulación, niveles (Bronce/Plata/Oro), asignación manual |
| Landing CMS | marketing | Editor de las secciones de la landing |
| Roles | súper admin | Asignación de rol a cualquier usuario (nunca el propio) |

### App Empleado (`/employee/...`) — rol: `employee` (y el dueño con **Modo campo**)
- Vista mobile-first de la ruta del día (la de su auto), hoy y hasta 7 días atrás (sin días futuros, calendario ni historial)
- **Cobré**: anota solo el monto que le dio el cliente (no ve precios ni deudas)
- Marcar pileta como: hecha, salteada, sin cliente, o volverla a pendiente (visitas de los **últimos 7 días**)
- "Hecha" se da únicamente registrando el service: cloro opcional en su unidad (litros, gramos o pastillas de a media) + observaciones; el tipo (service o desagote) sale del itinerario
- Varios registros por visita; cada uno corrige o borra los suyos de los últimos 7 días (el dueño ve el historial de cambios)

### Portal Cliente (`/client/...`) — rol: `client`
- Dashboard con puntos actuales, nivel y progreso al siguiente nivel
- Historial de compras de cloro (online + manuales)
- Servicios contratados / historial de visitas
- Transacciones de puntos detalladas

---

## Arquitectura de Roles

El sistema tiene 5 niveles de rol, asignados en Supabase y verificados en el proxy, en cada server action y en RLS.

| Rol | Quién | Acceso |
|---|---|---|
| `super_admin` | Desarrollador | Total — configuración técnica, roles, todo |
| `owner` | Pancho | Itinerario, clientes, piletas, ventas, stock, registros de service |
| `marketing` | Gerente de marketing | CMS de landing, reglas de puntos, niveles, asignar puntos. No toca el itinerario ni el historial de service |
| `employee` | Empleados del service | Itinerario del día, marcar trabajo, historial |
| `client` | Clientes finales | Compras, puntos, servicios propios |

Los usuarios se registran con rol `client` por defecto. El `super_admin` puede cambiar roles desde `/admin/roles`.

La tabla completa de qué puede hacer cada rol, con sus límites, está en [docs/permisos-por-rol.md](docs/permisos-por-rol.md).

---

## Base de Datos — Esquema

33 migraciones SQL, todas probadas en una base local de prueba (recordatorio de visitas sin reprogramar, precios por cliente, cobros y deuda, frecuencia y ubicación de las piletas). RLS habilitado en todas las tablas.

| Migración | Tablas principales |
|---|---|
| 01 — Roles y perfiles | `profiles` (1:1 auth.users), enum `user_role` |
| 02 — Clientes y piletas | `client_profiles`, `employee_profiles`, `pools` |
| 03 — Itinerario y service | `itinerary_days`, `itinerary_items`, `service_logs` |
| 04 — Productos y stock | `products` (pastilla, granulado, líquido, combo) |
| 05 — Ventas e-commerce | `orders`, `order_items` (integración MercadoPago) |
| 06 — Ventas manuales | `manual_sales`, `manual_sale_items` |
| 07 — Sistema de puntos | `client_levels`, `point_rules`, `point_transactions` |
| 08 — Landing CMS | `landing_content` (hero, service, nosotros, testimonios, footer, config) |
| 09 — RLS | Políticas de seguridad por rol en todas las tablas |
| 10 — Security hardening | Guardianes de columnas sensibles, `adjust_stock()`, políticas de empleados |
| 11 — Alcance del empleado | El empleado solo ve las piletas y clientes de sus itinerarios |
| 12 / 13 — Landing | Sincronización de textos y `updated_at` de `landing_content` |
| 14 — Service único | Un solo `service_log` por visita (índice único + guardián con bloqueo de fila) |
| 15 — Cuentas bloqueadas | `blocked` niega el acceso (políticas restrictivas + cierre de sesiones); `get_my_role()` lee de `profiles` |
| 16 — Ventas atómicas | `crear_venta_manual()` y `stock_shortfall` (faltante de stock registrado) |
| 17 — Equipo rojo | Cierra los 6 hallazgos de la ronda de seguridad del 19/10 |
| 18 — Landing V3 | Textos del hero, Nosotros y la sección service del diseño nuevo (solo filas que marketing no editó) |

### Notas de diseño de DB
- `itinerary_items.assigned_employee_id` es nullable: `null` = todos los empleados, con valor = empleado específico (futuro)
- `service_logs` registra cloro (tipo + cantidad) pero no afecta `products.stock_units`
- `orders` descuenta stock **una sola vez** al llegar a `paid` o más allá (trigger; `stock_deducted_at`), lo repone si se cancela y sus estados no retroceden
- Un pedido insertado ya como `paid` no descuenta: el flujo correcto (webhook) es crearlo `pending` y pasarlo a `paid`
- `manual_sale_items` descuenta stock al insertarse (trigger) sin bajar de 0; lo que faltó queda en `stock_shortfall`
- El rol se lee de `profiles` (no del JWT): un cambio de rol rige en la siguiente consulta
- `profiles.status = 'blocked'` niega el acceso a todas las tablas privadas; `inactive` no bloquea
- `point_transactions` actualiza `profiles.points_balance` y `client_level_id` automáticamente (trigger); los puntos manuales van de −100.000 a +100.000, solo a clientes, y la base registra quién los dio
- `manual_sales`: solo a clientes, fecha entre hace 1 año y mañana, y el total es siempre la suma de los ítems (no se edita después)
- El empleado solo marca y corrige visitas de los últimos 7 días (hora de Argentina), nunca futuras; quién y cuándo cerró lo fija la base
- Marketing no escribe el itinerario ni ve `service_logs`

---

## Estructura del Proyecto

```
src/
├── app/
│   ├── (auth)/              # Login, register, recover, reset-password
│   ├── admin/               # Backoffice (dashboard, clientes, piletas,
│   │                        # itinerario, stock, ventas, puntos, roles, landing-cms)
│   ├── employee/            # App empleado (itinerario, piletas, historial)
│   ├── client/              # Portal cliente (dashboard, compras, puntos, servicios)
│   ├── api/auth/callback/   # OAuth callback Supabase
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Landing pública
│
├── content/manual/          # El manual de usuario: un archivo por tema y por zona
│
├── components/
│   ├── manual/              # Portada, temas, buscador, impresión y el botón "?" de ayuda
│   ├── ui/                  # Componentes shadcn/ui (button, card, input, select...)
│   ├── landing/             # La landing (diseño V3): secciones, consulta guiada y sus estilos con alcance .lv3
│   ├── layout/              # AdminSidebar, AdminTopbar, PortalHeader (empleado y cliente)
│   ├── auth/                # AuthBootstrap
│   └── WhatsAppFAB.tsx      # Botón flotante WhatsApp
│
├── lib/
│   ├── landing/             # Consulta guiada (mensaje de WhatsApp) e imágenes permitidas
│   ├── supabase/            # Clientes (browser/server), middleware helpers, queries landing
│   ├── manual/              # Qué manual y qué sección toca a cada pantalla y rol, y los tests del manual
│   ├── auth/require-role.ts # Validación de sesión, rol y cuenta bloqueada en cada server action
│   ├── security-headers.ts  # Cabeceras de seguridad (las aplica next.config.ts)
│   ├── dates.ts             # Fechas en hora de Argentina
│   └── utils.ts             # Utilidades generales
│
├── state/
│   └── auth.store.ts        # Zustand store de autenticación
│
└── proxy.ts                  # Guards de rutas por rol y cuentas bloqueadas

supabase/migrations/          # 33 migraciones SQL (no se editan las ya aplicadas: se crea una nueva)
tests/                        # Vitest contra Supabase local: db/ (RLS, triggers, guardianes) y actions/
e2e/                          # Playwright: páginas, flujos de punta a punta, calidad, visual, smoke
docs/                         # Documentación (ver abajo)
```

---

## Variables de Entorno

Crear `.env.local` en la raíz del proyecto con:

```env
# Supabase (requerido)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=

# MercadoPago (requerido para e-commerce — pendiente de credenciales de Pancho)
MP_ACCESS_TOKEN=
NEXT_PUBLIC_MP_PUBLIC_KEY=

# Google Calendar (requerido para sincronización — pendiente de credenciales de Pancho)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
GOOGLE_CALENDAR_ID=
GOOGLE_REFRESH_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WA_NUMBER=5491100000000

```

Los tests **no usan `.env.local` ni la base real**: levantan su propio Supabase local con Docker y leen sus claves solas (ver "Tests").

---

## Correr Localmente

**Requisitos:** Node.js 22+ y Docker (para la base de prueba local, sin cuenta de Supabase).

```bash
git clone https://github.com/sofigarnier1/pancho-piletas.git
cd pancho-piletas
npm install

# Base de prueba local (Supabase en Docker): aplica las 33 migraciones
npx supabase start

# Copiar a .env.local la URL y las claves que imprime `npx supabase status -o env`:
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
cp .env.example .env.local

# Usuarios de prueba (uno por rol) y datos de ejemplo ficticios
node --env-file=.env.local scripts/seed-test-users.mjs
docker exec -i supabase_db_pancho-test psql -U postgres -v ON_ERROR_STOP=1 -q < scripts/local/demo-cargar.sql

npm run dev
```

Abrir `http://localhost:3000`. El backoffice está en `/login` con los usuarios de `scripts/seed-test-users.mjs` (todos de prueba, solo para la base local).

Las imágenes que se sirven desde el storage de Supabase (`PROJECT_REF` en `next.config.ts` y `src/lib/landing/imagenes.ts`) hay que subirlas a tu propio proyecto o reemplazarlas.

---

## Estado del Proyecto

| Fase | Descripción | Estado |
|---|---|---|
| Setup | Next.js, Supabase, shadcn/ui, Zustand, Zod, Sonner | Completo |
| DB | 33 migraciones SQL; la 30 a 33 faltan aplicarlas en producción | Casi completo |
| Auth | Login/register/recover/reset-password, guards (proxy), cuentas bloqueadas | Completo |
| Landing | Diseño V3: catálogo real, consulta guiada a WhatsApp, service, Mi cuenta, textos desde CMS | Completo |
| Backoffice (Fase 4) | Dashboard, clientes, piletas, itinerario, ventas, stock, roles | Completo |
| App Empleado (Fase 5) | Ruta del auto por día, marcar pileta, varios registros con cloro por unidad (editar/borrar 7 días); sin calendario ni historial (solo su día) | Completo |
| Google Calendar (Fase 6) | Sincronización bidireccional itinerario ↔ Calendar | Bloqueado — necesita credenciales OAuth de Pancho |
| E-commerce MercadoPago (Fase 7) | Carrito, checkout, pago online | Bloqueado — necesita cuenta vendedor MP de Pancho |
| Portal Cliente (Fase 8) | Dashboard puntos/nivel, compras, servicios | Completo |
| CMS Landing (Fase 9) | Editor admin por secciones, reglas de puntos, niveles | Completo |
| Seguridad | Primera ronda de equipo rojo (19/10): 6 hallazgos, todos cerrados | Completo — repetir al sumar MercadoPago |
| Deploy | Vercel | Pendiente |

### Pendiente de Pancho (no técnico)
- Precios finales de los productos de cloro
- Zonas específicas de Zona Norte donde trabaja
- Fotos de trabajos anteriores para la landing
- Info del equipo para sección "Nosotros"
- Logo en SVG/PNG de alta calidad
- Dominio final del sitio
- Cuenta Google del negocio (para Fase 6)
- Cuenta vendedor MercadoPago (para Fase 7)

---

## Identidad Visual

| | |
|---|---|
| Color principal | `#1B5FA8` (azul) |
| Color fondos dark | `#0F3D6E` (azul oscuro) |
| Acento | `#4A9FD4` (azul claro) |
| Fondo claro | `#F0F7FF` |
| Blanco | `#FFFFFF` |
| Fuente | Comfortaa (títulos) + Inter (texto), Google Fonts |

---

## Tests

Son ~1.500 pruebas en cuatro capas. Todas corren contra un **Supabase local** (Docker), nunca contra producción:

```bash
npm run db:test:start      # una vez: levanta Supabase local (necesita Docker)

npm run test:unit          # unitarios (Vitest): fechas, validadores, redirecciones, cabeceras
npm run test:db            # base de datos y acciones del servidor, con sesión real por rol
npm run test:e2e           # páginas, seguridad, calidad móvil y accesibilidad (Playwright)
npm run test:flows         # flujos de punta a punta por la interfaz
npm run test:coverage      # inventario: cada acción, página, tabla y trigger tiene test que lo nombra
npm run test:all           # todo lo anterior, en orden (comparten la base: nunca en paralelo)
```

Los tests del manual (`src/lib/manual/`) corren con los unitarios. El manual en pantalla se prueba en `e2e/manual-ayuda.spec.ts`.

Cada corrida resetea la base local y la siembra con datos fijos (`e2e/support/seed.ts`). Extras: `manual:capturas` y `manual:pdf` (fotos y PDF del manual de usuario), `test:smoke` (solo lecturas, apto para producción tras un deploy), `test:visual` (capturas, solo macOS) y `test:accion-por-accion` (un test por acción con tablero en vivo).

`docs/test-coverage.md` es un **inventario por nombres, no una medida de cobertura real**: dice "nada sin nombrar", no "todo verificado".

---

## Documentación

| Archivo | Contenido |
|---|---|
| [docs/permisos-por-rol.md](docs/permisos-por-rol.md) | Qué puede hacer cada rol y con qué límites |
| `docs/manual/*.pdf` | El manual de usuario de cada rol en PDF (se generan con `npm run manual:pdf`; no se versionan) |
| [docs/test-coverage.md](docs/test-coverage.md) | Inventario de tests (se regenera con `npm run test:coverage`) |
