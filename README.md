# CanchaYa — Sistema de reserva de canchas sintéticas

Proyecto Informático 1 — Universidad Autónoma de Occidente, Facultad de Ingeniería, 2026-2.

## Integrantes

- Samuel Rios Calderón (2230205)
- Juan Esteban Panesso Bernal (2215930)
- Juan Sebastian Castillo Acevedo (2231921)
- Byron Stiven Zapata Zapata (2210718)

**Docente:** Jorge Gonzalez Rivera

---

## Descripción del proyecto y stack tecnológico

**CanchaYa** es una aplicación web para consultar canchas sintéticas, ver su disponibilidad por fecha y reservar franjas de una hora. Evita las reservas duplicadas, retiene la franja mientras el usuario completa su reserva (temporizador de 3 minutos) y muestra a los demás usuarios la disponibilidad en tiempo real.

| Capa | Tecnología |
|---|---|
| Frontend | React 18, Vite, React Router 7, Axios, Socket.IO Client |
| Backend | Node.js 22, Express 4, express-validator, JWT, bcryptjs, Socket.IO 4 |
| Base de datos | PostgreSQL 16 (Neon en desarrollo, contenedor en Docker) |
| Pruebas | Jest, Supertest, Playwright, axe-core, Spectral |
| Calidad | ESLint, SonarQube |
| Contenedores y CI/CD | Docker Compose, GitHub Actions, runner self-hosted |
| Documentación de la API | OpenAPI 3 y Swagger UI |

---

## Control de versiones

### Estrategia de ramas

Cada historia de usuario (HU) se desarrolla en su propia rama y entra a la rama de integración del sprint mediante un Pull Request. Nadie hace push directo a las ramas `main` ni `sprint_N`.

```mermaid
gitGraph
   commit id: "main"
   branch sprint_N
   checkout sprint_N
   commit id: "inicio del sprint"
   branch "feature/us-xx-nombre"
   checkout "feature/us-xx-nombre"
   commit id: "commit 1"
   commit id: "commit 2"
   commit id: "commit 3"
   checkout sprint_N
   merge "feature/us-xx-nombre" tag: "PR + CI"
   branch "fix/nombre-del-error"
   checkout "fix/nombre-del-error"
   commit id: "fix 1"
   commit id: "fix 2"
   checkout sprint_N
   merge "fix/nombre-del-error" tag: "PR + CI"
   branch "qa/nombre"
   checkout "qa/nombre"
   commit id: "pruebas QA"
   commit id: "docs QA"
   checkout sprint_N
   merge "qa/nombre" tag: "PR + CI"
   checkout main
   merge sprint_N tag: "Sprint Review"
```

| Rama | Nombre | Sale de | Se fusiona en | Ejemplo real del repositorio |
|---|---|---|---|---|
| Principal | `main` | — | — (recibe `sprint_N` al validar el Sprint Review) | — |
| Integración del sprint | `sprint_N` | `main` o `sprint_(N-1)` | `main` | `sprint_3`, `sprint_4` |
| Funcionalidad | `feature/us-<n>-<descripcion>` | `sprint_N` | `sprint_N` por Pull Request | `feature/us-13-historial-reservas`, `US-12/Reservas_multiples` |
| Corrección | `fix/<descripcion>` | `sprint_N` | `sprint_N` por Pull Request | — |
| Pruebas | `qa/<descripcion>` | `sprint_N` | `sprint_N` por Pull Request | `qa/sprint-3-testing` |

La relación HU → rama → commits debe ser trazable: el nombre de la rama lleva el número de la HU y cada commit la menciona en su alcance o en su pie.

### Convención de commits

Se sigue Conventional Commits: `<tipo>(<alcance>): <descripción corta en imperativo>`. La descripción va en minúscula, tiene unos 50 caracteres como máximo y un commit equivale a un cambio lógico.

| Tipo | Se usa para | Ejemplo |
|---|---|---|
| `feat` | Nueva funcionalidad | `feat(us-13): agregar historial de reservas paginado` |
| `fix` | Corrección de un error | `fix(reservas): rechazar reservas fuera del horario` |
| `docs` | Documentación | `docs(api): documentar los endpoints con OpenAPI` |
| `test` | Crear o ajustar pruebas | `test(us-12): cubrir el límite de reservas activas` |
| `refactor` | Mejora interna sin cambiar el comportamiento | `refactor(reservas): extraer la validación de horario` |
| `style` | Formato sin impacto funcional | `style(frontend): ordenar los estilos de la navbar` |
| `build` | Dependencias y empaquetado | `build(backend): agregar swagger-ui-express` |
| `ci` | Integración continua | `ci: validar la especificación OpenAPI con Spectral` |
| `chore` | Mantenimiento | `chore: actualizar el .gitignore` |
| `perf` | Rendimiento | `perf(reservas): indexar la consulta de disponibilidad` |

### Pull Request y revisión de código

1. Se abre el PR desde la rama de la HU hacia `sprint_N`. El título lleva el número de la HU y la descripción explica qué resuelve y cómo se probó.
2. El pipeline de CI/CD corre solo (backend, frontend, quality gate de SonarQube y Docker). Si algún job falla, no se fusiona.
3. Otro integrante, distinto del autor, revisa el código: deja comentarios (en el PR o en líneas específicas) y aprueba o solicita cambios.
4. El autor atiende los comentarios con nuevos commits en la misma rama.
5. Con la aprobación y los checks en verde, se fusiona con **Create a merge commit**. Así el historial conserva cada commit de la HU y el punto exacto donde entró al sprint (`git log --graph`).
6. La rama de la HU se elimina después de fusionarse.

### Resolución de conflictos

1. Actualizar la rama de trabajo: `git fetch origin` y `git merge origin/sprint_N`.
2. Identificar los archivos en conflicto: `git status` y `git diff --name-only --diff-filter=U`.
3. Abrir cada archivo, decidir qué conservar de cada lado y borrar por completo los marcadores `<<<<<<<`, `=======` y `>>>>>>>`.
4. Verificar con las pruebas: `cd backend && npm test`.
5. Agregar solo los archivos resueltos (`git add <archivo>`, nunca `git add .`), hacer el commit del merge y subir la rama.

---

## Sprint Planning — Sprint 1

