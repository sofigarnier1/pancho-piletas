# Cobertura de tests

_Generado por `npm run test:coverage` (2026-11-11). No editar a mano._

> **Esto es un inventario, no una medida de cobertura.** Verifica que cada acción, tabla y trigger aparezca *nombrado* en algún test; no demuestra que se prueben los casos de error, la concurrencia ni los permisos. "Sin huecos" significa "nada sin nombrar", no "todo verificado".

## Acciones del servidor

| Acción | Tests de la acción | ¿Tiene botón/formulario en la web? |
|---|---|---|
| `createClientAction` | actions/clientes-piletas, actions/integridad | sí |
| `updateClientAction` | actions/clientes-piletas | sí |
| `enableClientAccessAction` | actions/clientes-piletas | ⚠️ no (solo existe en el código) |
| `updateClientStatusAction` | actions/clientes-piletas, actions/integridad | sí |
| `guardarPrecioAction` | actions/precios | sí |
| `borrarPrecioAction` | actions/precios | sí |
| `confirmarCobroAction` | actions/cobros | sí |
| `confirmarCobrosDeAction` | actions/cobros | sí |
| `cargarPagoAction` | actions/cobros | sí |
| `borrarPagoAction` | actions/cobros | sí |
| `addPoolToItineraryAction` | actions/autos-itinerario, actions/itinerario | ⚠️ no (solo existe en el código) |
| `removeItemFromItineraryAction` | actions/itinerario | sí |
| `copyLastWeekAction` | actions/autos-itinerario, actions/itinerario | sí |
| `reorderItemAction` | actions/itinerario | ⚠️ no (solo existe en el código) |
| `reorderItineraryAction` | actions/itinerario | sí |
| `setItemVehicleAction` | actions/autos-itinerario | sí |
| `setItemServiceTypeAction` | actions/autos-itinerario | sí |
| `assignCrewAction` | actions/autos-itinerario | sí |
| `removeCrewAction` | actions/autos-itinerario | sí |
| `addPoolsToItineraryAction` | actions/itinerario | sí |
| `setItemAssigneeAction` | actions/itinerario | sí |
| `reprogramarPendienteAction` | actions/reprogramar | sí |
| `createVehicleAction` | actions/autos-itinerario | sí |
| `updateVehicleAction` | actions/autos-itinerario | sí |
| `setVehicleActiveAction` | actions/autos-itinerario | sí |
| `registrarVisitaDuenoAction` | actions/visita-dueno | sí |
| `editarRegistroDuenoAction` | actions/visita-dueno | sí |
| `borrarRegistroDuenoAction` | actions/visita-dueno | sí |
| `marcarVisitaDuenoAction` | actions/visita-dueno | sí |
| `saveSectionAction` | actions/cms-roles | sí |
| `createPoolAction` | actions/clientes-piletas | sí |
| `togglePoolActiveAction` | actions/clientes-piletas | sí |
| `addPoolClientAction` | actions/clientes-piletas | sí |
| `removePoolClientAction` | actions/clientes-piletas | sí |
| `setPoolPrimaryClientAction` | actions/clientes-piletas | sí |
| `updatePoolAction` | actions/clientes-piletas | sí |
| `setPoolFrequencyAction` | actions/piletas-ubicacion | sí |
| `ubicarPiletaAction` | actions/piletas-ubicacion | sí |
| `guardarUbicacionAction` | actions/piletas-ubicacion | sí |
| `createRuleAction` | actions/puntos | sí |
| `toggleRuleAction` | actions/puntos | sí |
| `deleteRuleAction` | actions/puntos | ⚠️ no (solo existe en el código) |
| `createLevelAction` | actions/puntos | sí |
| `updateLevelAction` | actions/puntos | sí |
| `deleteLevelAction` | actions/puntos | ⚠️ no (solo existe en el código) |
| `assignPointsAction` | actions/puntos | sí |
| `searchClientsAction` | actions/puntos | sí |
| `changeRoleAction` | actions/cms-roles | sí |
| `createUserAction` | ❌ **sin tests** | sí |
| `setUserBlockedAction` | ❌ **sin tests** | sí |
| `guardarNotaMesAction` | actions/services-notas | sí |
| `createProductAction` | actions/stock-cloro, actions/stock-ventas | sí |
| `adjustStockAction` | actions/stock-ventas | sí |
| `toggleProductActiveAction` | actions/stock-ventas | sí |
| `updateProductAction` | actions/stock-cloro, actions/stock-ventas | sí |
| `setInStockAction` | actions/stock-ventas | sí |
| `ingresarStockAction` | actions/stock-cloro | sí |
| `contarCloroAction` | actions/stock-cloro | sí |
| `sacarMermaAction` | actions/stock-cloro | sí |
| `configurarDepositoAction` | actions/stock-cloro | sí |
| `createManualSaleAction` | actions/integridad, actions/stock-cloro, actions/stock-ventas | sí |
| `marcarPiletaAction` | actions/employee, actions/integridad | sí |
| `registrarServiceAction` | actions/employee, actions/integridad | sí |
| `editarRegistroAction` | actions/employee | sí |
| `borrarRegistroAction` | actions/employee | sí |
| `anotarCobroAction` | actions/cobros | sí |
| `borrarCobroAction` | actions/cobros | sí |
| `sumarmeAAutoAction` | actions/employee | sí |
| `agregarAMiDiaAction` | actions/employee | sí |

