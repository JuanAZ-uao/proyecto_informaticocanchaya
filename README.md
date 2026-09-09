# CanchaYa — Sistema de reserva de canchas sintéticas

Proyecto Informático 1 — Universidad Autónoma de Occidente, Facultad de Ingeniería, 2026-2.

## Integrantes

- Samuel Rios Calderón (2230205)
- Juan Esteban Panesso Bernal (2215930)
- Juan Sebastian Castillo Acevedo (2231921)
- Byron Stiven Zapata Zapata (2210718)

**Docente:** Jorge Gonzalez Rivera

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
