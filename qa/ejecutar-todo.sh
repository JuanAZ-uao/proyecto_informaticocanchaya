#!/usr/bin/env bash
# Ejecuta el plan de pruebas completo en el orden recomendado y deja los resultados en resultados/.
cd "$(dirname "$0")"
for paso in "smoke.mjs 1" "jest.mjs" "funcionales.mjs" "e2e.mjs" "nofuncionales.mjs" "entorno.mjs" "smoke.mjs 2"; do
  echo "=== node $paso"
  timeout 1800 node $paso || echo "(termina con código $?)"
done
echo "=== FIN"