## Páginas

| Página | Pruebas que la abren |
|---|---|
| `/` | flows/cms-landing, flows/owner-arma-el-dia, flows/owner-pileta-compartida, flows/venta-y-stock, health, … |
| `/admin/clientes` | admin, auth, flows/backoffice, flows/cliente-ve-su-informacion, flows/owner-arma-el-dia, … |
| `/admin/clientes/[id]` | admin, flows/backoffice, flows/owner-arma-el-dia, flows/owner-pileta-compartida, flows/owner-precios, … |
| `/admin/clientes/nuevo` | admin, flows/owner-arma-el-dia, flows/owner-pileta-compartida, health, manual-ayuda, … |
| `/admin/cobros` | flows/owner-cobros |
| `/admin/cobros/[clienteId]` | flows/owner-cobros |
| `/admin/dashboard` | admin, auth, flows/backoffice, flows/cliente-ve-su-informacion, flows/cuentas, … |
| `/admin/empleados` | flows/backoffice, flows/owner-empleados-historial, flows/owner-planilla, quality |
| `/admin/empleados/[id]` | flows/owner-empleados-historial, flows/owner-planilla, quality |
| `/admin/empleados/cambios` | flows/owner-planilla, quality |
| `/admin/itinerario` | admin, auth, flows/backoffice, flows/cliente-ve-su-informacion, flows/empleado-trabaja, … |
| `/admin/itinerario/[fecha]` | flows/cliente-ve-su-informacion, flows/empleado-trabaja, flows/owner-arma-el-dia, flows/owner-empleados-historial, flows/owner-planilla, … |
| `/admin/itinerario/autos` | flows/owner-arma-el-dia, quality, tests/actions/autos-itinerario.test.ts |
| `/admin/itinerario/visita/[id]` | flows/empleado-trabaja, flows/owner-empleados-historial, flows/owner-planilla, flows/owner-registra-visitas, quality, … |
| `/admin/landing-cms` | admin, auth, flows/backoffice, flows/cms-landing, health, … |
| `/admin/manual` | health, manual-ayuda, manual-pdf, quality, visual |
| `/admin/manual/[tema]` | health, manual-ayuda, manual-pdf, quality |
| `/admin/piletas` | admin, auth, flows/backoffice, flows/owner-arma-el-dia, flows/owner-pileta-compartida, … |
| `/admin/piletas/[id]` | admin, flows/backoffice, flows/owner-arma-el-dia, flows/owner-pileta-compartida, flows/owner-sugerencia, … |
| `/admin/piletas/nueva` | admin, flows/owner-arma-el-dia, health, manual-ayuda |
| `/admin/puntos` | admin, auth, flows/backoffice, flows/puntos, health, … |
| `/admin/puntos/asignar` | admin, flows/puntos, health, manual-ayuda, tests/actions/puntos.test.ts |
| `/admin/puntos/niveles` | admin, auth, flows/puntos, health, manual-ayuda, … |
| `/admin/roles` | admin, auth, flows/backoffice, health, manual-ayuda, … |
| `/admin/services` | flows/backoffice, flows/owner-planilla, flows/owner-tablero-y-services, quality, tests/actions/services-notas.test.ts |
| `/admin/services/planilla` | flows/owner-planilla, quality |
| `/admin/stock` | admin, auth, flows/backoffice, flows/owner-stock-cloro, flows/venta-y-stock, … |
| `/admin/stock/[id]/editar` | flows/owner-stock-cloro, flows/venta-y-stock, health, manual-ayuda, quality, … |
| `/admin/stock/cargar` | flows/owner-stock-cloro, health, quality |
| `/admin/stock/movimientos` | flows/owner-stock-cloro, health, quality, tests/actions/stock-cloro.test.ts |
| `/admin/stock/nuevo` | flows/venta-y-stock, health, manual-ayuda |
| `/admin/ventas` | admin, auth, flows/backoffice, flows/owner-stock-cloro, flows/venta-y-stock, … |
| `/admin/ventas/nueva` | flows/owner-stock-cloro, flows/venta-y-stock, health, manual-ayuda, quality |
| `/admin/ventas/reporte` | health, quality |
| `/client/ayuda` | health, manual-ayuda, manual-pdf, quality |
| `/client/ayuda/[tema]` | health, manual-ayuda, manual-pdf, quality |
| `/client/compras` | auth, client, flows/cliente-ve-su-informacion, flows/venta-y-stock, health, … |
| `/client/dashboard` | auth, client, flows/cliente-ve-su-informacion, flows/cuentas, flows/puntos, … |
| `/client/puntos` | auth, client, flows/cliente-ve-su-informacion, flows/puntos, health, … |
| `/client/servicios` | auth, client, flows/cliente-ve-su-informacion, health, manual-ayuda, … |
| `/employee/ayuda` | health, manual-ayuda, manual-pdf, quality |
| `/employee/ayuda/[tema]` | health, manual-ayuda, manual-pdf, quality |
| `/employee/itinerario` | auth, employee, flows/cliente-ve-su-informacion, flows/cuentas, flows/empleado-trabaja, … |
| `/employee/piletas/[id]` | employee, flows/cliente-ve-su-informacion, flows/empleado-trabaja, flows/owner-cobros, health, … |
| `/login` | admin, auth, client, employee, flows/backoffice, … |
| `/recover` | auth, flows/backoffice, flows/cuentas, health, quality, … |
| `/register` | auth, flows/cuentas |
| `/reset-password` | flows/cuentas, health |

