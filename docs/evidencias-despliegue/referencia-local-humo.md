# Pruebas de humo post-despliegue

- **Fecha:** 2026-11-11T21:34:55.038Z
- **Frontend:** http://localhost:8390
- **API:** http://localhost:4310/api
- **Resultado:** 20/20 verificaciones aprobadas

| Resultado | Verificación | Detalle |
| --- | --- | --- |
| Aprobada | Frontend: la página principal carga la aplicación | HTTP 200 |
| Aprobada | Frontend: recargar una ruta interna devuelve la aplicación (reescritura SPA) | HTTP 200 |
| Aprobada | Frontend y API se sirven por HTTPS | entorno local: se omite |
| Aprobada | API: /api/health responde ok | HTTP 200 |
| Aprobada | CORS: permite el origen del frontend | allow-origin: http://localhost:8390 |
| Aprobada | CORS: rechaza un origen ajeno | HTTP 403 |
| Aprobada | Registro de usuario | HTTP 201 |
| Aprobada | Inicio de sesión devuelve token | HTTP 200 |
| Aprobada | Sin sesión la API rechaza (401) | HTTP 401 |
| Aprobada | Listado de canchas con datos | 5 canchas |
| Aprobada | Socket (WS): llega temporizador:inicio con vencimiento | expiresAt=1794433074706 |
| Aprobada | Hay una cancha con horario de atención para reservar una franja de 1 hora | Cancha El Bosque · 2094-08-25 |
| Aprobada | Disponibilidad: consulta de una fecha | HTTP 200 |
| Aprobada | Disponibilidad: rechaza una franja fuera del horario de atención | HTTP 400 |
| Aprobada | Disponibilidad: valida el formato de la hora (400) | HTTP 400 |
| Aprobada | Creación de reserva (201 con código) | HTTP 201 CY-580C04CD · franja 09:00-10:00 |
| Aprobada | Reserva duplicada por otro usuario: bloqueada (409) | HTTP 409 |
| Aprobada | Reserva duplicada por el mismo usuario: bloqueada (409) | HTTP 409 |
| Aprobada | Solo existe una reserva para la franja | 1 reserva(s) |
| Aprobada | Limpieza: la reserva de prueba se cancela | HTTP 200 |
