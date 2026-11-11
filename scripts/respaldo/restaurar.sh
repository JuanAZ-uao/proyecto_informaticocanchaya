#!/usr/bin/env bash
# Restaura un respaldo creado con respaldar.sh en la base indicada por DATABASE_URL.
# Uso:  DATABASE_URL=postgresql://destino... ./scripts/respaldo/restaurar.sh respaldo.dump
# ATENCIÓN: reemplaza el contenido de las tablas de la base destino (--clean). Para ensayar una restauración usa
# una base vacía distinta de producción. Para restaurar producción de verdad, sigue docs/despliegue-y-operacion.md.
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL de la base DESTINO}"
archivo="${1:?Indica el archivo .dump a restaurar}"
[ -f "$archivo" ] || { echo "No existe $archivo" >&2; exit 1; }

# --exit-on-error: si algo falla no se deja una base a medias sin avisar.
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$DATABASE_URL" "$archivo"
echo "Restauración completada desde $archivo"