**Sprint:** Sprint 1 — 2 al 9 de septiembre de 2026 (1 semana)
**Tablero Jira:** Espacio CanchaYaUAO — proyecto PIG1

### Sprint Planning

**Objetivo:** Definir qué construirá el equipo durante el Sprint 1 y cómo lo hará.

**Cuándo:** Inicio del Sprint 1 (semana del 2 de septiembre de 2026).

**Duración:** 1 hora (sprint de 1 semana, según guía del curso).

**Rol de Product Owner:** Para este ejercicio académico, el equipo asumió la priorización de las HU sin la presencia formal del PO.

**Pasos realizados en la reunión de planeación:**

- El equipo revisó el Product Backlog (16 historias de usuario en 4 épicas) y priorizó las historias de la épica EPIC-01 (autenticación) por ser prerrequisito de todo el sistema, sumando el inicio del catálogo de canchas (EPIC-02).
- Se discutió cada historia seleccionada: alcance, dudas y tareas técnicas que implica.
- Se estimó el esfuerzo de cada historia en story points (escala usada en el Product Backlog).
- Se seleccionaron las historias que el equipo puede completar en una semana: US-01, US-02, US-03 y US-04 (11 puntos), conformando el Sprint Backlog.
- Se definió el objetivo del Sprint.
- Se detalló, para cada HU, su Definition of Done (criterios de aceptación) y se desagregó en tareas técnicas asignadas a un único responsable.

### Objetivo del Sprint 1

> "Al finalizar este Sprint, el sistema permitirá a un visitante registrarse, iniciar sesión, recuperar su contraseña y consultar el listado de canchas disponibles."

### Sprint Backlog

Historias de usuario seleccionadas del Product Backlog para el Sprint 1:

| ID | Historia de Usuario | Épica | Pts | Responsable |
|----|---------------------|-------|-----|-------------|
| US-01 | Como visitante, quiero registrarme con mis datos personales, para crear una cuenta y poder reservar canchas. | EPIC-01: Gestión de Usuarios | 3 | Juan Esteban Panesso |
| US-02 | Como usuario registrado, quiero iniciar sesión con mi correo y contraseña, para acceder a mis reservas. | EPIC-01: Gestión de Usuarios | 2 | Juan Esteban Panesso |
| US-03 | Como usuario registrado, quiero recuperar mi contraseña por correo electrónico, para retomar el acceso a mi cuenta si la olvidé. | EPIC-01: Gestión de Usuarios | 3 | Juan Esteban Panesso |
| US-04 | Como usuario autenticado, quiero ver el listado de canchas disponibles con su nombre y dirección, para elegir dónde jugar. | EPIC-02: Catálogo de Canchas | 3 | Samuel Rios Calderón |
| | **Total estimado del Sprint 1** | | **11 pts** | |

### Detalle de las Historias de Usuario

Para cada HU del Sprint Backlog se definió su Definition of Done (criterios de aceptación) y las tareas técnicas en que se desagrega, cada una asignada a un único integrante del equipo de desarrollo.

#### US-01 · Registro de usuario

*EPIC-01 · Gestión de Usuarios y Autenticación · 3 pts · Responsable HU: Juan Esteban Panesso*

Como visitante, quiero registrarme con mis datos personales, para crear una cuenta y poder reservar canchas.

**Definition of Done — Criterios de aceptación:**

- Dado que soy un visitante en la página de registro, cuando ingreso nombre, correo, teléfono y contraseña válidos y envío el formulario, entonces el sistema crea mi cuenta y me redirige a la pantalla de inicio de sesión.
- Dado que ingreso un correo ya registrado, cuando envío el formulario, entonces el sistema muestra un error indicando que el correo ya existe y no crea una cuenta duplicada.
- Dado que dejo campos obligatorios vacíos o la contraseña no cumple la política mínima, cuando intento enviar el formulario, entonces el sistema muestra los errores de validación y no envía la solicitud.
- Dado un registro exitoso, cuando se consulta la base de datos, entonces la contraseña queda almacenada cifrada con bcrypt (RNF-03).

**Tareas técnicas asignadas:**

| Tarea técnica | Responsable |
|---|---|
| Modelar tabla Usuario y migración en PostgreSQL | Juan Sebastián Castillo |
| Endpoint POST /api/auth/registro | Juan Esteban Panesso |
| Formulario de registro (UI) | Samuel Rios Calderón |
| Casos de prueba de aceptación de registro | Byron Zapata |

#### US-02 · Inicio de sesión

*EPIC-01 · Gestión de Usuarios y Autenticación · 2 pts · Responsable HU: Juan Esteban Panesso*

Como usuario registrado, quiero iniciar sesión con mi correo y contraseña, para acceder a mis reservas.

**Definition of Done — Criterios de aceptación:**

- Dado que soy un usuario registrado, cuando ingreso mi correo y contraseña correctos, entonces el sistema me autentica y me redirige a mi panel de reservas.
- Dado que ingreso credenciales incorrectas, cuando envío el formulario de login, entonces el sistema muestra un mensaje de error genérico sin indicar cuál campo es incorrecto.
- Dado que obtengo un token válido al iniciar sesión, cuando navego a una ruta protegida, entonces el sistema me permite el acceso sin pedir credenciales de nuevo.
- Dado que no tengo token o el token es inválido, cuando intento acceder a una ruta protegida, entonces el sistema me redirige al login (RNF-03).

**Tareas técnicas asignadas:**

| Tarea técnica | Responsable |
|---|---|
| Endpoint POST /api/auth/login | Juan Esteban Panesso |
| Formulario de login y manejo de sesión (UI) | Samuel Rios Calderón |
| Casos de prueba de aceptación de login | Byron Zapata |

#### US-03 · Recuperación de contraseña

*EPIC-01 · Gestión de Usuarios y Autenticación · 3 pts · Responsable HU: Juan Esteban Panesso*

Como usuario registrado, quiero recuperar mi contraseña por correo electrónico, para retomar el acceso a mi cuenta si la olvidé.

**Definition of Done — Criterios de aceptación:**

