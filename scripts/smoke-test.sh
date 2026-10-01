#!/usr/bin/env bash
# Smoke test del entorno levantado con docker compose.
# Uso: ./scripts/smoke-test.sh   (respeta BACKEND_PORT y FRONTEND_PORT si están definidos)
set -euo pipefail

API="http://localhost:${BACKEND_PORT:-4100}/api"
WEB="http://localhost:${FRONTEND_PORT:-8080}"
ORIGEN="http://localhost:${FRONTEND_PORT:-8080}"

paso() { echo "-> $1"; }
falla() { echo "FALLO: $1" >&2; exit 1; }

paso "API responde en /api/health"
curl -fsS "$API/health" | grep -q '"ok"' || falla "health no devolvió ok"

paso "Frontend sirve la app"
curl -fsS "$WEB/" | grep -q '<div id="root">' || falla "index.html no contiene la app"

paso "Rutas de React Router resuelven a index.html (SPA)"
curl -fsS -o /dev/null "$WEB/canchas/cualquier-id" || falla "la ruta /canchas/:id no responde"

paso "CORS permite el origen del frontend"
curl -fsS -o /dev/null -D - -X OPTIONS "$API/canchas" \
  -H "Origin: $ORIGEN" -H "Access-Control-Request-Method: GET" \
  | grep -qi "access-control-allow-origin: $ORIGEN" || falla "CORS no permite $ORIGEN"

paso "Sin token la API responde 401"
codigo=$(curl -s -o /dev/null -w '%{http_code}' "$API/canchas")
[ "$codigo" = "401" ] || falla "se esperaba 401 y llegó $codigo"

paso "Registro e inicio de sesión contra la base de datos"
correo="smoke.$(date +%s).$RANDOM@example.com"
curl -fsS -o /dev/null -X POST "$API/auth/registro" -H 'Content-Type: application/json' \
  -d "{\"nombre\":\"Smoke Test\",\"correo\":\"$correo\",\"telefono\":\"3000000000\",\"password\":\"Password123!\"}" \
  || falla "el registro falló"
token=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"correo\":\"$correo\",\"password\":\"Password123!\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$token" ] || falla "el login no devolvió token"

paso "Con token la API lista canchas"
curl -fsS "$API/canchas" -H "Authorization: Bearer $token" | grep -q '"canchas"' || falla "GET /canchas falló"

echo "Smoke test OK"
