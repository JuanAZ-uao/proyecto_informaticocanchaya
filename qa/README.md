# Pruebas QA automatizadas de CanchaYa

Scripts que ejecutan el plan de pruebas descrito en [docs/testing/01_Plan_de_Pruebas_QA.docx](../docs/testing/01_Plan_de_Pruebas_QA.docx) y generan los documentos de resultados de la misma carpeta.

| Script | Qué hace |
|---|---|
| `smoke.mjs 1` / `smoke.mjs 2` | Smoke de Docker (US-19 y US-20): construcción desde cero, arranque, salud, seguridad de imágenes, smoke del pipeline, análisis del workflow. La fase 2 prueba persistencia y recuperación y **elimina** el entorno de pruebas. |
| `funcionales.mjs` | Casos de API REST y Socket.IO por historia de usuario, con verificación directa en la base de datos. Incluye una prueba de 180 s reales. |
| `e2e.mjs` | Flujos completos en navegador (Playwright + Chromium) con capturas de pantalla. Incluye una prueba de 3 minutos reales. |
| `nofuncionales.mjs` | Rendimiento, carga (100 y 250 sockets), seguridad, accesibilidad (axe-core), responsive, compatibilidad (Chromium, Firefox, WebKit), fiabilidad y mantenibilidad. |
| `jest.mjs` | Pruebas unitarias y de integración del backend (Jest) con cobertura, contra un PostgreSQL temporal. |
| `entorno.mjs` | Registra versiones del sistema y de las herramientas. |
| `sonar.mjs` | Levanta un SonarQube Community local en Docker, genera la cobertura del backend, ejecuta sonar-scanner con `sonar-project.properties` y guarda el Quality Gate, métricas y hallazgos en `resultados/sonar-<n>.json`. `node sonar.mjs --bajar` elimina el contenedor. |
| `generar-docs.mjs` | Genera los documentos Word 01 a 06 en `docs/testing/` a partir de `resultados/*.json`. |
| `generar-extra.mjs` | Genera el documento 07 (SonarQube) y el 08 (verificación de la documentación OpenAPI/Swagger). |

## Seguridad del entorno

Todo corre en un proyecto de Docker Compose **aislado** (`canchaya-qa`, API en el puerto 4300 y frontend en el 8380) con su propia base PostgreSQL. **Nunca** se usa la base compartida de Neon ni se toca el despliegue del pipeline (proyecto `canchaya`). Las pruebas crean usuarios y reservas propios en cada ejecución.

## Requisitos

- Node.js 22 y Docker Desktop encendido (con `docker compose`).
- Puertos 4300, 8380, 5434, 5435 (cobertura para SonarQube) y 9000 (SonarQube) libres. La prueba de límite de reservas usa temporalmente el 4301 y la de documentación el 4302.

## Cómo ejecutarlas

```bash
cd qa
npm install
npm run browsers            # una sola vez: descarga Chromium, Firefox y WebKit

npm run smoke:1             # construye y levanta el entorno de pruebas (tarda unos minutos)
npm run jest                # pruebas del backend con cobertura
npm run funcionales
npm run e2e
npm run nofuncionales
npm run entorno             # versiones usadas (con el entorno todavía arriba)
npm run smoke:2             # persistencia y limpieza; deja el entorno eliminado
npm run sonar:1             # análisis de SonarQube (descarga ~1 GB la primera vez)
npm run docs                # regenera los Word en ../docs/testing
```

O todo el plan de una vez, en ese orden: `./ejecutar-todo.sh`.

Los resultados quedan en `qa/resultados/` (se ignora en git). Para repetir solo algunos casos, defina `SOLO` con sus identificadores; el resultado reemplaza al anterior:

```bash
SOLO=F-08-07,F-08-08 npm run funcionales
```

`generar-docs.mjs` también lee `datos/defectos.json` y `datos/ajustes.json`, que se redactan a mano después de revisar los resultados. Si existe `resultados-ejecucion-1/` (copia de una ejecución anterior) el informe compara ambas ejecuciones.

Si `docker` no está en el PATH, defina `DOCKER_BIN` con la carpeta que contiene `docker.exe`.

## Notas

- Las pruebas de tiempo real son lentas a propósito (esperan los 180 s del temporizador); el conjunto completo tarda unos 25 minutos.
- La prueba de caída de la base de datos (NF-18) detiene y vuelve a iniciar el contenedor de la base del entorno de pruebas.
- Las capturas de pantalla de la evidencia del pipeline (SD-17) se toman de [docs/img](../docs/img).
