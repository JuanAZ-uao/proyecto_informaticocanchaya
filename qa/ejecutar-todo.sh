#!/usr/bin/env bash
# Ejecuta el plan de pruebas completo en el orden recomendado y deja los resultados en resultados/.
# Las dos pruebas de 180 s reales dependen de un socket abierto durante 3 minutos; si Docker Desktop
# en Windows corta esa conexión por el ruido de otros comandos, se repiten aisladas (una sola vez).
cd "$(dirname "$0")"
for paso in "smoke.mjs 1" "jest.mjs" "funcionales.mjs" "e2e.mjs" "nofuncionales.mjs"; do
  echo "=== node $paso"
  timeout 1800 node $paso || echo "(termina con código $?)"
  if [[ "$paso" == "funcionales.mjs" ]]; then
    fallidas=$(node -e "const r=JSON.parse(require('fs').readFileSync('resultados/funcionales.json','utf8'));console.log(r.casos.filter(c=>c.estado==='FALLIDA'&&['F-17-06','F-18-11'].includes(c.id)).map(c=>c.id).join(','))")
    if [[ -n "$fallidas" ]]; then echo "=== repeticion aislada: $fallidas"; SOLO=$fallidas timeout 900 node funcionales.mjs || echo "(termina con código $?)"; fi
  fi
  if [[ "$paso" == "e2e.mjs" ]]; then
    fallidas=$(node -e "const r=JSON.parse(require('fs').readFileSync('resultados/e2e.json','utf8'));console.log(r.casos.filter(c=>c.estado==='FALLIDA'&&['E2E-21'].includes(c.id)).map(c=>c.id).join(','))")
    if [[ -n "$fallidas" ]]; then echo "=== repeticion aislada: $fallidas"; SOLO=$fallidas timeout 900 node e2e.mjs || echo "(termina con código $?)"; fi
  fi
done
for paso in "entorno.mjs" "smoke.mjs 2"; do
  echo "=== node $paso"
  timeout 1800 node $paso || echo "(termina con código $?)"
done
echo "=== FIN"