## Tablas (permisos por rol: leer, crear, editar, borrar × 7 actores)

| Tabla | En la matriz de permisos | En el chequeo de esquema |
|---|---|---|
| `chlorine_stock` | ✅ | ✅ |
| `client_levels` | ✅ | ✅ |
| `client_prices` | ✅ | ✅ |
| `client_profiles` | ✅ | ✅ |
| `employee_profiles` | ✅ | ✅ |
| `itinerary_day_crews` | ✅ | ✅ |
| `itinerary_days` | ✅ | ✅ |
| `itinerary_items` | ✅ | ✅ |
| `landing_clicks` | ❌ | ✅ |
| `landing_content` | ✅ | ✅ |
| `manual_sale_items` | ✅ | ✅ |
| `manual_sales` | ✅ | ✅ |
| `order_items` | ✅ | ✅ |
| `orders` | ✅ | ✅ |
| `payments` | ✅ | ✅ |
| `point_rules` | ✅ | ✅ |
| `point_transactions` | ✅ | ✅ |
| `pool_clients` | ✅ | ✅ |
| `pool_month_notes` | ✅ | ✅ |
| `pools` | ✅ | ✅ |
| `products` | ✅ | ✅ |
| `profiles` | ✅ | ✅ |
| `service_log_history` | ✅ | ✅ |
| `service_logs` | ✅ | ✅ |
| `stock_movements` | ✅ | ✅ |
| `vehicles` | ✅ | ✅ |

