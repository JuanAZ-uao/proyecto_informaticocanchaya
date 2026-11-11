# CanchaYa v1.0.0 — notas de la versión

Entrega final del Proyecto Informático 1 (rama `sprint_5`). Etiqueta: `v1.0.0`.

## Qué incluye

**Usuarios y autenticación:** registro, inicio de sesión, recuperación de contraseña, perfil (datos, cambio de contraseña y de correo con verificación por enlace) y roles (usuario y administrador).

**Reservas:** catálogo y filtros de canchas, disponibilidad por franja, retención de franja y temporizador en tiempo real (Socket.IO), reservas múltiples, bloqueo de reservas duplicadas, código de reserva `CY-XXXXXXXX`, correo de confirmación, historial, cancelación propia con regla de 2 horas y reembolso automático.

**Pagos:** tarjetas tokenizadas con una pasarela simulada, pago opcional al reservar y reembolso en la misma transacción.

**Administración:** gestión de canchas (crear, editar, desactivar con confirmación y reactivar), cancelación administrativa con motivo y reembolso, y verificación de códigos de reserva con auditoría.

**Plataforma y operación:** contenedorización con Docker, pipeline CI/CD (pruebas, SonarQube, Docker), documentación OpenAPI (`/api/docs`), despliegue en **Vercel** (frontend) y **Railway** (backend + PostgreSQL), respaldos diarios con restauración probada, monitoreo y alertas, pruebas de humo y de carga post-despliegue.

## Cambios de esta versión respecto al Sprint 5 inicial (US-22 a US-26)

- `backend/railway.json`: *builder* Dockerfile, healthcheck `/api/health`, migración y carga inicial en *pre-deploy*, reinicio ante fallos.
- `frontend/vercel.json`: reescritura de rutas para la aplicación de una sola página, cabeceras de seguridad y caché de recursos; producción publicada por el pipeline.
- `CORS_ORIGIN` acepta varios orígenes y un comodín seguro para las previews de Vercel.
- El frontend no contiene direcciones de desarrollo: `VITE_API_URL` es obligatoria (y HTTPS) al compilar en Vercel.
- Los logs no incluyen tokens ni correos en producción; los errores 500 se registran sin el objeto completo del error de la base.
- `GET /api/health` informa el commit desplegado (`version`).
- Línea periódica `[METRICAS]` con las conexiones de socket activas.
- Carga inicial idempotente (`npm run seed:inicial`) y creación del administrador sin credenciales por defecto (`npm run crear:admin`).
- Scripts de respaldo y restauración (`scripts/respaldo/`) y workflows `respaldo-bd.yml` y `monitoreo.yml`.
- Pruebas de humo (`npm run smoke:produccion`) y de carga de reservas (`npm run test:carga-reservas`).

## Calidad

- Pruebas del plan de QA de Sprint 5: 757 casos, 0 fallidos (ver el README); más 12 pruebas de backend y 4 de frontend nuevas para esta versión (CORS con varios orígenes, logs sin datos sensibles y configuración de direcciones).
- SonarQube: Quality Gate aprobado.

## Limitaciones conocidas

- La pasarela de pago es simulada: no se cobran pagos reales.
- Sin SMTP configurado no se envían correos (recuperación de contraseña y cambio de correo no funcionan en producción).
- No se puede volver a una versión anterior al Sprint 5 sin restaurar un respaldo (ver «Rollback sin romper la base de datos» en el [manual de despliegue y operación](despliegue-y-operacion.md)).

## Documentación

[Manual de usuario](manual-usuario.md) · [Documentación técnica final](documentacion-tecnica-final.md) · [Manual de despliegue y operación](despliegue-y-operacion.md) · [API (OpenAPI)](../backend/openapi/openapi.yaml)