- Dado que soy un usuario registrado y olvidé mi contraseña, cuando solicito la recuperación con mi correo, entonces el sistema envía un enlace/código de restablecimiento a ese correo.
- Dado que recibo el enlace de recuperación, cuando defino una nueva contraseña válida, entonces el sistema la actualiza y me permite iniciar sesión con la nueva contraseña.
- Dado que el enlace de recuperación ya expiró o fue usado, cuando intento usarlo de nuevo, entonces el sistema rechaza la solicitud y me pide generar uno nuevo.
- Dado que ingreso un correo que no está registrado, cuando solicito la recuperación, entonces el sistema muestra un mensaje neutro sin confirmar ni negar la existencia de la cuenta.

**Tareas técnicas asignadas:**

| Tarea técnica | Responsable |
|---|---|
| Endpoint de recuperación de contraseña | Juan Esteban Panesso |
| Configurar proveedor de correo (SMTP/API) | Juan Sebastián Castillo |
| Pantalla 'Olvidé mi contraseña' (UI) | Samuel Rios Calderón |
| Casos de prueba de aceptación de recuperación | Byron Zapata |

#### US-04 · Listado de canchas disponibles

*EPIC-02 · Catálogo de Canchas · 3 pts · Responsable HU: Samuel Rios Calderón*

Como usuario autenticado, quiero ver el listado de canchas disponibles con su nombre y dirección, para elegir dónde jugar.

**Definition of Done — Criterios de aceptación:**

- Dado que soy un usuario autenticado, cuando accedo a la sección de canchas, entonces el sistema muestra el listado de canchas con nombre y dirección.
- Dado que no hay canchas registradas, cuando accedo al listado, entonces el sistema muestra un mensaje indicando que no hay canchas disponibles.
- Dado que el listado tiene varias canchas, cuando cargo la página, entonces el sistema responde en menos de 2 segundos para el 95% de las solicitudes (RNF-01).
- Dado que accedo desde un dispositivo móvil o de escritorio, cuando visualizo el listado, entonces la interfaz se renderiza correctamente entre 360px y 1920px de ancho (RNF-05).

**Tareas técnicas asignadas:**

| Tarea técnica | Responsable |
|---|---|
| Modelar tabla Cancha y datos semilla | Juan Sebastián Castillo |
| Endpoint GET /api/canchas | Juan Esteban Panesso |
| Vista de listado de canchas (UI responsive) | Samuel Rios Calderón |
| Casos de prueba de aceptación del listado | Byron Zapata |

### Distribución de tareas por integrante

Todos los integrantes del equipo, incluyendo el Scrum Master, tienen al menos una tarea técnica asignada dentro del Sprint 1:

| Integrante | Rol en el equipo | HU a cargo | Tareas técnicas asignadas |
|---|---|---|---|
| Juan Esteban Panesso Bernal | Backend · Scrum Master | US-01, US-02, US-03 | 4 (endpoints de auth y canchas) |
| Samuel Rios Calderón | Frontend | US-04 | 4 (formularios y vistas UI) |
| Juan Sebastián Castillo Acevedo | Base de datos / Concurrencia | — | 3 (modelos de datos e integración de correo) |
| Byron Stiven Zapata Zapata | Documentación / QA | — | 4 (casos de prueba de aceptación) |

### Próximas ceremonias del Sprint

- **Daily Scrum:** reunión diaria de 10-15 min durante todo el Sprint, para sincronizar avance y detectar bloqueos. Las HU se mueven en el tablero Kanban de Jira según su estado (Por hacer / En curso / Hecho).
- **Reunión previa a la Review:** un día antes de la Sprint Review, el equipo se reúne para organizar la presentación de avances (máx. 20 minutos).
- **Sprint Review:** miércoles 9 de septiembre, 6:30-8:30 p.m. Demo en vivo de las HU completadas que cumplen su Definition of Done; el docente (Product Owner) valida y da retroalimentación.
- **Sprint Retrospective:** al finalizar el Sprint Review, para reflexionar sobre el proceso de trabajo del equipo y definir mejoras para el Sprint 2.

### Enlace al tablero

Tablero Jira del equipo: espacio CanchaYaUAO — proyecto PIG1. El docente Jorge Gonzalez Rivera (jorgonzalez@uao.edu.co) fue agregado como miembro del espacio.

---

## Implementación técnica (Sprint 1)

Arquitectura por capas en frontend y backend, ambos en JavaScript. Base de datos relacional: **PostgreSQL**, según lo planteado por el equipo en la exposición de arquitectura.

El repositorio contiene dos proyectos npm independientes, `backend/` y `frontend/`, cada uno con su propio `package.json`. No hay un `package.json` en la raíz: entra a cada carpeta para instalar dependencias y correrlos (ver comandos más abajo en cada sección).

### Backend — `backend/`

Node.js + Express, arquitectura por capas, PostgreSQL (driver `pg`, SQL parametrizado) como base de datos.

```
backend/src/
├── config/        # variables de entorno y conexión (pool de PostgreSQL)
├── db/            # esquema SQL (schema.sql) y script de migración
├── models/        # mapeo fila SQL -> objeto de dominio (Usuario, Cancha, PasswordResetToken)
├── repositories/  # acceso a datos (consultas SQL)
├── services/      # lógica de negocio (auth, canchas, email)
├── controllers/   # manejadores de rutas
├── routes/        # definición de endpoints
├── middlewares/   # validación, autenticación JWT, manejo de errores
├── utils/         # JWT, política de contraseñas, tokens de recuperación
└── seed/          # datos semilla de canchas
```

**Tablas:** `usuarios`, `canchas`, `password_reset_tokens` (ver [backend/src/db/schema.sql](backend/src/db/schema.sql)).

**Endpoints:**

| Método | Ruta | Descripción | Protegido |
|---|---|---|---|
| POST | `/api/auth/registro` | Registro de usuario (US-01) | No |
| POST | `/api/auth/login` | Inicio de sesión (US-02) | No |
| POST | `/api/auth/olvide-password` | Solicitar recuperación de contraseña (US-03) | No |
| POST | `/api/auth/restablecer-password` | Restablecer contraseña con token (US-03) | No |
| GET | `/api/canchas` | Listado de canchas disponibles (US-04) | Sí (JWT) |

**Configuración:** copiar `backend/.env.example` a `backend/.env` y completar `DATABASE_URL` (cadena de conexión de tu instancia PostgreSQL, ej. Neon/Supabase/Railway o una instalación local), `JWT_SECRET` y (opcionalmente) credenciales SMTP para el envío real de correos de recuperación. Sin SMTP configurado, el enlace de recuperación se imprime en la consola del servidor (modo desarrollo).

