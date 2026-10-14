#!/usr/bin/env bash
# Continúa la batería después del E2E: no funcionales, repeticiones aisladas, entorno y smoke fase 2.
cd "$(dirname "$0")"
while tasklist 2>/dev/null | grep -q "^node.exe.*" && powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'e2e.mjs' }) { exit 0 } else { exit 1 }"; do sleep 10; done
echo "=== node nofuncionales.mjs"
timeout 1800 node nofuncionales.mjs || echo "(termina con código $?)"
echo "=== repeticion aislada funcionales"
SOLO=F-13-03,F-17-06,F-18-11 timeout 900 node funcionales.mjs || echo "(termina con código $?)"
echo "=== repeticion aislada smoke"
SOLO=SD-19 timeout 600 node smoke.mjs 1 || echo "(termina con código $?)"
echo "=== node entorno.mjs"
timeout 600 node entorno.mjs || echo "(termina con código $?)"
echo "=== node smoke.mjs 2"
timeout 1800 node smoke.mjs 2 || echo "(termina con código $?)"
echo "=== FIN"
