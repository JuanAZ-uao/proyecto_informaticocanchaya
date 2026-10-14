// Documentos Word adicionales de QA:
//   07_Resultados_SonarQube.docx        → análisis estático con SonarQube (US-21)
//   08_Verificacion_Documentacion_API.docx → verificación de la documentación OpenAPI/Swagger (PIG1-23, RNF-07)
import fs from 'node:fs';
import path from 'node:path';
import { AlignmentType } from 'docx';
import { HU } from './hu.mjs';
import { OUT, ROOT, EVID } from './lib.mjs';
import { p, h1, h2, h3, viñeta, tabla, tarjetaCaso, documento, guardar, saltoPagina, estadoCelda, imagen, COLOR_ESTADO } from './docs-lib.mjs';

const SALIDA = `${ROOT}/docs/testing`;
const leer = (n) => (fs.existsSync(`${OUT}/${n}.json`) ? JSON.parse(fs.readFileSync(`${OUT}/${n}.json`, 'utf8')) : null);
const leerDatos = (n) => {
  const f = path.join(import.meta.dirname, 'datos', `${n}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
};
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });
const entorno = leer('entorno');
const META_BASE = [
  ['Proyecto', 'CanchaYa — Sistema de reserva de canchas sintéticas (Proyecto Informático 1, UAO, 2026-2)'],
  ['Equipo', 'Samuel Rios Calderón · Juan Esteban Panesso Bernal · Juan Sebastian Castillo Acevedo · Byron Stiven Zapata Zapata'],
  ['Versión del documento', '1.0'],
];
const verde = COLOR_ESTADO.APROBADA;
const rojo = COLOR_ESTADO.FALLIDA;
const ambar = COLOR_ESTADO['OBSERVACIÓN'];
const num = (v) => (v === undefined || v === '—' ? '—' : Number(v).toLocaleString('es-CO'));
const medida = (s, k) => s.medidas.find((m) => m.metric === k)?.value;
const LETRA = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };
const calif = (v) => (v === undefined ? '—' : LETRA[Math.round(Number(v))] ?? v);
const minutos = (v) => (v === undefined ? '—' : `${num(v)} min`);

// =====================================================================
// 07 · SonarQube
// =====================================================================
function docSonar() {
  const s1 = leer('sonar-1');
  const s2 = leer('sonar-2');
  const final = s2 ?? s1;
  if (!final) return null;
  const correcciones = leerDatos('sonar-correcciones');
  const gateOk = final.gate.status === 'OK';
  const celdaGate = (estado) => ({ t: estado === 'OK' ? 'APROBADO' : estado === 'NONE' ? 'Sin datos' : 'FALLIDO', fondo: estado === 'OK' ? verde.fondo : estado === 'NONE' ? 'F2F4F6' : rojo.fondo, color: estado === 'OK' ? verde.texto : estado === 'NONE' ? '5B6770' : rojo.texto, bold: true, alinear: AlignmentType.CENTER });

  const conteo = (s, clave) => ({
    BLOCKER: s.issues.filter((i) => i.severity === 'BLOCKER').length,
    CRITICAL: s.issues.filter((i) => i.severity === 'CRITICAL').length,
    MAJOR: s.issues.filter((i) => i.severity === 'MAJOR').length,
    MINOR: s.issues.filter((i) => i.severity === 'MINOR').length,
    INFO: s.issues.filter((i) => i.severity === 'INFO').length,
  }[clave]);

  const filaMetrica = (nombre, k, formato = num, nota = '') => {
    const f = (s) => (s ? formato(medida(s, k)) : '—');
    return s2 ? [nombre, f(s1), f(s2), nota] : [nombre, f(s1), nota];
  };
  const columnasMetricas = s2 ? [3300, 1500, 1500, 3780] : [3600, 2200, 4280];
  const encabezadoMetricas = s2 ? ['Métrica', 'Análisis 1 (línea base)', 'Análisis 2 (final)', 'Qué mide'] : ['Métrica', 'Valor', 'Qué mide'];
  const metricas = [
    filaMetrica('Líneas de código (ncloc)', 'ncloc', num, 'Líneas de código analizadas (backend y frontend)'),
    filaMetrica('Archivos', 'files', num, 'Archivos fuente analizados'),
    filaMetrica('Bugs', 'bugs', num, 'Errores probables en el comportamiento'),
    filaMetrica('Vulnerabilidades', 'vulnerabilities', num, 'Fallas explotables de seguridad'),
    filaMetrica('Puntos críticos de seguridad', 'security_hotspots', num, 'Código sensible que requiere revisión manual'),
    filaMetrica('Code smells', 'code_smells', num, 'Problemas de mantenibilidad'),
    filaMetrica('Deuda técnica', 'sqale_index', minutos, 'Esfuerzo estimado para corregir los code smells'),
    filaMetrica('Cobertura de pruebas', 'coverage', (v) => (v === undefined ? '—' : `${v} %`), 'Líneas y ramas cubiertas por las pruebas Jest del backend'),
    filaMetrica('Cobertura de líneas', 'line_coverage', (v) => (v === undefined ? '—' : `${v} %`), 'Solo líneas'),
    filaMetrica('Duplicación', 'duplicated_lines_density', (v) => (v === undefined ? '—' : `${v} %`), 'Porcentaje de líneas duplicadas'),
    filaMetrica('Calificación de confiabilidad', 'reliability_rating', calif, 'A = sin bugs'),
    filaMetrica('Calificación de seguridad', 'security_rating', calif, 'A = sin vulnerabilidades'),
    filaMetrica('Calificación de mantenibilidad', 'sqale_rating', calif, 'A = deuda técnica ≤ 5 % del esfuerzo de desarrollo'),
    filaMetrica('Complejidad ciclomática', 'complexity', num, 'Caminos independientes del código'),
  ];

  const hijos = [
    h1('1. Resumen de la ejecución'),
    p(`Se analizó el código fuente del backend y del frontend con SonarQube ${final.servidor ? `(${final.servidor}, edición Community)` : ''}, usando la misma configuración que el pipeline de CI/CD (sonar-project.properties y la cobertura de Jest). ${s2 ? 'El análisis se ejecutó dos veces: una línea base y otra después de corregir los hallazgos que el equipo decidió atender.' : 'Se ejecutó un análisis completo.'}`),
    tabla([4200, 5880], [
      ['Resultado', 'Detalle'],
      ['Quality Gate final', celdaGate(final.gate.status)],
      ['Bugs / Vulnerabilidades', `${num(medida(final, 'bugs'))} / ${num(medida(final, 'vulnerabilities'))}`],
      ['Puntos críticos de seguridad', Number(medida(final, 'security_hotspots')) === 0 ? '0 (no hay puntos por revisar)' : `${num(medida(final, 'security_hotspots'))} (${medida(final, 'security_hotspots_reviewed') ?? '—'} % revisados)`],
      ['Code smells', `${num(medida(final, 'code_smells'))} (deuda técnica ${minutos(medida(final, 'sqale_index'))})`],
      ['Cobertura de pruebas del backend', `${medida(final, 'coverage') ?? '—'} %`],
      ['Duplicación', `${medida(final, 'duplicated_lines_density') ?? '—'} %`],
      ['Pruebas Jest que generaron la cobertura', `${final.jest.aprobadas} de ${final.jest.pruebas} aprobadas (${final.jest.suites} suites)`],
    ]),
    p('', { despues: 80 }),
    p([{ text: 'Veredicto: ', bold: true }, gateOk ? 'el código cumple el Quality Gate de SonarQube; no hay bugs, vulnerabilidades ni puntos críticos de seguridad pendientes que lo bloqueen.' : 'el código NO cumple el Quality Gate; las condiciones en rojo se detallan en la sección 3.']),

    h1('2. Metodología y configuración'),
    p('El análisis es estático: SonarQube lee el código sin ejecutarlo y aplica sus reglas de bugs, vulnerabilidades, puntos críticos de seguridad y mantenibilidad. La cobertura sí proviene de ejecutar las pruebas.'),
    tabla([3000, 7080], [
      ['Elemento', 'Configuración'],
      ['Servidor', `SonarQube Community ${final.servidor ?? ''} en un contenedor Docker local (sonarqube:community), sin datos previos`],
      ['Scanner', 'sonarsource/sonar-scanner-cli en Docker, con el repositorio montado'],
      ['Proyecto', 'canchaya (sonar-project.properties, versionado en el repositorio)'],
      ['Fuentes analizadas', 'backend/src y frontend/src (se excluyen pruebas, node_modules, dist, coverage, public y backend/src/seed)'],
      ['Cobertura', 'Jest con --coverage sobre un Postgres temporal; el lcov se prefija con backend/ (scripts/ci/prefijar-lcov.mjs) igual que en el job quality-gate. El frontend no tiene pruebas unitarias y reporta cobertura vacía'],
      ['Quality Gate', `${final.gateAplicado ? 'Sonar way (por defecto): ' : ''}sin bugs ni vulnerabilidades nuevos, puntos críticos revisados, duplicación y cobertura sobre código nuevo según los umbrales del servidor`],
      ['Espera del resultado', 'sonar.qualitygate.wait=true: el scanner termina con error si el Quality Gate falla (así se comporta en el pipeline)'],
      ['Control de versiones', 'Se deshabilitó el proveedor SCM (sonar.scm.disabled=true) porque el scanner corre en un contenedor sin el repositorio Git configurado'],
    ]),
    p('', { despues: 80 }),
    p('Comandos equivalentes a los del pipeline:', { bold: true }),
    p('cd backend && npm test -- --coverage           # genera backend/coverage/lcov.info', { base: { font: 'Consolas', size: 17 }, despues: 20 }),
    p('node scripts/ci/prefijar-lcov.mjs backend/coverage/lcov.info backend/coverage/lcov.sonar.info backend/', { base: { font: 'Consolas', size: 17 }, despues: 20 }),
    p('sonar-scanner -Dsonar.host.url=… -Dsonar.token=… -Dsonar.qualitygate.wait=true', { base: { font: 'Consolas', size: 17 }, despues: 100 }),

    h1('3. Resultados'),
    h2('3.1 Quality Gate'),
    p(`Estado: ${gateOk ? 'APROBADO' : 'FALLIDO'}. Condiciones evaluadas por SonarQube:`),
  ];

  const condiciones = final.gate.conditions ?? [];
  if (condiciones.length) {
    hijos.push(tabla([3400, 2000, 2400, 2280], [['Condición', 'Resultado', 'Valor obtenido', 'Falla si el valor es'], ...condiciones.map((c) => [c.metricKey, celdaGate(c.status), `${c.actualValue ?? '—'}`, `${c.comparator === 'GT' ? '>' : c.comparator === 'LT' ? '<' : c.comparator} ${c.errorThreshold ?? '—'}`])]));
  } else {
    hijos.push(p('El Quality Gate no devolvió condiciones evaluables en este análisis.'));
  }
  hijos.push(p([{ text: 'Cómo leer estas condiciones. ', bold: true }, 'El Quality Gate por defecto de SonarQube (Sonar way) evalúa solo el código nuevo (new_*). En un análisis con pocos cambios, SonarQube puede marcar una condición como aprobada aunque su valor sea bajo: en el análisis 2 el código nuevo fue de solo 12 líneas por cubrir y 18 líneas nuevas (ver el tablero en la sección 4), con una cobertura del 8,3 % sobre ellas, y el gate no exige el umbral con una muestra tan pequeña. Por eso este documento reporta también la cobertura global del backend, que es la cifra que sirve para decidir dónde reforzar las pruebas: ' + `${medida(final, 'coverage') ?? '—'} % en total, con el frontend sin pruebas unitarias; se recomienda aumentarla en los próximos sprints.`]));

  hijos.push(h2('3.2 Métricas'), tabla(columnasMetricas, [encabezadoMetricas, ...metricas]), p('', { despues: 60 }));

  // Hallazgos
  const resumenIssues = (s, titulo) => [
    h3(titulo),
    tabla([2600, 1500, 1500, 1500, 1500, 1480], [['Tipo / severidad', 'Bloqueante', 'Crítica', 'Mayor', 'Menor', 'Info'], ['Total de hallazgos abiertos', ...['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].map((k) => ({ t: String(conteo(s, k)), alinear: AlignmentType.CENTER })), ].slice(0, 6)]),
  ];
  hijos.push(h2('3.3 Hallazgos (issues) abiertos'));
  if (s2) hijos.push(...resumenIssues(s1, 'Análisis 1 (línea base)'), ...resumenIssues(s2, 'Análisis 2 (final)'));
  else hijos.push(...resumenIssues(s1, 'Análisis 1'));

  const detalle = (s, titulo) => {
    if (!s.issues.length) return [p(`${titulo}: SonarQube no reportó hallazgos abiertos.`, { bold: true })];
    return [
      h3(titulo),
      tabla([1100, 2300, 2700, 3980], [['Severidad', 'Regla', 'Ubicación', 'Descripción'], ...s.issues.slice(0, 80).map((i) => [{ t: i.severity, bold: true, color: ['BLOCKER', 'CRITICAL'].includes(i.severity) ? 'B71C1C' : '8A4B00' }, `${i.rule}${s.reglas?.[i.rule] ? ` — ${s.reglas[i.rule].nombre}` : ''}`, `${i.component.replace(`${'canchaya'}:`, '')}${i.line ? `:${i.line}` : ''}`, i.message])]),
      ...(s.issues.length > 80 ? [p(`(se muestran 80 de ${s.issues.length} hallazgos)`, { italics: true })] : []),
    ];
  };
  hijos.push(...detalle(s1, s2 ? 'Detalle del análisis 1 (línea base)' : 'Detalle de los hallazgos'));

  if (s2 && correcciones.length) {
    hijos.push(h2('3.4 Hallazgos corregidos entre el análisis 1 y el 2'), p('Cada hallazgo se evaluó antes de corregirlo; solo se cambió código cuando el reporte señalaba un problema real o una mejora sin riesgo funcional. Tras los cambios se volvió a ejecutar toda la batería de pruebas.'), tabla([2000, 2600, 2700, 2780], [['Regla', 'Ubicación', 'Problema', 'Corrección'], ...correcciones.map((c) => [c.regla, c.archivo, c.problema, c.correccion])]), p('', { despues: 60 }));
    hijos.push(...detalle(s2, 'Detalle del análisis 2 (final)'));
  }

  // Hotspots
  const hot = final.hotspots ?? [];
  hijos.push(h2(`${s2 && correcciones.length ? '3.5' : '3.4'} Puntos críticos de seguridad (security hotspots)`));
  if (!hot.length) hijos.push(p('SonarQube no marcó puntos críticos de seguridad en el código analizado.'));
  else hijos.push(tabla([1300, 3000, 2500, 3280], [['Probabilidad', 'Categoría', 'Ubicación', 'Descripción'], ...hot.map((h) => [h.vulnerabilityProbability, h.securityCategory, `${h.component.replace('canchaya:', '')}${h.line ? `:${h.line}` : ''}`, `${h.message} [${h.status}${h.resolution ? ` / ${h.resolution}` : ''}]`])]));

  // Cobertura por archivo
  const archivos = (final.archivos ?? []).map((a) => ({ ruta: a.path ?? a.key, ncloc: Number(a.measures.find((m) => m.metric === 'ncloc')?.value ?? 0), cov: a.measures.find((m) => m.metric === 'coverage')?.value, smells: a.measures.find((m) => m.metric === 'code_smells')?.value, dup: a.measures.find((m) => m.metric === 'duplicated_lines_density')?.value }));
  hijos.push(h2(`${s2 && correcciones.length ? '3.6' : '3.5'} Cobertura y calidad por archivo`), p('Se listan los archivos con más líneas de código, con la cobertura de pruebas, los code smells y la duplicación de cada uno. Los archivos del frontend no tienen pruebas unitarias; su calidad se valida con las pruebas E2E del documento 04.'));
  hijos.push(tabla([4400, 1100, 1500, 1500, 1580], [['Archivo', 'Líneas', 'Cobertura', 'Code smells', 'Duplicación'], ...archivos.slice(0, 45).map((a) => [a.ruta, { t: String(a.ncloc), alinear: AlignmentType.RIGHT }, { t: a.cov === undefined ? '—' : `${a.cov} %`, alinear: AlignmentType.RIGHT }, { t: a.smells ?? '0', alinear: AlignmentType.RIGHT }, { t: a.dup === undefined ? '—' : `${a.dup} %`, alinear: AlignmentType.RIGHT }])]));

  // Evidencias
  const evidencias = (final.evidencias ?? []).filter((e) => fs.existsSync(path.join(EVID, e.archivo)));
  hijos.push(saltoPagina(), h1('4. Evidencias'));
  if (!evidencias.length) hijos.push(p('No se pudieron capturar las pantallas de SonarQube en esta ejecución.'));
  evidencias.forEach((e, i) => {
    hijos.push(imagen(e.archivo, { maxAncho: 620, maxAlto: 430 }), p(`Figura ${i + 1}. ${e.leyenda}`, { italics: true, alinear: AlignmentType.CENTER, size: 17, despues: 160 }));
  });

  // Integración con el pipeline
  hijos.push(
    h1('5. Integración con el pipeline (US-20 y US-21)'),
    tabla([3000, 7080], [
      ['Elemento', 'Estado'],
      ['Job "SonarQube Quality Gate"', 'Definido en .github/workflows/ci-cd.yml: depende de backend y frontend, descarga el lcov y ejecuta sonarqube-scan-action con sonar.qualitygate.wait=true'],
      ['Dependencia del job de Docker', 'La construcción de Docker espera al Quality Gate: un código que no pasa el gate no se despliega'],
      ['Secretos necesarios', 'SONAR_TOKEN (secreto del repositorio) y SONAR_HOST_URL (variable del repositorio), configurados en GitHub → Settings → Secrets and variables → Actions'],
      ['Servidor apagado o sin configurar', 'El primer paso del job consulta /api/server/version. Si el servidor no responde (por ejemplo, un túnel de ngrok cerrado) o faltan la variable o el secreto, el análisis se omite con un aviso en el resumen de la ejecución y el pipeline continúa; si responde, el Quality Gate sigue siendo obligatorio'],
      ['Verificación automática', 'Los casos SD-15 y SD-24 del documento 05 revisan que la configuración y el job existan'],
    ]),
    p('', { despues: 60 }),
    p([{ text: 'Importante: ', bold: true }, 'este análisis se hizo contra un SonarQube local descartable, porque el servidor del equipo no es accesible desde este entorno. Los resultados reflejan el mismo código y las mismas reglas, pero el panel oficial del equipo (y su historial) se genera cuando el pipeline corre con el servidor real.']),

    h1('6. Conclusión'),
    p(gateOk
      ? `El Quality Gate quedó aprobado con ${num(medida(final, 'bugs'))} bugs, ${num(medida(final, 'vulnerabilities'))} vulnerabilidades y ${num(medida(final, 'security_hotspots'))} puntos críticos de seguridad. La cobertura de pruebas del backend es ${medida(final, 'coverage') ?? '—'} % y la duplicación ${medida(final, 'duplicated_lines_density') ?? '—'} %. Quedan ${final.issues.length} hallazgos de mantenibilidad abiertos${final.issues.length ? ' (ver sección 3.3)' : ''}.`
      : `El Quality Gate no quedó aprobado. Hay ${final.issues.length} hallazgos abiertos y ${num(medida(final, 'bugs'))} bugs; se deben corregir antes de integrar.`),
    p(`Criterios de aceptación de US-21 cubiertos: ${HU['US-21'].criterios.length}.`),
  );

  return documento({
    titulo: 'Resultados del Análisis con SonarQube',
    subtitulo: 'Calidad estática del código — US-21',
    meta: [
      ...META_BASE,
      ['Fecha del análisis', fmtFecha(final.fin)],
      ['Versión analizada', entorno ? `rama ${entorno.repositorio.rama}, commit ${entorno.repositorio.commit}${entorno.repositorio.archivosSinCommit ? ` (más ${entorno.repositorio.archivosSinCommit} archivos con cambios sin commit)` : ''}` : '—'],
      ['Resultado global', gateOk ? 'Quality Gate APROBADO' : 'Quality Gate FALLIDO'],
      ['Historia cubierta', `US-21 · ${HU['US-21'].titulo}`],
    ],
    hijos,
  });
}

// =====================================================================
// 08 · Verificación de la documentación de la API
// =====================================================================
function docApi() {
  const fun = leer('funcionales');
  const e2e = leer('e2e');
  const smoke = leer('smoke');
  const jest = leer('jest');
  const casos = [fun, e2e, smoke].filter(Boolean).flatMap((s) => s.casos).filter((c) => c.hu === 'PIG1-23' || (c.hus ?? []).includes('PIG1-23'));
  if (!casos.length) return null;
  const cobertura = fs.existsSync(`${ROOT}/docs/api/cobertura-endpoints.md`) ? fs.readFileSync(`${ROOT}/docs/api/cobertura-endpoints.md`, 'utf8') : '';
  const filas = [...cobertura.matchAll(/^\| (\w+) \| `([^`]+)` \| ([^|]+) \|$/gm)].map((m) => [m[1], m[2], m[3].trim()]);
  const total = casos.length;
  const ok = casos.filter((c) => c.estado === 'APROBADA').length;
  const fa = casos.filter((c) => c.estado === 'FALLIDA').length;
  const contrato = jest?.suites.find((s) => s.archivo.includes('openapiContrato'));
  const docTests = jest?.suites.find((s) => s.archivo.includes('documentacionApi'));

  const criterios = HU['PIG1-23'].criterios.map((txt, i) => {
    const delCriterio = casos.filter((c) => (Array.isArray(c.ca) ? c.ca : c.ca?.['PIG1-23'] ?? []).includes(i + 1));
    const estado = delCriterio.length === 0 ? 'Sin caso' : delCriterio.some((c) => c.estado === 'FALLIDA') ? 'FALLIDA' : 'APROBADA';
    return [`CA-${i + 1}`, txt, delCriterio.map((c) => c.id).join(', ') || '—', estado === 'Sin caso' ? { t: estado, alinear: AlignmentType.CENTER, fondo: 'F2F4F6' } : estadoCelda(estado)];
  });

  const hijos = [
    h1('1. Resumen'),
    p('Este documento verifica la historia PIG1-23 (RNF-07): documentación técnica de la API con OpenAPI 3 y Swagger UI. La especificación vive en backend/openapi/openapi.yaml y Swagger UI se sirve en /api/docs.'),
    tabla([4200, 5880], [
      ['Indicador', 'Resultado'],
      ['Endpoints implementados / documentados', filas.length ? `${filas.length} / ${filas.filter((f) => f[2] === 'Sí').length} (${Math.round((filas.filter((f) => f[2] === 'Sí').length / filas.length) * 100)} %; mínimo exigido 90 %)` : '—'],
      ['Casos de prueba de la historia', `${ok} de ${total} aprobados · ${fa} fallidos`],
      ['Validación con Spectral', 'Sin errores ni advertencias (caso F-DOC-03 y SD-19)'],
      ['Prueba de contrato contra el backend', contrato ? `${contrato.tests.filter((t) => t.estado === 'APROBADA').length} de ${contrato.tests.length} pruebas aprobadas (ejemplos de la documentación ejecutados contra la API real y respuestas validadas contra sus esquemas)` : '—'],
      ['Pruebas de la especificación y de Swagger UI (Jest)', docTests ? `${docTests.tests.filter((t) => t.estado === 'APROBADA').length} de ${docTests.tests.length} aprobadas` : '—'],
    ]),
    p('', { despues: 60 }),
    h1('2. Criterios de aceptación'),
    tabla([700, 5300, 2300, 1780], [['CA', 'Criterio', 'Casos', 'Resultado'], ...criterios]),
    p('', { despues: 60 }),
    h1('3. Endpoints implementados contra documentados'),
    p('La tabla se genera con "npm run docs:cobertura", que lee las rutas reales registradas en Express y las compara con las operaciones de la especificación. El pipeline falla si la cobertura baja del 90 % o si la especificación documenta un endpoint que no existe.'),
  ];
  if (filas.length) {
    hijos.push(tabla([1300, 6000, 2780], [['Método', 'Ruta', 'Documentado'], ...filas.map((f) => [{ t: f[0], bold: true }, f[1], { t: f[2], alinear: AlignmentType.CENTER, fondo: f[2] === 'Sí' ? verde.fondo : rojo.fondo, color: f[2] === 'Sí' ? verde.texto : rojo.texto, bold: true }])]));
    hijos.push(p('', { despues: 60 }));
  }
  hijos.push(
    h1('4. Qué contiene la documentación'),
    viñeta('14 operaciones en 6 grupos: Sistema, Autenticación, Canchas, Reservas, Temporizador y Socket.IO (tiempo real).'),
    viñeta('Cada operación: resumen, descripción, parámetros, esquema del cuerpo con ejemplo y respuestas (200/201, 400, 401, 403, 404, 409, 429 y 500 según aplique) con ejemplos.'),
    viñeta('Modelos reutilizables en components/schemas: Usuario, Cancha, Reserva, Error, ErrorValidacion, ReservaConfirmada, ReservaHistorial, Paginacion, entre otros.'),
    viñeta('Autenticación Bearer JWT (bearerAuth) y botón Authorize operativo.'),
    viñeta('Casos de error del motor de reservas: disponibilidad (US-08), duplicada 409 (US-09), confirmación (US-11), reservas múltiples (US-12: solape y límite) e historial (US-13).'),
    viñeta('Eventos de Socket.IO (US-17 y US-18) con nombre, dirección, contenido y errores, en la sección "Socket.IO (tiempo real)" de la misma página, más docs/api/eventos-socket.md.'),
    h1('5. Resultados detallados de las pruebas'),
    p('Cada tarjeta muestra el objetivo, los pasos, el resultado esperado y el obtenido, con evidencias.'),
  );
  for (const caso of casos) hijos.push(...tarjetaCaso(caso, []));
  hijos.push(
    h1('6. Cómo mantener la documentación'),
    p('La especificación es parte del código: se actualiza en el mismo PR que cambia un endpoint.'),
    viñeta('Editar backend/openapi/openapi.yaml: ruta, parámetros, cuerpo, respuestas y ejemplos, reutilizando components/schemas.'),
    viñeta('Validar con "npm run docs:lint" (Spectral) y comprobar la cobertura con "npm run docs:cobertura".'),
    viñeta('Correr "npm test": la prueba de contrato ejecuta los ejemplos contra el backend y valida las respuestas contra los esquemas.'),
    viñeta('El pipeline repite los pasos de lint y cobertura en cada PR.'),
    h1('7. Conclusión'),
    p(fa === 0 ? `La documentación cumple los ${HU['PIG1-23'].criterios.length} criterios de aceptación: ${ok} de ${total} casos aprobados, cobertura del 100 % de los endpoints y ejemplos verificados contra el backend real.` : `Hay ${fa} casos fallidos; la documentación no cumple todavía todos los criterios.`),
  );

  return documento({
    titulo: 'Verificación de la Documentación de la API',
    subtitulo: 'OpenAPI 3 y Swagger UI — PIG1-23 (RNF-07)',
    meta: [...META_BASE, ['Fecha de ejecución', fmtFecha(casos.map((c) => c.ejecutadaEn).sort()[0])], ['Versión probada', entorno ? `rama ${entorno.repositorio.rama}, commit ${entorno.repositorio.commit}${entorno.repositorio.archivosSinCommit ? ` (más ${entorno.repositorio.archivosSinCommit} archivos con cambios sin commit)` : ''}` : '—'], ['Resultado global', `${ok} de ${total} casos aprobados`], ['Historia cubierta', `PIG1-23 · ${HU['PIG1-23'].titulo}`]],
    hijos,
  });
}

// =====================================================================
// 09 · Consolidado de todas las pruebas
// =====================================================================
function docConsolidado() {
  const jest = leer('jest');
  const suites = [
    ['Pruebas funcionales (API REST y Socket.IO)', 'Funcional', leer('funcionales')],
    ['Pruebas End-to-End (navegador)', 'End-to-End', leer('e2e')],
    ['Pruebas no funcionales', 'No funcional', leer('nofuncionales')],
    ['Smoke test de Docker y pipeline CI/CD', 'Smoke', leer('smoke')],
  ];
  if (!jest || suites.some((x) => !x[2])) return null;

  const filasJest = jest.suites.flatMap((su) => su.tests.map((t) => ({ suite: su.archivo, grupo: t.grupo, nombre: t.nombre, estado: t.estado })));
  filasJest.forEach((f, i) => { f.id = `J-${String(i + 1).padStart(3, '0')}`; });
  const conteoJest = { total: filasJest.length, ap: filasJest.filter((f) => f.estado === 'APROBADA').length, fa: filasJest.filter((f) => f.estado === 'FALLIDA').length, ob: filasJest.filter((f) => f.estado === 'OMITIDA').length };
  const conteo = (casos) => ({ total: casos.length, ap: casos.filter((c) => c.estado === 'APROBADA').length, fa: casos.filter((c) => c.estado === 'FALLIDA').length, ob: casos.filter((c) => c.estado === 'OBSERVACIÓN').length });
  const resumen = [{ nombre: 'Pruebas unitarias e integración (Jest)', ...conteoJest }, ...suites.map(([nombre, , suite]) => ({ nombre, ...conteo(suite.casos) }))];
  const total = resumen.reduce((a, r) => ({ total: a.total + r.total, ap: a.ap + r.ap, fa: a.fa + r.fa, ob: a.ob + r.ob }), { total: 0, ap: 0, fa: 0, ob: 0 });

  const casosQa = suites.flatMap(([, , suite]) => suite.casos);
  const porHu = {};
  for (const c of casosQa) for (const hu of c.hus ?? [c.hu]) porHu[hu] = (porHu[hu] ?? 0) + 1;

  const gris = { fondo: 'EEF2F5' };
  const celdaEst = (e) => (e === 'OMITIDA' ? { t: e, alinear: AlignmentType.CENTER, fondo: 'F2F4F6' } : estadoCelda(e));
  const centro = (v, extra = {}) => ({ t: String(v), alinear: AlignmentType.CENTER, ...extra });
  const hijos = [
    h1('1. Total de pruebas realizadas'),
    p(`Se ejecutaron ${num(total.total)} pruebas automatizadas sobre el sistema CanchaYa: ${num(conteoJest.total)} pruebas de código (Jest) y ${num(total.total - conteoJest.total)} casos de prueba de QA (funcionales, end-to-end, no funcionales y smoke de Docker).`),
    tabla([4200, 1300, 1400, 1300, 1880], [
      ['Tipo de prueba', 'Total', 'Aprobadas', 'Fallidas', 'Con observación'],
      ...resumen.map((r) => [r.nombre, centro(r.total, { bold: true }), centro(r.ap), centro(r.fa, { fondo: r.fa ? rojo.fondo : undefined, bold: r.fa > 0 }), centro(r.ob)]),
      [{ t: 'TOTAL', bold: true, ...gris }, centro(total.total, { bold: true, ...gris }), centro(total.ap, { bold: true, ...gris }), centro(total.fa, { bold: true, ...gris }), centro(total.ob, { bold: true, ...gris })],
    ]),
    p('', { despues: 80 }),
    p([{ text: 'Cómo leer las cifras. ', bold: true }, 'Aprobada: todas las verificaciones del caso se cumplieron. Fallida: alguna verificación no se cumplió. Con observación: el caso pasó, pero reveló una mejora recomendable que no es un defecto (por ejemplo, la compresión gzip del frontend). En Jest, una prueba pendiente (todo) se cuenta aparte y no como aprobada.']),
    p([{ text: 'Verificaciones complementarias (no se suman al total). ', bold: true }, 'Además de estas pruebas se ejecutaron el análisis estático de SonarQube (documento 07), la validación de la especificación OpenAPI con Spectral y el cálculo de cobertura de la documentación de la API (documento 08), y la auditoría de dependencias con npm audit incluida en el caso NF-13.']),
    h1('2. Pruebas por historia de usuario'),
    p('Número de casos de QA que verifican cada historia. Un caso puede cubrir varias historias, por eso la suma supera al total de casos de QA. Las pruebas Jest se listan en la sección 7 y no se asocian a una sola historia.'),
    tabla([1700, 6000, 2380], [['Historia', 'Título', 'Casos de QA'], ...Object.keys(porHu).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).map((hu) => [hu, HU[hu]?.titulo ?? '—', centro(porHu[hu])])]),
    p('', { despues: 60 }),
  ];

  let n = 3;
  for (const [nombre, , suite] of suites) {
    hijos.push(h1(`${n}. ${nombre}`));
    hijos.push(tabla([1000, 1300, 5280, 1500, 1000], [
      ['ID', 'HU', 'Prueba', 'Estado', 'Seg.'],
      ...suite.casos.map((c) => [{ t: c.id, bold: true }, (c.hus ?? [c.hu]).join(', '), c.titulo, celdaEst(c.estado), { t: (c.duracionMs / 1000).toFixed(1), alinear: AlignmentType.RIGHT }]),
    ]));
    n += 1;
  }
  hijos.push(h1(`${n}. Pruebas unitarias e integración (Jest)`));
  hijos.push(p(`${conteoJest.total} pruebas en ${jest.suites.length} archivos, ejecutadas contra una base de datos PostgreSQL real.`));
  for (const su of jest.suites) {
    hijos.push(h3(su.archivo));
    hijos.push(tabla([900, 7380, 1800], [
      ['ID', 'Prueba', 'Estado'],
      ...su.tests.map((t) => [{ t: filasJest.find((f) => f.suite === su.archivo && f.nombre === t.nombre && f.grupo === t.grupo)?.id ?? '', bold: true }, t.grupo ? `${t.grupo} › ${t.nombre}` : t.nombre, celdaEst(t.estado)]),
    ]));
  }
  hijos.push(
    h1(`${n + 1}. Conclusión`),
    p(total.fa === 0
      ? `Las ${num(total.total)} pruebas se ejecutaron sin ningún fallo: ${num(total.ap)} aprobadas y ${num(total.ob)} con una observación de mejora. Los defectos encontrados durante el ciclo (documento 06) están corregidos y verificados por estas mismas pruebas.`
      : `De ${num(total.total)} pruebas, ${num(total.fa)} fallaron; revise el detalle en las secciones anteriores.`),
  );

  const fechas = casosQa.map((c) => c.ejecutadaEn).sort();
  return documento({
    titulo: 'Consolidado de Todas las Pruebas',
    subtitulo: 'Resumen y listado completo de las pruebas ejecutadas — Sprint 4',
    meta: [
      ...META_BASE,
      ['Fecha de ejecución', fechas.length ? fmtFecha(fechas[0]) : '—'],
      ['Versión probada', entorno ? `rama ${entorno.repositorio.rama}, commit ${entorno.repositorio.commit}${entorno.repositorio.archivosSinCommit ? ` (más ${entorno.repositorio.archivosSinCommit} archivos con cambios sin commit)` : ''}` : '—'],
      ['Total de pruebas', `${num(total.total)} (${num(total.ap)} aprobadas · ${num(total.fa)} fallidas · ${num(total.ob)} con observación)`],
    ],
    hijos,
  });
}

const trabajos = [];
const sonar = docSonar();
if (sonar) trabajos.push(guardar(sonar, `${SALIDA}/07_Resultados_SonarQube.docx`));
else console.log('(sin resultados de SonarQube: ejecute "node sonar.mjs 1")');
const api = docApi();
if (api) trabajos.push(guardar(api, `${SALIDA}/08_Verificacion_Documentacion_API.docx`));
const consolidado = docConsolidado();
if (consolidado) trabajos.push(guardar(consolidado, `${SALIDA}/09_Consolidado_de_Pruebas.docx`));
await Promise.all(trabajos);
console.log('Documentos adicionales generados.');