**Comandos:**

```bash
cd backend
npm install
npm run migrate        # crea las tablas (usuarios, canchas, password_reset_tokens)
npm run seed:canchas   # carga canchas de ejemplo
npm run dev            # http://localhost:4000
```

### Frontend — `frontend/`

React + Vite (JavaScript), arquitectura por capas.

```
frontend/src/
├── api/          # cliente axios y servicios de consumo de la API
├── context/      # estado global de autenticación
├── hooks/        # hooks reutilizables (useAuth)
├── components/   # componentes de layout y UI reutilizables
├── pages/        # pantallas: registro, login, recuperación, listado de canchas
├── router/       # enrutamiento y rutas protegidas
└── styles/       # estilos globales (responsive 360px–1920px)
```

**Configuración:** copiar `frontend/.env.example` a `frontend/.env` y ajustar `VITE_API_URL` si el backend no corre en `http://localhost:4000/api`.

**Comandos:**

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

---

## Sprint 2

**Sprint:** Sprint 2, del 10 al 29 de septiembre de 2026.

**Objetivo:** catálogo completo de canchas (US-05 y US-06), selección de fecha y hora (US-07), y repositorio GitHub con CI/CD inicial.

![Tablero Jira del Sprint 2](docs/img/sprint-2-backlog.png)

| ID | Historia de usuario | Épica | Pts | Estado |
|---|---|---|---|---|
| US-05 | Detalle de cancha | EPIC-02: Catálogo de Canchas | 5 | Aprobado |
| US-06 | Filtro de canchas | EPIC-02: Catálogo de Canchas | 5 | Aprobado |
| US-07 | Selección de fecha y hora | EPIC-03: Motor de Reservas | 3 | Aprobado |
| PIG1-21 | Repositorio GitHub y estrategia de ramas/CI-CD inicial | — | — | Aprobado |
| | **Total** | | **13 pts** | |

**Qué se implementó:**

- **US-05:** `GET /api/canchas/:id` devuelve el detalle de la cancha con sus horarios por día de la semana (tabla `horarios_disponibles`).
- **US-06:** `GET /api/canchas` acepta filtros por zona, rango de precio (`precioMin`, `precioMax`) y fecha.
- **US-07:** en el detalle de la cancha el usuario elige una fecha y un bloque de 1 hora dentro del horario de ese día. `GET /api/canchas/:id/reservas?fecha=` devuelve los bloques ocupados.
- **PIG1-21:** repositorio en GitHub con flujo de ramas documentado en [BRANCHING.md](BRANCHING.md) y un primer pipeline de CI que instalaba dependencias, corría las pruebas del backend y compilaba el frontend.

---

## Sprint 3

**Sprint:** Sprint 3, del 30 de septiembre al 13 de octubre de 2026.

**Objetivo:** motor de reservas. Validación de disponibilidad y bloqueo de duplicados (US-08 y US-09), flujo rápido de reserva (US-10), temporizador de sesión por socket (US-17) y plan de pruebas QA.

![Tablero Jira del Sprint 3](docs/img/sprint-3-backlog.png)

| ID | Historia de usuario | Épica | Pts | Estado |
|---|---|---|---|---|
| US-08 | Validación de disponibilidad | EPIC-03: Motor de Reservas | 8 | Listo |
| US-09 | Bloqueo de reserva duplicada | EPIC-03: Motor de Reservas | 8 | Listo |
| US-10 | Flujo rápido de reserva | EPIC-03: Motor de Reservas | 5 | Listo |
| US-17 | Temporizador de sesión de reserva (Socket) | EPIC-03: Motor de Reservas | 5 | Listo |
| PIG1-22 | Plan de pruebas y casos de prueba (QA) | — | — | En curso |
| | **Total** | | **26 pts** | |

**Qué se implementó:**

- **US-08 · Validación de disponibilidad**
  - `GET /api/canchas/:id/disponibilidad?fecha=` devuelve las franjas ocupadas. En pantalla aparecen como "No disponible" y no se pueden seleccionar.
  - El backend rechaza fechas u horas pasadas con `400`. Las horas se interpretan siempre en hora de Colombia (UTC-5), sin importar la zona del servidor.
  - En el frontend, los bloques de hoy cuya hora ya pasó también se muestran como "No disponible" y se actualizan solos a medida que avanza el reloj.
  - `PATCH /api/reservas/:id/cancelar` cancela una reserva y libera la franja.
- **US-09 · Bloqueo de reserva duplicada**
  - La base de datos tiene un índice único parcial `(cancha_id, fecha, hora_inicio) WHERE estado = 'activa'`, así que el bloqueo no depende solo del código.
  - `POST /api/canchas/:id/reservas` crea la reserva en una transacción. Si dos usuarios reservan la misma franja al mismo tiempo, uno recibe `201` y el otro `409` con el mensaje "El horario ya no está disponible".
  - El botón se deshabilita mientras la petición está en curso, para evitar el doble clic.
- **US-10 · Flujo rápido de reserva**
  - Un clic del listado al detalle. Al elegir fecha y bloque se habilita "Iniciar reserva", que muestra un resumen con cancha, fecha, horario, costo y usuario.
  - "Cambiar horario" vuelve atrás sin perder la selección, que además se conserva si la página se recarga.
- **US-17 · Temporizador de sesión (Socket.IO)**
  - Al entrar al detalle se abre un socket autenticado con el JWT; sin token válido, el servidor rechaza la conexión.
  - El servidor inicia una cuenta regresiva de 3 minutos, envía `expiresAt` y sincroniza cada 5 segundos. Al expirar se bloquea la selección y aparece el botón "Reiniciar temporizador".
  - `POST /api/canchas/:id/temporizador/completar` detiene el temporizador al entrar al panel de confirmación, solo si el bloque elegido no ha pasado.
- **Interfaz**
  - Rediseño visual con foto de cada cancha, descripción comercial y servicios incluidos.
  - Las fotos son de Wikimedia Commons, con licencias libres, y el crédito del autor se muestra en la ficha de cada cancha.
