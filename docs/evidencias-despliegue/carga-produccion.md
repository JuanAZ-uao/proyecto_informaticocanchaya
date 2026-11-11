# Prueba de carga básica de reservas

- **Fecha:** 2026-11-11T22:20:41.340Z
- **API:** https://canchaya-backend.onrender.com/api
- **Usuarios concurrentes:** 20
- **Peticiones HTTP:** 124 · latencia p50 979 ms · p95 7003 ms · máxima 10103 ms
- **Duración total:** 27.4 s
- **Resultado:** 5/5 verificaciones aprobadas

| Resultado | Verificación | Detalle |
| --- | --- | --- |
| Aprobada | 20 usuarios registrados e iniciaron sesión |  |
| Aprobada | Fase 1: 20 usuarios reservan la misma franja a la vez | 1 creada (201), 19 rechazadas (409), 0 errores 5xx |
| Aprobada | Fase 2: 20 usuarios reservan cada uno su franja a la vez | 20/20 creadas, 0 errores 5xx, estados: 201 |
| Aprobada | Fase 3: ninguna franja quedó reservada dos veces | 21 franjas ocupadas (esperadas 21), 0 fechas con duplicados |
| Aprobada | Limpieza: las reservas de la prueba se cancelaron | 21/21 |
