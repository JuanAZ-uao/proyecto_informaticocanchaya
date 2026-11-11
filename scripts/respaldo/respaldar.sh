#!/usr/bin/env bash
# Respaldo lógico de la base de datos con pg_dump (formato custom, comprimido y restaurable por tabla).
# Uso:  DATABASE_URL=postgresql://... ./scripts/respaldo/respaldar.sh [archivo.dump]
# La URL va en una variable de entorno (no en el comando) para que no quede en el historial ni en los logs.
# El archivo contiene datos personales: no se sube al repositorio (*.dump está en .gitignore) y se guarda cifrado.
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL (en Railway: la URL pública de conexión del servicio PostgreSQL)}"
salida="${1:-respaldo-canchaya-$(date -u +%Y%m%dT%H%M%SZ).dump}"

pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$salida"
echo "Respaldo creado: $salida ($(wc -c < "$salida") bytes)"