- **Pruebas automatizadas (backend):** 25 pruebas en 4 suites.
  - Servicio de reservas.
  - Temporizador.
  - Conversión de hora de Colombia.
  - Prueba de integración que dispara dos reservas simultáneas contra PostgreSQL.

---

## Sprint 4

**Sprint:** Sprint 4, del 14 al 27 de octubre de 2026.

**Objetivo:** flujo de reserva, confirmación, reservas múltiples e historial (US-11, US-12 y US-13), retención de franja en tiempo real (US-18), contenedorización y pipeline CI/CD con Docker (US-19 y US-20), documentación técnica de la API y SonarQube (US-21).

![Tablero Jira del Sprint 4](docs/img/sprint-4-backlog.png)

| ID | Historia de usuario | Épica | Pts | Estado |
|---|---|---|---|---|
| US-11 | Confirmación de reserva | EPIC-03: Motor de Reservas | 3 | En curso |
| US-12 | Reservas múltiples | EPIC-03: Motor de Reservas | 3 | Por hacer |
| US-13 | Historial de reservas | EPIC-03: Motor de Reservas | 3 | Por hacer |
| US-18 | Retención de franja y disponibilidad en tiempo real (Socket) | EPIC-03: Motor de Reservas | 5 | En curso |
| PIG1-23 | Documentación técnica de API (OpenAPI/Swagger) | — | — | En curso |
| US-19 | Contenedorización con Docker | — | 5 | En curso |
| US-20 | Pipeline CI/CD con Docker | — | 5 | En curso |
| US-21 | Integración de SonarQube y continuación de pruebas QA | — | 5 | Por hacer |
| | **Total** | | **29 pts** | |

### US-11 · Confirmación de reserva

- **Estado `confirmada`**
  - Las reservas se guardan con estado `confirmada`; las anteriores con estado `activa` se migran automáticamente al aplicar el esquema.
  - El índice único que impide duplicados (US-09) ahora aplica sobre las reservas confirmadas.
- **Respuesta del backend:** `POST /api/canchas/:id/reservas` responde `201` con el identificador, un código corto (por ejemplo `CY-5FF84EA7`), la cancha, la fecha, la hora y el estado.
- **Pantalla de confirmación**
  - Aparece solo después de que el backend confirma la reserva y muestra código, cancha, fecha, hora y estado.
  - Ofrece los accesos "Ver mis reservas" y "Hacer otra reserva"; esta última arranca un temporizador nuevo.
  - Si el backend falla, se muestra el error y no se informa éxito.
- **Temporizador:** al confirmar, la sesión del temporizador (US-17) se da por completada.
- **Doble clic:** un doble clic en "Confirmar reserva" envía una sola petición.
- **Correo de confirmación**
  - Se envía en segundo plano con el mismo resumen.
  - Si falla, la reserva sigue confirmada.
  - Sin SMTP configurado, el resumen se imprime en la consola del servidor.
- **Historial mínimo (base para US-13):** `GET /api/reservas/mias` y la página **Mis reservas** (`/mis-reservas`) listan las reservas del usuario con su código y estado.

### US-18 · Retención de franja y disponibilidad en tiempo real (Socket)

- **Retención de la franja**
  - Al elegir un bloque, el servidor lo retiene para el usuario y lo confirma por socket; en pantalla aparece "Apartamos las HH:mm para ti".
  - Cada usuario retiene como máximo una franja por cancha; al elegir otra, la anterior se libera.
- **Disponibilidad en tiempo real:** los demás usuarios que miran la cancha ven la franja "En proceso de reserva" sin recargar. También ven al instante cuando se libera o queda reservada.
- **Liberación:** la retención se libera cuando:
  - expira el temporizador;
  - el usuario sale de la cancha;
  - cambia de franja o de fecha;
  - pulsa "Cancelar y liberar la franja".
- **Confirmación (US-11):** la retención se convierte en reserva definitiva. La base no permite dos retenciones de la misma franja (índice único), igual que con las reservas (US-09).
- **Persistencia:** sesiones y retenciones se guardan en PostgreSQL (tablas `sesiones_reserva` y `retenciones`). Si el servidor se reinicia, el temporizador continúa con el mismo tiempo y la franja sigue retenida.
- **Aviso de 30 segundos:** cuando quedan 30 segundos, el temporizador muestra un aviso visual.
- **Prueba de carga:** [backend/scripts/pruebaCargaSockets.js](backend/scripts/pruebaCargaSockets.js) conecta 100 clientes simultáneos.
  - Verifica que no se pierdan ni se dupliquen eventos.
  - Verifica que, si 99 compiten por la misma franja, solo haya una retención y una reserva.
  - Corre en el pipeline de CI.
- **Documentación:** los eventos del socket (nombre, payload y errores) están en [docs/api/eventos-socket.md](docs/api/eventos-socket.md).

### US-19 · Contenedorización con Docker

- [backend/Dockerfile](backend/Dockerfile): imagen Node 22 Alpine que aplica el esquema de la base al arrancar y luego inicia la API.
- [frontend/Dockerfile](frontend/Dockerfile): compila la app con Vite y la sirve con nginx. [frontend/nginx.conf](frontend/nginx.conf) redirige las rutas de React Router (por ejemplo `/canchas/:id`) a `index.html`.
- [docker-compose.yml](docker-compose.yml): levanta tres servicios con healthcheck y los arranca en orden (`db` → `backend` → `frontend`).
  - `db`: PostgreSQL 16, en un contenedor propio y separado de Neon.
  - `backend`: la API.
  - `frontend`: la app servida con nginx.
- Las variables del entorno Docker van en un `.env` en la raíz (plantilla: [.env.example](.env.example)), que no se sube al repositorio.

### Documentación técnica de la API (OpenAPI / Swagger) · PIG1-23

La API está documentada con **OpenAPI 3.0**. La especificación es el archivo [backend/openapi/openapi.yaml](backend/openapi/openapi.yaml), versionado junto con el código.

**Swagger UI:** con el backend en marcha, abra `/api/docs`.

| Ambiente | Dirección |
|---|---|
| Desarrollo (`npm run dev`) | http://localhost:4000/api/docs |
| Docker Compose (staging local) | http://localhost:4100/api/docs |
| Producción | Apagada por defecto con `NODE_ENV=production`; el equipo decide si la activa con `API_DOCS_HABILITADA=true` |

