# Pruebas de humo post-despliegue

- **Fecha:** 2026-11-11T22:20:03.468Z
- **Frontend:** https://proyecto-informaticocanchaya.vercel.app
- **API:** https://canchaya-backend.onrender.com/api
- **Resultado:** 20/20 verificaciones aprobadas

| Resultado | Verificación | Detalle |
| --- | --- | --- |
| Aprobada | Frontend: la página principal carga la aplicación | HTTP 200 |
| Aprobada | Frontend: recargar una ruta interna devuelve la aplicación (reescritura SPA) | HTTP 200 |
| Aprobada | Frontend y API se sirven por HTTPS |  |
| Aprobada | API: /api/health responde ok | HTTP 200 |
| Aprobada | CORS: permite el origen del frontend | allow-origin: https://proyecto-informaticocanchaya.vercel.app |
| Aprobada | CORS: rechaza un origen ajeno | HTTP 403 |
| Aprobada | Registro de usuario | HTTP 201 |
| Aprobada | Inicio de sesión devuelve token | HTTP 200 |
| Aprobada | Sin sesión la API rechaza (401) | HTTP 401 |
| Aprobada | Listado de canchas con datos | 64 canchas |
| Aprobada | Socket (WSS): llega temporizador:inicio con vencimiento | expiresAt=1794435780356 |
| Aprobada | Hay una cancha con horario de atención para reservar una franja de 1 hora | Cancha Aguacatal · 2094-08-10 |
| Aprobada | Disponibilidad: consulta de una fecha | HTTP 200 |
| Aprobada | Disponibilidad: rechaza una franja fuera del horario de atención | HTTP 400 |
| Aprobada | Disponibilidad: valida el formato de la hora (400) | HTTP 400 |
| Aprobada | Creación de reserva (201 con código) | HTTP 201 CY-1900A881 · franja 16:00-17:00 |
| Aprobada | Reserva duplicada por otro usuario: bloqueada (409) | HTTP 409 |
| Aprobada | Reserva duplicada por el mismo usuario: bloqueada (409) | HTTP 409 |
| Aprobada | Solo existe una reserva para la franja | 1 reserva(s) |
| Aprobada | Limpieza: la reserva de prueba se cancela | HTTP 200 |
