# Prueba de carga básica de reservas

- **Fecha:** 2026-11-11T21:35:02.240Z
- **API:** http://localhost:4310/api
- **Usuarios concurrentes:** 30
- **Peticiones HTTP:** 188 · latencia p50 224 ms · p95 1282 ms · máxima 1391 ms
- **Duración total:** 7.1 s
- **Resultado:** 5/5 verificaciones aprobadas

| Resultado | Verificación | Detalle |
| --- | --- | --- |
| Aprobada | 30 usuarios registrados e iniciaron sesión |  |
| Aprobada | Fase 1: 30 usuarios reservan la misma franja a la vez | 1 creada (201), 29 rechazadas (409), 0 errores 5xx |
| Aprobada | Fase 2: 30 usuarios reservan cada uno su franja a la vez | 30/30 creadas, 0 errores 5xx, estados: 201 |
| Aprobada | Fase 3: ninguna franja quedó reservada dos veces | 31 franjas ocupadas (esperadas 31), 0 fechas con duplicados |
| Aprobada | Limpieza: las reservas de la prueba se cancelaron | 31/31 |
