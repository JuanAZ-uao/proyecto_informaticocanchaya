# Flujo de ramas — CanchaYa

## Ramas principales

- **main**: código estable, correspondiente a lo ya entregado y validado por el docente/PO. Nadie hace push directo aquí.
- **develop**: rama de integración. Todas las features aprobadas se fusionan primero aquí antes de pasar a `main`.

## Ramas de trabajo

- **feature/<descripcion-corta>**: una rama por historia de usuario o tarea técnica.
  Ejemplo: `feature/us-05-crear-reserva`, `feature/ci-cd-pipeline`.
- **fix/<descripcion-corta>**: corrección de errores puntuales.
  Ejemplo: `fix/validacion-correo-duplicado`.

## Reglas

1. Ninguna rama se crea directamente desde `main`; siempre se parte de `develop` (o de la rama de sprint vigente mientras el equipo la use).
2. Todo cambio entra por **Pull Request**, revisado por al menos un integrante distinto al autor.
3. El PR debe describir qué HU o tarea resuelve y cómo se probó.
4. `main` solo recibe merges desde `develop`, y únicamente cuando el Sprint Review valida el incremento.
5. Antes de abrir un PR, la rama debe estar actualizada con `develop` (`git pull origin develop` + resolución de conflictos si aplica).

## Convención de commits

Mensajes cortos y descriptivos, en español, en modo imperativo:
`Agrega endpoint de creación de reserva`, `Corrige validación de horario duplicado`.