La especificación también se descarga en `/api/docs/openapi.json` y `/api/docs/openapi.yaml`.

**Probar un endpoint ("Try it out")**
1. `POST /api/auth/registro` y luego `POST /api/auth/login`; copie el `token` de la respuesta.
2. Pulse **Authorize**, pegue solo el token (Swagger UI agrega `Bearer`) y confirme.
3. Los endpoints con candado ya usan ese token. Cada uno trae un ejemplo de cuerpo y de cada respuesta posible (200/201, 400, 401, 403, 404, 409, 429 y 500, según aplique).

**Qué cubre**
- Los 14 endpoints implementados, con método, ruta, descripción, parámetros, esquema del cuerpo y respuestas con ejemplos.
- Los modelos se definen una sola vez en `components/schemas` (`Usuario`, `Cancha`, `Reserva`, `Error`, entre otros) y se reutilizan.
- Los casos de error del motor de reservas: disponibilidad (US-08), reserva duplicada `409` (US-09), confirmación (US-11), reservas múltiples (US-12) e historial (US-13).
- Los eventos de Socket.IO (US-17 y US-18), con nombre, dirección, contenido y errores, en la sección *Socket.IO (tiempo real)* de la misma página y en [docs/api/eventos-socket.md](docs/api/eventos-socket.md).

**Cobertura: endpoints implementados contra documentados.** La tabla la genera `npm run docs:cobertura` leyendo las rutas reales de Express; el pipeline falla si baja del 90 %.

| Método | Ruta | Documentado |
|---|---|---|
| POST | `/api/auth/login` | Sí |
| POST | `/api/auth/olvide-password` | Sí |
| POST | `/api/auth/registro` | Sí |
| POST | `/api/auth/restablecer-password` | Sí |
| GET | `/api/canchas` | Sí |
| GET | `/api/canchas/{id}` | Sí |
| GET | `/api/canchas/{id}/disponibilidad` | Sí |
| GET | `/api/canchas/{id}/reservas` | Sí |
| POST | `/api/canchas/{id}/reservas` | Sí |
| POST | `/api/canchas/{id}/temporizador/completar` | Sí |
| GET | `/api/health` | Sí |
| GET | `/api/reservas` | Sí |
| PATCH | `/api/reservas/{id}/cancelar` | Sí |
| GET | `/api/reservas/mias` | Sí |

**14 de 14 endpoints documentados (100 %).**

**Cómo actualizar la documentación**
1. Al crear o cambiar un endpoint, edite [backend/openapi/openapi.yaml](backend/openapi/openapi.yaml) en el mismo PR: ruta, parámetros, cuerpo, respuestas y ejemplos. Reutilice los modelos de `components/schemas`.
2. Valide con `cd backend && npm run docs:lint` (Spectral, reglas en [backend/.spectral.yaml](backend/.spectral.yaml)).
3. Compruebe la cobertura con `npm run docs:cobertura`. Si agregó un endpoint y no lo documentó, falla.
4. Corra `npm test`: la prueba de contrato `openapiContrato.integration.test.js` ejecuta los ejemplos contra el backend real y verifica que cada respuesta cumpla el esquema publicado.

El pipeline ejecuta los pasos 2 y 3 en el job *Backend - lint y pruebas* (US-20), y el paso 4 junto con el resto de las pruebas.

### US-20 · Pipeline CI/CD con Docker

El pipeline está en [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml). Corre en cada PR a `main`, `develop` y `sprint_*`, y en cada push a esas ramas y a `feature/**` y `fix/**`.

| Job | Qué hace |
| --- | --- |
| Backend - lint y pruebas | `npm ci`, lint si existe el script, aplica el esquema a un Postgres temporal y corre `npm test`. La prueba de concurrencia de US-09 se ejecuta con base de datos real. |
| Frontend - lint y build | `npm ci`, `npm run lint` (ESLint sobre `.js` y `.jsx`) y `npm run build`. |
| Docker - build y smoke test | Construye las imágenes, levanta todo con `docker compose` y ejecuta [scripts/smoke-test.sh](scripts/smoke-test.sh): health, frontend, rutas SPA, CORS, 401 sin token, registro, login y listado de canchas. Después corre la prueba de carga de sockets con 100 conexiones (US-18). |
| SonarQube Quality Gate | Analiza backend y frontend con la cobertura de Jest y espera el resultado del Quality Gate. Necesita la variable `SONAR_HOST_URL` y el secreto `SONAR_TOKEN`. Si el servidor no responde (por ejemplo, un túnel de ngrok apagado) o faltan esos datos, el análisis se omite con un aviso y el pipeline continúa. |
| Desplegar en entorno local | Solo en push a `sprint_4` (rama de despliegue actual), en un self-hosted runner: `docker compose up -d --build`. |

### Evidencias

**Self-hosted runner** registrado en el equipo de despliegue y escuchando trabajos de GitHub Actions:

![Runner self-hosted conectado a GitHub](docs/img/runner-self-hosted.png)

**Docker Desktop** con el proyecto `canchaya` (db, backend y frontend) corriendo:

![Contenedores de CanchaYa en Docker Desktop](docs/img/docker-desktop-contenedores.png)

**Secretos del repositorio** usados por el job de despliegue. Los valores están cifrados por GitHub y no se ven:

![Secretos JWT_SECRET y POSTGRES_PASSWORD en GitHub](docs/img/github-secrets.png)

**Verificación local del pipeline:**

- Construcción de las imágenes y arranque del compose: los tres contenedores quedaron en estado *healthy*.
- Smoke test contra Docker: todas las verificaciones pasaron.
- Prueba en navegador sobre `http://localhost:8080`: registro, login, listado con fotos, temporizador por socket y reserva confirmada, sin errores de consola.
- Job de backend simulado con un Postgres temporal: 25/25 pruebas, incluida la de concurrencia.

### Pruebas de QA (plan, ejecución y resultados)

El plan de pruebas y los resultados están en [docs/testing/](docs/testing/), como documentos Word:

