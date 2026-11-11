#!/usr/bin/env bash
# Compara la cantidad de filas de las tablas principales entre la base ORIGEN y la base RESTAURADA.
# Uso:  ORIGEN_URL=postgresql://... DESTINO_URL=postgresql://... ./scripts/respaldo/verificar-restauracion.sh
# (ORIGEN_URL es opcional: sin ella solo se muestran los conteos de la restaurada y se exige que no esté vacía.)
set -euo pipefail

: "${DESTINO_URL:?Define DESTINO_URL (la base restaurada)}"
tablas="usuarios canchas horarios_disponibles reservas metodos_pago pagos cambios_correo verificaciones_reserva cancelaciones_administrativas"
falla=0

contar() { psql "$1" -Atqc "SELECT count(*) FROM $2"; }

printf '%-30s %10s %10s\n' tabla origen restaurada
for tabla in $tablas; do
  restaurada="$(contar "$DESTINO_URL" "$tabla")"
  if [ -n "${ORIGEN_URL:-}" ]; then
    origen="$(contar "$ORIGEN_URL" "$tabla")"
    estado=""
    if [ "$origen" != "$restaurada" ]; then estado="  <-- DIFERENTE"; falla=1; fi
    printf '%-30s %10s %10s%s\n' "$tabla" "$origen" "$restaurada" "$estado"
  else
    printf '%-30s %10s %10s\n' "$tabla" "-" "$restaurada"
  fi
done

if [ -z "${ORIGEN_URL:-}" ] && [ "$(contar "$DESTINO_URL" usuarios)" = "0" ] && [ "$(contar "$DESTINO_URL" canchas)" = "0" ]; then
  echo "La base restaurada está vacía" >&2
  exit 1
fi

if [ "$falla" = "0" ]; then
  echo "Verificación OK"
else
  echo "Verificación FALLIDA: hay tablas con distinta cantidad de filas" >&2
  exit 1
fi
