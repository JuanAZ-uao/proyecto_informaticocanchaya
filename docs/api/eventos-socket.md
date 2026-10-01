# Eventos de Socket.IO — sesión de reserva y disponibilidad en tiempo real

Documentación de los eventos en tiempo real de CanchaYa (US-17 y US-18). Complementa la documentación de la API REST (PIG1-23).

- **Servidor:** el mismo host de la API, sin `/api`. Por ejemplo, `http://localhost:4000`; en Docker, `http://localhost:4100`.
- **Librería:** Socket.IO 4 (`socket.io-client` en el frontend).
- **Implementación:**
  - [backend/src/sockets/temporizadorSocket.js](../../backend/src/sockets/temporizadorSocket.js)
  - [frontend/src/hooks/useTemporizadorReserva.js](../../frontend/src/hooks/useTemporizadorReserva.js)

## Conexión

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: { token: '<JWT del login>' },
  query: { canchaId: '<uuid de la cancha>' },
});
```

| Dato | Dónde | Obligatorio | Descripción |
|---|---|---|---|
| `token` | `auth` | Sí | El mismo JWT que usa la API REST. |
| `canchaId` | `query` | Sí | La cancha cuyo detalle está abierto. Un socket corresponde a una cancha. |

**Errores de conexión** (`connect_error`, en `error.message`):

| Mensaje | Causa |
|---|---|
| `No autenticado` | No se envió `auth.token`. |
| `Token inválido o expirado` | El JWT no es válido o ya venció. |

Si falta `canchaId`, el servidor emite `temporizador:error` y cierra la conexión.

**Salas internas:**
- `temporizador:<usuarioId>:<canchaId>` agrupa las pestañas del usuario en esa cancha.
- `cancha:<canchaId>` agrupa a todos los usuarios que miran la cancha.

## Ciclo de vida

1. Al conectarse, el servidor inicia (o retoma) una sesión de **180 s** para el usuario en esa cancha y emite `temporizador:inicio`.
2. Mientras la sesión está activa, el servidor envía `temporizador:sync` cada 5 s.
3. El usuario elige una franja con `retencion:solicitar`. Si el servidor la acepta, la franja queda **retenida** para él y los demás la ven "En proceso de reserva".
4. Al entrar al panel de confirmación (`POST /api/canchas/:id/temporizador/completar`), el temporizador se detiene. La retención se mantiene 10 minutos más para que el usuario confirme.
5. Al confirmar (`POST /api/canchas/:id/reservas`), la retención se convierte en reserva y los demás reciben `disponibilidad:reservada`.

**La retención se libera**, y los demás reciben `disponibilidad:liberada`, cuando:
- el temporizador expira;
- el usuario elige otra franja (solo puede retener una por cancha);
- el usuario emite `retencion:liberar`, por ejemplo al cambiar de fecha o al pulsar "Cancelar";
- se desconecta la última pestaña del usuario en esa cancha;
- el usuario reinicia el temporizador.

**Persistencia:**
- Las sesiones (`sesiones_reserva`) y las retenciones (`retenciones`) se guardan en PostgreSQL.
- Si el servidor se reinicia, al arrancar retoma las sesiones vigentes con el mismo `expiresAt`. Los clientes se reconectan solos y vuelven a recibir `temporizador:inicio` con ese valor.
- Cada 15 s el servidor elimina las retenciones vencidas y avisa a quienes miran la cancha.

## Eventos que emite el cliente

Todos aceptan un callback de confirmación (*ack*) como último argumento.

### `retencion:solicitar`

Retiene una franja para el usuario. Si ya tenía otra en la misma cancha, la anterior se libera.

**Payload:**
```json
{ "fecha": "2026-10-01", "horaInicio": "10:00", "horaFin": "11:00" }
```

**Respuesta (ack) si se acepta:**
```json
{ "ok": true, "retencion": { "fecha": "2026-10-01", "horaInicio": "10:00", "horaFin": "11:00", "expiresAt": 1790870400000 } }
```

**Respuesta (ack) si se rechaza:**
```json
{ "ok": false, "error": { "codigo": "FRANJA_RETENIDA", "mensaje": "Otro usuario está reservando esta franja en este momento" } }
```

### `retencion:liberar`

Libera la franja retenida por el usuario en la cancha.
- **Payload:** `null`.
- **Ack:** `{ "ok": true }`.

### `temporizador:reiniciar`

Descarta la sesión actual, libera su retención e inicia una nueva sesión de 180 s.
- **Payload:** `null`.
- **Ack:** `{ "expiresAt": <ms epoch> }`.
- Todas las pestañas del usuario reciben `temporizador:inicio`.

## Eventos que emite el servidor

| Evento | Destinatario | Payload | Cuándo |
|---|---|---|---|
| `temporizador:inicio` | El usuario (todas sus pestañas) | `{ "expiresAt": <ms epoch>, "estado": "activo" }` | Al conectarse o reconectarse, y al reiniciar |
| `temporizador:sync` | El usuario | `{ "expiresAt": <ms epoch> }` | Cada 5 s mientras la sesión está activa |
| `temporizador:expirado` | El usuario | — | Al cumplirse los 180 s |
| `temporizador:error` | El socket | `{ "mensaje" }` o `{ "codigo", "mensaje" }` | Falta `canchaId` o falló el inicio de sesión |
| `retencion:confirmada` | El usuario (todas sus pestañas) | `{ "fecha", "horaInicio", "horaFin", "expiresAt" }` | El servidor aceptó una retención |
| `disponibilidad:retenida` | Los **demás** usuarios en la cancha | `{ "canchaId", "fecha", "horaInicio", "horaFin" }` | Alguien retuvo esa franja: mostrarla "En proceso de reserva" |
| `disponibilidad:liberada` | Los **demás** usuarios en la cancha | `{ "canchaId", "fecha", "horaInicio", "horaFin" }` | Se liberó una retención o se canceló una reserva: la franja vuelve a estar libre |
| `disponibilidad:reservada` | Los **demás** usuarios en la cancha | `{ "canchaId", "fecha", "horaInicio", "horaFin" }` | Se confirmó una reserva: mostrarla "No disponible" |

Las horas se envían como `HH:mm` y las fechas como `YYYY-MM-DD`, en hora de Colombia. Los eventos `disponibilidad:*` no dicen qué usuario hizo el cambio.

## Códigos de error

Se usan en el ack de los eventos de socket y en el campo `codigo` de las respuestas REST relacionadas.

| Código | HTTP equivalente | Significado |
|---|---|---|
| `DATOS_INVALIDOS` | 400 | Falta la fecha u hora, el formato no es válido o `horaFin` no es posterior a `horaInicio`. |
| `HORA_PASADA` | 400 | La fecha u hora ya pasó. |
| `SESION_EXPIRADA` | 409 | El usuario no tiene sesión vigente en la cancha; debe reiniciar el temporizador. |
| `FRANJA_RETENIDA` | 409 | Otro usuario tiene retenida la franja. |
| `FRANJA_OCUPADA` | 409 | La franja ya tiene una reserva confirmada. |
| `TIMEOUT` / `SIN_CONEXION` | — | Los genera el cliente cuando el servidor no responde o no hay conexión. |
| `ERROR_INTERNO` | 500 | Error inesperado del servidor. |

## Endpoints REST relacionados

| Método | Ruta | Cambio por US-18 |
|---|---|---|
| GET | `/api/canchas/:id/disponibilidad?fecha=` | Además de `ocupados`, devuelve `retenidos`: las franjas retenidas por **otros** usuarios en esa fecha. |
| POST | `/api/canchas/:id/temporizador/completar` | Recibe `{ fecha, horaInicio, horaFin }`. Asegura la retención de esa franja antes de detener el temporizador; responde `409` con `codigo: FRANJA_RETENIDA` si otro la tiene. |
| POST | `/api/canchas/:id/reservas` | Responde `409` con `codigo: FRANJA_RETENIDA` si otro usuario tiene retenida la franja. Al crearse, la retención del usuario se convierte en la reserva. |

## Prueba de carga

[backend/scripts/pruebaCargaSockets.js](../../backend/scripts/pruebaCargaSockets.js) conecta 100 clientes a la misma cancha y verifica:
- que ningún evento se pierda ni se duplique;
- que una sola retención y una sola reserva ganen cuando 99 clientes compiten por la misma franja.

Se ejecuta contra un backend en marcha y **nunca contra la base compartida de Neon**:

```bash
cd backend
API_URL=http://localhost:4100/api CLIENTES=100 npm run test:carga
```

El pipeline de CI la ejecuta contra el entorno Docker en el job "Docker - build y smoke test".
