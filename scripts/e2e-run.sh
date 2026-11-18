#!/usr/bin/env bash
# Corre la suite acción-por-acción (e2e/flows + e2e/smoke) con cobertura real medida contra el
# inventario del código, tablero en vivo y reanudación. Por defecto corre contra Supabase LOCAL
# (igual que el resto de la suite). Para correr contra producción, ver más abajo.
#
# Uso:
#   scripts/e2e-run.sh                              corrida local completa
#   scripts/e2e-run.sh e2e/flows/puntos.spec.ts      un archivo puntual
#
# Contra PRODUCCIÓN (crea y borra filas marcadas ZZE2E en la base real — requiere las 4 variables):
#   E2E_TARGET=prod E2E_ALLOW_PROD_WRITE=1 \
#   E2E_PROD_URL=https://... E2E_PROD_SUPABASE_URL=https://xxx.supabase.co \
#   E2E_PROD_SUPABASE_ANON_KEY=... E2E_PROD_SUPABASE_SERVICE_ROLE_KEY=... \
#   scripts/e2e-run.sh
#
# Resultados (archivos en la raíz del repo, no se commitean):
#   E2E_REPORT_FILE    estado de cada prueba (por defecto e2e-results.json)
#   E2E_COVERAGE_FILE  cobertura real: acciones, endpoints y controles de pantalla ejecutados vs. existentes
# Corrida "todo verde = todo probado": E2E_REQUIRE_FULL_COVERAGE=1 deja la corrida en rojo si algo no se ejecutó.
set -a; [ -f ./.env.local ] && . ./.env.local; set +a
export E2E_REPORT_FILE="${E2E_REPORT_FILE:-e2e-results.json}"
export E2E_COVERAGE_FILE="${E2E_COVERAGE_FILE:-e2e-coverage.json}"

if [ "${E2E_TARGET:-local}" = "prod" ]; then
  echo "⚠ Corriendo contra PRODUCCIÓN (${E2E_PROD_URL:-?}) — crea y borra filas marcadas ZZE2E."
fi

# Tablero en vivo (http://localhost:9323): estado, errores, cobertura, notas e historial. Se abre solo si no está abierto.
# Desactivarlo: E2E_DASHBOARD=0
if [ "${E2E_DASHBOARD:-1}" != "0" ]; then
  (node scripts/e2e-dashboard.mjs >/dev/null 2>&1 &)
  echo "Tablero de la corrida: http://localhost:${E2E_DASHBOARD_PORT:-9323}"
fi

# --reporter pisa al reporter propio (el que arma los resultados, la cobertura y las notas): se ignora a propósito
args=()
skip=0
for a in "$@"; do
  if [ "$skip" = "1" ]; then skip=0; continue; fi
  case "$a" in
    --reporter) echo "Aviso: se ignora --reporter (pisaría al reporter de resultados)"; skip=1;;
    --reporter=*) echo "Aviso: se ignora $a (pisaría al reporter de resultados)";;
    *) args+=("$a");;
  esac
done
exec npx playwright test -c playwright.coverage.config.ts "${args[@]}"