| Documento | Contenido |
|---|---|
| [01_Plan_de_Pruebas_QA.docx](docs/testing/01_Plan_de_Pruebas_QA.docx) | Alcance, estrategia, entorno, criterios de salida y matriz de trazabilidad HU/criterio ↔ caso |
| [02_Resultados_Pruebas_Funcionales.docx](docs/testing/02_Resultados_Pruebas_Funcionales.docx) | 72 casos de API y sockets por historia de usuario + 140 pruebas Jest |
| [03_Resultados_Pruebas_No_Funcionales.docx](docs/testing/03_Resultados_Pruebas_No_Funcionales.docx) | 21 casos: rendimiento, carga, seguridad, accesibilidad, compatibilidad, fiabilidad y mantenibilidad |
| [04_Resultados_Pruebas_E2E.docx](docs/testing/04_Resultados_Pruebas_E2E.docx) | 25 flujos en navegador con capturas |
| [05_Resultados_Smoke_Docker.docx](docs/testing/05_Resultados_Smoke_Docker.docx) | 24 casos de Docker, smoke test y análisis del pipeline |
| [06_Informe_Resumen_QA_y_Defectos.docx](docs/testing/06_Informe_Resumen_QA_y_Defectos.docx) | Conclusiones, veredicto frente a los criterios de salida y detalle de los 22 defectos |
| [07_Resultados_SonarQube.docx](docs/testing/07_Resultados_SonarQube.docx) | Análisis estático con SonarQube (US-21): Quality Gate, métricas, hallazgos y correcciones |
| [08_Verificacion_Documentacion_API.docx](docs/testing/08_Verificacion_Documentacion_API.docx) | Verificación de la documentación OpenAPI/Swagger (PIG1-23) contra sus criterios de aceptación |
| [09_Consolidado_de_Pruebas.docx](docs/testing/09_Consolidado_de_Pruebas.docx) | Total de pruebas realizadas y listado completo de todas ellas |

**Resultado de la regresión final (Sprint 5): 649 pruebas, 0 fallidas** (472 de Jest, 99 funcionales, 30 E2E, 24 no funcionales y 24 de Docker/pipeline; 6 casos con una observación de mejora). Incluye las historias US-14, US-27, US-28 y US-29. SonarQube: Quality Gate aprobado, 0 bugs, 0 vulnerabilidades, 0 puntos críticos de seguridad, 0 code smells y 95,9 % de cobertura (98,2 % en el código nuevo).

La primera ejecución detectó 10 defectos (guardada en [ejecucion-1-inicial](docs/testing/ejecucion-1-inicial/)). Tras unir las historias US-12, US-13 y US-21 aparecieron 5 más (DEF-11 a DEF-15), luego otros 4 (DEF-16 a DEF-19, hallazgos de SonarQube y del historial) y en la regresión del Sprint 5 aparecieron 3 más de interfaz (DEF-20 a DEF-22: desborde del menú del administrador, etiqueta accesible del enlace de perfil y tabla con scroll); los 22 están corregidos y verificados. Cada caso documenta la historia de usuario y el criterio que cubre, los pasos, el resultado esperado, el obtenido (incluidos los errores que el sistema debe devolver) y la evidencia. Los scripts que ejecutan las pruebas están en [qa/](qa/README.md) y corren sobre un entorno Docker aislado, sin tocar la base de Neon.

## Sprint 5

**Historias:** US-14 (cancelación de reserva propia), US-27 (perfil de usuario), US-28 (método de pago con tarjeta) y US-29 (verificación de código de reserva por el administrador).

| ID | Historia de usuario | Qué incluye |
|---|---|---|
| US-14 | Cancelación de reserva propia | Botón «Cancelar reserva» con confirmación, regla de **2 horas** de anticipación, correo y aviso en pantalla, reembolso automático si estaba pagada |
| US-27 | Perfil de usuario | «Mi perfil»: datos personales, cambio de contraseña y cambio de correo con verificación por enlace |
| US-28 | Método de pago con tarjeta | Tarjetas tokenizadas por una pasarela, pago opcional al reservar y rechazo sin confirmar la reserva |
| US-29 | Verificación de código de reserva (admin) | Panel de administración: verificar el código, marcar la reserva como utilizada y auditoría |

### US-16 · Cancelación administrativa

Un administrador puede cancelar cualquier reserva futura con al menos 2 horas de anticipación y un motivo obligatorio.

- **Rol:** la tabla `usuarios` tiene la columna `rol` (`usuario` por defecto o `administrador`). El rol se consulta en la base de datos en cada petición a `/api/admin`, no se guarda en el token.
- **Crear un administrador:** `npm run admin:promover -- correo@dominio.com` convierte en administrador una cuenta ya registrada; `npm run crear:admin -- correo@dominio.com` hace lo mismo y, si la cuenta no existe, la crea (ver US-29). En ambos casos, después de `npm run migrate`.
- **Endpoints** (ver Swagger en `/api/docs`):
  - `GET /api/admin/reservas?canchaId=&fecha=&usuario=` busca reservas futuras por cancha, fecha o usuario (nombre o correo).
  - `PATCH /api/admin/reservas/{id}/cancelar` con `{ "motivo": "..." }`. Si faltan menos de 2 horas responde 409 con el código `CANCELACION_FUERA_DE_PLAZO` y el motivo de la restricción.
- **Efectos de cancelar:** la reserva pasa a `cancelada_administrativamente`, la franja queda libre (evento `disponibilidad:liberada`), el usuario recibe un correo con el motivo y se guarda un registro en `cancelaciones_administrativas` (administrador, fecha y hora, motivo) dentro de la misma transacción.
- **Interfaz:** los administradores ven el enlace "Administración" en la barra, que abre el panel `/admin` (verificación de códigos, US-29) con un acceso a `/admin/reservas` (cancelación de reservas, US-16).

### US-14 · Cancelación de reserva propia

- Desde «Mis reservas», una reserva confirmada tiene el botón **Cancelar reserva**, que pide confirmación antes de ejecutar la acción.
- Solo se puede cancelar con **al menos 2 horas** de anticipación al inicio (configurable con `HORAS_MIN_CANCELACION`). Si faltan menos, el sistema bloquea la acción y explica la restricción (`409 CANCELACION_FUERA_DE_PLAZO`). El servidor decide: el historial incluye `puedeCancelar` y la regla se vuelve a comprobar al cancelar.
- Al cancelar, la franja queda **disponible de inmediato** (los demás usuarios la ven libre en tiempo real) y se muestra un aviso en pantalla; también se envía un **correo** con el detalle.
- Cancelar la reserva de otro usuario responde **403** y no la modifica.
- Si la reserva se pagó con tarjeta (US-28), el pago se **reembolsa por completo** dentro de la misma operación; si el reembolso falla, la reserva sigue confirmada.