## Triggers

| Trigger | Probado en |
|---|---|
| `tr_check_item_assignee` | db/schema |
| `tr_check_item_rescheduled_from` | db/schema |
| `tr_chlorine_stock_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_clear_item_status_note` | db/schema |
| `tr_client_levels_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_client_prices_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_client_profiles_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_close_item_on_log` | db/schema |
| `tr_deduct_stock` | db/schema |
| `tr_deduct_stock_manual` | db/schema |
| `tr_employee_profiles_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_guard_client_price_write` | db/schema |
| `tr_guard_day_crew_write` | db/schema |
| `tr_guard_itinerary_item_update` | db/schema |
| `tr_guard_manual_sale` | db/schema |
| `tr_guard_payment_write` | db/schema |
| `tr_guard_pool_client_write` | db/schema |
| `tr_guard_product_update` | db/schema |
| `tr_guard_profile_write` | db/schema |
| `tr_guard_service_log_write` | db/schema |
| `tr_itinerary_days_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_itinerary_items_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_landing_content_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_on_auth_user_created` | db/schema |
| `tr_on_auth_user_deleted` | db/schema |
| `tr_orders_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_payments_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_point_rules_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_point_tx_created_by` | db/schema |
| `tr_pool_month_notes_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_pools_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_products_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_profiles_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_reopen_item_on_log_delete` | db/schema |
| `tr_revoke_sessions_on_block` | db/schema |
| `tr_service_log_history` | db/schema |
| `tr_service_logs_updated_at` | db/triggers (updated_at por tabla), db/schema |
| `tr_set_product_category` | db/schema |
| `tr_set_profile_has_account` | db/schema |
| `tr_stamp_pool_month_note` | db/schema |
| `tr_stock_por_service` | db/schema |
| `tr_sync_pool_primary_client` | db/schema |
| `tr_sync_role` | db/schema |
| `tr_sync_service_type_to_logs` | db/autos-y-registros |
| `tr_update_points_and_level` | db/schema |
| `tr_vehicles_updated_at` | db/triggers (updated_at por tabla), db/schema |

## Módulos de lógica (`src/lib`)

| Módulo | Test unitario |
|---|---|
| `src/lib/calendario.ts` | ✅ |
| `src/lib/campo.ts` | ✅ |
| `src/lib/chlorine.ts` | ✅ |
| `src/lib/client-web.ts` | ✅ |
| `src/lib/clients.ts` | ✅ |
| `src/lib/cloro.ts` | ✅ |
| `src/lib/color.ts` | ✅ |
| `src/lib/control-services.ts` | ✅ |
| `src/lib/dates.ts` | ✅ |
| `src/lib/excel-archivo.ts` | ✅ |
| `src/lib/landing-format.ts` | ✅ |
| `src/lib/maps.ts` | ✅ |
| `src/lib/planilla.ts` | ✅ |
| `src/lib/precios.ts` | ✅ |
| `src/lib/safe-next.ts` | ✅ |
| `src/lib/safe-url.ts` | ✅ |
| `src/lib/security-headers.ts` | ✅ |
| `src/lib/service-log.ts` | ✅ |
| `src/lib/staff-work.ts` | ✅ |
| `src/lib/sugerencia.ts` | ✅ |
| `src/lib/tabla.ts` | ✅ |
| `src/lib/ubicacion.ts` | ✅ |
| `src/lib/unidad.ts` | ❌ **sin tests** |
| `src/lib/validators.ts` | ✅ |

## Resumen

| | |
|---|---|
| Acciones del servidor | 69 (67 con tests) |
| Páginas | 48 |
| Tablas | 26 |
| Triggers | 46 |
| Archivos de test | unitarios 32 · base y acciones 31 · e2e 32 |
| Huecos | **4** |

### Huecos

- Acción sin tests: createUserAction (src/app/admin/roles/actions.ts)
- Acción sin tests: setUserBlockedAction (src/app/admin/roles/actions.ts)
- Tabla fuera de la matriz de permisos: landing_clicks
- Módulo sin test unitario: src/lib/unidad.ts
