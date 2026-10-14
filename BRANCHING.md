# Flujo de ramas y commits — CanchaYa

## Ramas

- **main**: versión estable, validada en el Sprint Review. Nadie hace push directo.
- **sprint_N** (`sprint_3`, `sprint_4`, …): rama de integración del sprint. Recibe las HU mediante Pull Request y no admite push directo.
- **feature/us-<n>-<descripcion>**: una rama por historia de usuario o tarea técnica.
  Ejemplos: `feature/us-13-historial-reservas`, `US-12/Reservas_multiples`.
- **fix/<descripcion>**: corrección de un defecto puntual. Ejemplo: `fix/validacion-correo-duplicado`.
- **qa/<descripcion>**: pruebas y documentación de QA. Ejemplo: `qa/sprint-3-testing`.

```
main      o---------------------------------o   validada en el Sprint Review
           \                               /
sprint_N    o----o-----------o-----------o--o   integración del sprint
                  \         / \         /
feature/us-xx      o---o---o   \       /        una rama por HU
                                o-----o         fix/ o qa/
```

## Reglas

1. Las ramas de trabajo salen de la rama del sprint vigente (`sprint_N`), nunca de `main`.
2. Todo cambio entra por **Pull Request**, revisado por al menos un integrante distinto del autor.
3. El PR describe qué HU o tarea resuelve y cómo se probó, y los checks del pipeline deben estar en verde.
4. Se fusiona con **Create a merge commit** para conservar los commits de la HU y el punto de integración.
5. Antes de abrir el PR se actualiza la rama: `git fetch origin` y `git merge origin/sprint_N`. Si hay conflictos se resuelven en la rama de trabajo, se verifican con las pruebas y se agregan solo los archivos resueltos.
6. `main` solo recibe `sprint_N` cuando el Sprint Review valida el incremento.
7. La relación HU → rama → commits debe ser trazable.

## Convención de commits

`<tipo>(<alcance>): <descripción corta en imperativo y minúscula>` (unos 50 caracteres). Un commit es un cambio lógico.

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `build`, `ci`, `chore`, `perf`.

Ejemplos:

- `feat(us-13): agregar historial de reservas paginado`
- `fix(reservas): rechazar reservas fuera del horario de la cancha`
- `docs(api): documentar los endpoints con OpenAPI`
- `ci: validar la especificación OpenAPI con Spectral`