### US-27 · Perfil de usuario

- Pantalla **Mi perfil** (`/perfil`) con nombre, teléfono y correo, y endpoints `GET/PATCH /api/usuarios/{id}`.
- Los datos inválidos (teléfono de 7 a 15 dígitos, campos vacíos) no se guardan y el error aparece **junto a cada campo**.
- **Cambio de correo con verificación:** `POST /api/usuarios/{id}/correo` envía un enlace al correo nuevo y el correo de la cuenta cambia solo cuando se abre (`POST /api/auth/verificar-correo`). Se rechazan los correos que ya usa otra cuenta. Sin SMTP configurado, el enlace se imprime en el log del backend.
- **Cambio de contraseña:** `PATCH /api/usuarios/{id}/password` exige la contraseña actual y que la nueva cumpla la política (mínimo 8 caracteres, una letra y un número); los intentos fallidos se limitan.
- Un usuario solo puede ver y editar su propio perfil: con el `id` de otro, el backend responde **403**.
- La vista es responsive (360 a 1920 px).

### US-28 · Método de pago con tarjeta

- **Seguridad:** el número completo y el CVV **nunca se guardan**. Viajan solo hasta la pasarela, que devuelve un token; en la base de datos quedan el token, la marca y los últimos 4 dígitos. La API solo devuelve la tarjeta enmascarada.
- **Validación:** número válido según Luhn y de una marca conocida, tarjeta no vencida y CVV correcto, con el error de cada campo y sin repetir los datos ingresados.
- **Pago opcional:** al confirmar una reserva se puede elegir una tarjeta guardada; el valor de la hora se cobra en la misma operación. Sin tarjeta se reserva como siempre (pago en la cancha). Si el pago es **rechazado** (`402`), la reserva no se confirma y se explica el motivo para reintentar con otro método.
- Al eliminar una tarjeta se borra el token de la pasarela y deja de ofrecerse; las reservas ya pagadas no se ven afectadas.
- **HTTPS:** con `EXIGIR_HTTPS_PAGOS=true` las rutas de tarjetas responden `426` si la conexión no es HTTPS (detrás de un proxy con TLS, activar también `TRUST_PROXY=true`). El formulario además se bloquea en una conexión HTTP que no sea localhost.
- **Pasarela:** por defecto es una **pasarela simulada** (`PASARELA_PAGO=simulada`), sin credenciales ni internet. Tarjetas de prueba: `4242 4242 4242 4242` se aprueba, `4000 0000 0000 0002` la rechaza el banco y `4000 0000 0000 9995` simula fondos insuficientes. Para usar una real (Stripe, Wompi, PayU) basta con añadir un módulo en [backend/src/services/pasarelas](backend/src/services/pasarelas) que cumpla el mismo contrato que [simulada.js](backend/src/services/pasarelas/simulada.js). Con una pasarela real, el formulario de tarjeta debería usar los campos seguros que ella provee, de modo que el número no pase por el servidor.

### US-29 · Verificación de código de reserva (administrador)

- Cada reserva tiene un código único `CY-XXXXXXXX`, garantizado por la base de datos, que se muestra al usuario al confirmar y en su historial.
- Los administradores ven en el menú **Administración** (`/admin`) la sección «Verificar código de reserva». Al ingresar el código:
  - **Vigente:** reserva confirmada cuyo horario aún no termina; muestra cancha, fecha, horario y nombre del usuario.
  - **No vigente:** con el motivo (`vencida`, `cancelada` o `usada`).
  - **Código no encontrado:** igual para un código inexistente o mal escrito, sin revelar datos de otras reservas.
- **Marcar como utilizada:** una reserva vigente marcada como utilizada ya no puede validarse como vigente; si dos administradores la marcan a la vez, solo uno lo logra.
- Solo los usuarios con rol `administrador` pueden usar estas rutas (`403` en otro caso) y no ven la sección. El rol se consulta en la base de datos en cada petición.
- **Auditoría:** cada verificación queda registrada (administrador, código, resultado y fecha/hora) y se lista en el panel y en `GET /api/admin/verificaciones`.
- **Crear un administrador** (nunca se hace desde el registro público):

  ```bash
  # promover una cuenta existente
  npm run crear:admin -- correo@ejemplo.com
  # crear una cuenta nueva con rol de administrador
  ADMIN_PASSWORD='ClaveSegura123' npm run crear:admin -- correo@ejemplo.com "Nombre Apellido"
  # en Docker
  docker compose exec backend node src/seed/crearAdministrador.js correo@ejemplo.com
  ```

### Base de datos y configuración

- El esquema ([backend/src/db/schema.sql](backend/src/db/schema.sql)) agrega las tablas `metodos_pago`, `pagos`, `cambios_correo` y `verificaciones_reserva`, la columna `usuarios.rol`, y en `reservas` las columnas `codigo` (única) y `usada_at`. Es idempotente: se aplica al arrancar el backend en Docker, y en Neon con `npm run migrate`.
- Variables nuevas (ver [backend/.env.example](backend/.env.example)): `HORAS_MIN_CANCELACION`, `EMAIL_CHANGE_TOKEN_EXPIRES_MIN`, `PASARELA_PAGO`, `EXIGIR_HTTPS_PAGOS` y `TRUST_PROXY`.
- La API documentada en Swagger (`/api/docs`) incluye los endpoints nuevos: perfil, métodos de pago y administración.
- **Más canchas de ejemplo en Cali:** `npm run seed:mas-canchas` (en `backend/`) agrega 59 canchas en las zonas Norte, Sur, Oeste, Oriente y Centro, con tipos, precios, servicios y horarios variados. **Solo agrega**: no borra nada y se puede repetir sin duplicar (a diferencia de `seed:canchas`, que reemplaza todo el catálogo y, por la cascada, también las reservas). En Docker: `docker compose exec backend node src/seed/seedMasCanchas.js`. Los nombres y direcciones son inventados, y las fotos reutilizan las 5 del catálogo base.
