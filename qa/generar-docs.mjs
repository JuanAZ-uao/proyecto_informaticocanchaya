// Genera los documentos Word de QA a partir de los resultados (resultados/*.json).
import fs from 'node:fs';
import path from 'node:path';
import { HU, ORDEN_HU } from './hu.mjs';
import { OUT, ROOT } from './lib.mjs';
import { AlignmentType } from 'docx';
import { W, p, h1, h2, h3, viñeta, tabla, tarjetaCaso, documento, guardar, saltoPagina, estadoCelda, COLOR_ESTADO } from './docs-lib.mjs';

const SALIDA = `${ROOT}/docs/testing`;
const leer = (n) => (fs.existsSync(`${OUT}/${n}.json`) ? JSON.parse(fs.readFileSync(`${OUT}/${n}.json`, 'utf8')) : null);
const smoke = leer('smoke');
const fun = leer('funcionales');
const e2e = leer('e2e');
const nf = leer('nofuncionales');
const jest = leer('jest');
const entorno = leer('entorno');
const leerDatos = (n) => {
  const f = path.join(import.meta.dirname, 'datos', `${n}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
};
const defectos = leerDatos('defectos');
const ajustes = leerDatos('ajustes');
// Resultados de la ejecución inicial (antes de las correcciones), si existen.
const leer1 = (n) => {
  const f = path.join(OUT, '..', 'resultados-ejecucion-1', `${n}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const FASE = process.env.FASE || 'Ejecución completa desde cero';
const SUITES = [
  ['Smoke test de Docker y pipeline', smoke, '05_Resultados_Smoke_Docker.docx'],
  ['Pruebas funcionales (API y sockets)', fun, '02_Resultados_Pruebas_Funcionales.docx'],
  ['Pruebas End-to-End (navegador)', e2e, '04_Resultados_Pruebas_E2E.docx'],
  ['Pruebas no funcionales', nf, '03_Resultados_Pruebas_No_Funcionales.docx'],
];

// ---------- Utilidades ----------
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });
const contar = (casos) => ({
  total: casos.length,
  ap: casos.filter((c) => c.estado === 'APROBADA').length,
  fa: casos.filter((c) => c.estado === 'FALLIDA').length,
  ob: casos.filter((c) => c.estado === 'OBSERVACIÓN').length,
});
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)} %` : '—');
const todos = [smoke, fun, e2e, nf].filter(Boolean).flatMap((s) => s.casos);
const husDe = (c) => c.hus ?? [c.hu];
const caDe = (c, hu) => (Array.isArray(c.ca) ? (husDe(c).length === 1 ? c.ca : []) : c.ca?.[hu] ?? []);
const defectosDe = (id) => defectos.filter((d) => d.casos.includes(id));
const celdaEstado = (estado) => estadoCelda(estado);

// Un defecto queda "Cerrado" cuando todos los casos que lo verifican pasan en la ejecución actual.
const resultadoCaso = (id) => (id === 'JEST' ? (jest ? (jest.resumen.fallidas === 0 ? 'APROBADA' : 'FALLIDA') : undefined) : todos.find((c) => c.id === id)?.estado);
for (const d of defectos) {
  d.verificacion = (d.verifican ?? d.casos).map((id) => ({ id, estado: resultadoCaso(id) }));
  d.estado = d.verificacion.length && d.verificacion.every((v) => v.estado && v.estado !== 'FALLIDA') ? 'Cerrado' : 'Abierto';
}
const gris = 'F2F4F6';

function agregarEstado(lista) {
  if (!lista.length) return null;
  if (lista.some((x) => x.estado === 'FALLIDA')) return 'FALLIDA';
  if (lista.some((x) => x.estado === 'OBSERVACIÓN')) return 'OBSERVACIÓN';
  return 'APROBADA';
}

function mapaCobertura(casos) {
  const m = new Map();
  for (const c of casos) {
    for (const hu of husDe(c)) for (const n of caDe(c, hu)) {
      const k = `${hu}#${n}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    }
  }
  return m;
}

const tablaTotales = (casos) => {
  const t = contar(casos);
  return tabla([1700, 1700, 1700, 1700, 1700, 1580], [
    ['Casos ejecutados', 'Aprobados', 'Fallidos', 'Con observación', '% aprobados', 'Duración total'],
    [{ t: String(t.total), alinear: AlignmentType.CENTER, bold: true }, { t: String(t.ap), alinear: AlignmentType.CENTER, fondo: COLOR_ESTADO.APROBADA.fondo }, { t: String(t.fa), alinear: AlignmentType.CENTER, fondo: t.fa ? COLOR_ESTADO.FALLIDA.fondo : undefined }, { t: String(t.ob), alinear: AlignmentType.CENTER, fondo: t.ob ? COLOR_ESTADO['OBSERVACIÓN'].fondo : undefined }, { t: pct(t.ap, t.total), alinear: AlignmentType.CENTER, bold: true }, { t: `${(casos.reduce((a, c) => a + c.duracionMs, 0) / 60000).toFixed(1)} min`, alinear: AlignmentType.CENTER }],
  ]);
};

function tablaPorGrupo(casos, clave, etiqueta) {
  const grupos = [...new Set(casos.map(clave))];
  const filas = [[etiqueta, 'Casos', 'Aprobados', 'Fallidos', 'Observaciones']];
  for (const g of grupos) {
    const t = contar(casos.filter((c) => clave(c) === g));
    filas.push([g, { t: String(t.total), alinear: AlignmentType.CENTER }, { t: String(t.ap), alinear: AlignmentType.CENTER }, { t: String(t.fa), alinear: AlignmentType.CENTER, fondo: t.fa ? COLOR_ESTADO.FALLIDA.fondo : undefined, bold: t.fa > 0 }, { t: String(t.ob), alinear: AlignmentType.CENTER, fondo: t.ob ? COLOR_ESTADO['OBSERVACIÓN'].fondo : undefined }]);
  }
  return tabla([4680, 1350, 1350, 1350, 1350], filas);
}

function tablaEntorno() {
  if (!entorno) return p('(sin datos de entorno)');
  const filas = [['Elemento', 'Detalle'],
    ['Equipo', `${entorno.equipo.so} · ${entorno.equipo.cpu} (${entorno.equipo.nucleos} núcleos) · ${entorno.equipo.memoriaGB} GB de RAM · zona horaria ${entorno.equipo.zonaHoraria}`],
    ['Repositorio', `rama ${entorno.repositorio.rama} · commit ${entorno.repositorio.commit}${entorno.repositorio.archivosSinCommit ? ` (+${entorno.repositorio.archivosSinCommit} archivo(s) con cambios sin comitear)` : ''}`],
    ['Entorno de ejecución', `Docker Compose, proyecto aislado "${entorno.urls.proyectoDocker}": frontend ${entorno.urls.frontend} · API ${entorno.urls.api} · base PostgreSQL propia (no se usa la base compartida de Neon)`],
    ...Object.entries(entorno.versiones).map(([k, v]) => [k, String(v)])];
  return tabla([2800, W - 2800], filas);
}

function portadaMeta(extra = []) {
  const fechas = todos.map((c) => c.ejecutadaEn).sort();
  return [
    ['Proyecto', 'CanchaYa — Sistema de reserva de canchas sintéticas (Proyecto Informático 1, UAO, 2026-2)'],
    ['Equipo', 'Samuel Rios Calderón · Juan Esteban Panesso Bernal · Juan Sebastian Castillo Acevedo · Byron Stiven Zapata Zapata'],
    ['Versión del documento', '1.0'],
    ['Fecha de ejecución', fechas.length ? fmtFecha(fechas[0]) : '—'],
    ['Versión probada', entorno ? `rama ${entorno.repositorio.rama}, commit ${entorno.repositorio.commit}` : '—'],
    ['Ejecución', `${FASE}. Automatizada con scripts (Jest, Playwright, cliente Socket.IO, scripts de shell) sobre el entorno Docker de pruebas`],
    ...extra,
  ];
}

function coberturaTabla(casosSuite, husAlcance, { soloDeEstaSuite = true } = {}) {
  const m = mapaCobertura(casosSuite);
  const todosM = mapaCobertura(todos);
  const filas = [['HU', 'CA', 'Criterio de aceptación', 'Casos', 'Resultado']];
  for (const hu of husAlcance) {
    HU[hu].criterios.forEach((txt, i) => {
      const k = `${hu}#${i + 1}`;
      const lista = m.get(k) ?? [];
      const otras = todosM.get(k) ?? [];
      const est = agregarEstado(lista);
      filas.push([hu, `CA-${i + 1}`, txt.length > 150 ? `${txt.slice(0, 147)}…` : txt, lista.length ? lista.map((x) => x.id).join(', ') : otras.length && soloDeEstaSuite ? { t: `(en otra suite: ${otras.map((x) => x.id).join(', ')})`, color: '5B6770' } : '—', est ? celdaEstado(est) : { t: otras.length ? 'Otra suite' : 'Sin caso', fondo: gris, alinear: AlignmentType.CENTER, color: '5B6770' }]);
    });
  }
  return tabla([700, 700, 4300, 2480, 1900], filas);
}

function bloqueDefectos(idsCasos) {
  const lista = defectos.filter((d) => d.casos.some((c) => idsCasos.includes(c)));
  if (!lista.length) return [p('No hay defectos asociados a esta suite.')];
  return [
    tabla([900, 4500, 1100, 1500, 1080], [['ID', 'Defecto', 'Severidad', 'Casos', 'Estado'], ...lista.map((d) => [{ t: d.id, bold: true }, d.titulo, { t: d.severidad, bold: true, color: d.severidad === 'Alta' || d.severidad === 'Crítica' ? 'B71C1C' : '8A4B00' }, d.casos.join(', '), { t: d.estado, bold: true, fondo: d.estado === 'Cerrado' ? COLOR_ESTADO.APROBADA.fondo : COLOR_ESTADO.FALLIDA.fondo }])]),
    p('El detalle de cada defecto (pasos, resultado esperado y obtenido, impacto y recomendación) está en el documento 06_Informe_Resumen_QA_y_Defectos.', { italics: true, antes: 100 }),
  ];
}

function bloqueObservaciones(casos) {
  const obs = casos.flatMap((c) => c.resultado.filter((l) => l.ok === 'obs').map((l) => ({ id: c.id, texto: l.texto })));
  if (!obs.length) return [];
  return [h2('Observaciones'), ...obs.map((o) => viñeta([{ text: `${o.id}: `, bold: true }, o.texto]))];
}

// ---------- Documento de resultados ----------
function docResultados({ archivo, titulo, subtitulo, suite, agrupar, introGrupos = {}, intro, metodologia, extraInicio = [], extraFinal = [], idsExtra = [] }) {
  const casos = suite.casos;
  const grupos = [...new Set(casos.map(agrupar))];
  const t = contar(casos);
  const hijos = [
    h1('1. Resumen de la ejecución'),
    p(intro),
    tablaTotales(casos),
    p('', { despues: 80 }),
    tablaPorGrupo(casos, agrupar, 'Grupo'),
    p('', { despues: 60 }),
    p([{ text: 'Estados: ', bold: true }, 'APROBADA = todas las verificaciones del caso se cumplieron. FALLIDA = al menos una verificación no se cumplió (el resultado obtenido difiere del esperado). OBSERVACIÓN = el caso se cumplió pero deja un hallazgo o una limitación que debe conocerse.'], { size: 17 }),
    h1('2. Metodología y entorno'),
    p(metodologia),
    tablaEntorno(),
    ...extraInicio,
    h1('3. Resultados detallados'),
  ];

  grupos.forEach((g, i) => {
    const delGrupo = casos.filter((c) => agrupar(c) === g);
    const esHU = HU[g];
    hijos.push(h2(esHU ? `3.${i + 1} ${g} · ${esHU.titulo}` : `3.${i + 1} ${g}`));
    if (esHU) {
      hijos.push(p([{ text: 'Historia de usuario: ', bold: true }, { text: esHU.historia, italics: true }]));
      if (esHU.derivado) hijos.push(p('Nota: el backlog entregado no trae criterios de aceptación formales para esta historia; los criterios listados se derivaron de su implementación.', { italics: true, size: 17, color: '8A4B00' }));
      hijos.push(coberturaTabla(delGrupo, [g]), p('', { despues: 120 }));
    } else if (introGrupos[g]) {
      hijos.push(p(introGrupos[g]));
    }
    for (const caso of delGrupo) hijos.push(...tarjetaCaso(caso, defectosDe(caso.id)));
  });

  hijos.push(h1('4. Defectos y observaciones de esta suite'), ...bloqueDefectos([...casos.map((c) => c.id), ...idsExtra]), ...bloqueObservaciones(casos), ...extraFinal);
  hijos.push(
    h1('5. Conclusión'),
    p(`Se ejecutaron ${t.total} casos: ${t.ap} aprobados (${pct(t.ap, t.total)}), ${t.fa} fallidos y ${t.ob} con observación. ${t.fa === 0 ? 'Todos los casos cumplieron el resultado esperado.' : `Los casos fallidos (${casos.filter((c) => c.estado === 'FALLIDA').map((c) => c.id).join(', ')}) muestran diferencias entre el resultado obtenido y el esperado y se registran como defectos en el informe de resumen.`}`)
  );

  return { doc: documento({ titulo, subtitulo, meta: portadaMeta([['Resultado global', `${t.ap} de ${t.total} casos aprobados · ${t.fa} fallidos · ${t.ob} con observación`], ['Casos del documento', `${casos[0].id} a ${casos.at(-1).id}`]]), hijos }), archivo };
}

// ---------- Sección de Jest (dentro del documento funcional) ----------
const jestInicial = leer1('jest');

function seccionJest() {
  if (!jest) return [];
  const r = jest.resumen;
  const filas = [['Suite de pruebas', 'Prueba', 'Estado']];
  for (const s of jest.suites) for (const tst of s.tests) filas.push([s.archivo.replace('tests/', ''), `${tst.grupo ? tst.grupo + ' › ' : ''}${tst.nombre}`, celdaEstado(tst.estado)]);
  const fallidas = jest.suites.flatMap((s) => s.tests.filter((x) => x.estado === 'FALLIDA').map((x) => ({ s, x })));
  const g = jest.cobertura.total;
  return [
    h1('6. Pruebas automatizadas del backend (Jest)'),
    p(`Además de los casos de API y sockets, se ejecutó la batería automatizada del backend (la misma que corre en el pipeline de CI) contra un PostgreSQL temporal: ${r.suites} suites y ${r.pruebas} pruebas. Resultado: ${r.aprobadas} aprobadas, ${r.fallidas} fallidas, ${r.omitidas} omitidas, en ${(jest.duracionMs / 1000).toFixed(1)} s.`),
    tabla([1700, 1700, 1700, 1700, 1700, 1580], [['Suites', 'Pruebas', 'Aprobadas', 'Fallidas', 'Omitidas', 'Cobertura de líneas'], [String(r.suites), String(r.pruebas), String(r.aprobadas), { t: String(r.fallidas), bold: true, fondo: r.fallidas ? COLOR_ESTADO.FALLIDA.fondo : undefined }, String(r.omitidas), `${g.lines.pct} %`]]),
    p('', { despues: 80 }),
    ...(fallidas.length ? [p([{ text: 'Pruebas fallidas: ', bold: true, color: 'B71C1C' }, `${fallidas.length} pruebas no pasaron; ver el defecto correspondiente en el informe de resumen.`])] : []),
    ...(jestInicial && jestInicial.resumen.fallidas > 0 && !fallidas.length ? [p([{ text: 'Regresión: ', bold: true, color: '1B5E20' }, `en la ejecución inicial ${jestInicial.resumen.fallidas} de ${jestInicial.resumen.pruebas} pruebas fallaban (reservaService.test.js usaba la fecha fija 2026-10-01, ya vencida: defecto DEF-01). Tras la corrección y la incorporación de pruebas para cada defecto, pasan las ${r.pruebas} pruebas.`])] : []),
    h3('Detalle por prueba'),
    tabla([2600, 5880, 1600], filas),
  ];
}

// ---------- Plan de pruebas ----------
function docPlan() {
  const hijos = [];
  hijos.push(
    h1('1. Introducción'),
    p('Este documento define el plan de pruebas de calidad (QA) de CanchaYa para la versión desarrollada hasta el Sprint 4: qué se prueba, con qué estrategia, en qué entorno, con qué criterios se considera aprobada una prueba y cómo se registran los resultados. Los resultados de la ejecución se documentan en los archivos 02 a 06 de esta misma carpeta.'),
    h2('1.1 Objetivos'),
    viñeta('Verificar que cada historia de usuario (HU) cumple sus criterios de aceptación (CA), con trazabilidad entre HU, criterio y caso de prueba.'),
    viñeta('Comprobar los requisitos no funcionales: rendimiento (RNF-01), seguridad (RNF-03), responsive (RNF-05), fiabilidad y mantenibilidad.'),
    viñeta('Validar de punta a punta los flujos de usuario en un navegador real, incluyendo el temporizador y la disponibilidad en tiempo real por socket.'),
    viñeta('Verificar que el entorno Docker y el pipeline CI/CD levantan y validan la aplicación de forma reproducible.'),
    viñeta('Detectar, clasificar y documentar los defectos con la evidencia necesaria para corregirlos.'),
    h1('2. Alcance'),
    h2('2.1 Dentro del alcance'),
    tabla([1100, 3000, 1100, W - 5200], [['HU', 'Historia', 'Sprint', 'Tipos de prueba aplicados'],
      ...ORDEN_HU.map((id) => {
        const tipos = ['Funcional', 'E2E', 'No funcional', 'Smoke'].filter((t) => todos.some((c) => husDe(c).includes(id) && (t === 'Funcional' ? c.tipo === 'Funcional' : t === 'E2E' ? c.tipo === 'End-to-End' : t === 'No funcional' ? c.tipo === 'No funcional' : c.tipo === 'Smoke test')));
        return [id, HU[id].titulo, String(HU[id].sprint), tipos.join(', ') || '—'];
      })]),
    p('', { despues: 80 }),
    h2('2.2 Fuera del alcance'),
    viñeta('US-12 (reservas múltiples), US-13 (historial completo con filtros) y US-21 (SonarQube): no están implementadas. Del historial solo se prueba la versión mínima ("Mis reservas") que exige US-11.'),
    viñeta('Envío real de correos por SMTP: no hay credenciales configuradas; se prueba el modo simulado y la tolerancia a fallos mediante pruebas unitarias.'),
    viñeta('Ejecución remota de GitHub Actions: solo corre en los servidores de GitHub. QA verifica el workflow de forma estática y localmente, y se anexa la evidencia que aportó el equipo.'),
    viñeta('Dispositivos móviles físicos y navegadores antiguos; pruebas de penetración profundas; pruebas de carga superiores a 250 conexiones; pruebas de usabilidad con usuarios reales.'),
    h1('3. Historias de usuario y criterios de aceptación'),
    p('Los criterios están numerados (CA-1, CA-2, …) en el orden del backlog; los casos de prueba los citan con esa numeración. Para US-05, US-06, US-07, US-19 y US-20 el backlog no trae criterios formales, por lo que se derivaron de su implementación y así se indica.'),
  );
  for (const id of ORDEN_HU) {
    const info = HU[id];
    hijos.push(h3(`${id} · ${info.titulo} (Sprint ${info.sprint})`), p([{ text: 'Historia: ', bold: true }, { text: info.historia, italics: true }], { despues: 60 }));
    if (info.derivado) hijos.push(p('Criterios derivados de la implementación.', { italics: true, size: 17, color: '8A4B00', despues: 40 }));
    hijos.push(tabla([800, W - 800], [['CA', 'Criterio de aceptación'], ...info.criterios.map((t, i) => [`CA-${i + 1}`, t])]), p('', { despues: 80 }));
  }

  hijos.push(
    h1('4. Estrategia de pruebas'),
    p('Se aplica una estrategia por niveles, de lo más rápido y aislado a lo más cercano al usuario, basada en riesgo: primero lo que protege la integridad de las reservas (unicidad, concurrencia, temporizador y retención en tiempo real) y la seguridad de los datos.'),
    tabla([1900, 3200, 2200, 2780], [['Nivel / tipo', 'Qué verifica', 'Herramienta', 'Dónde corre'],
      ['Unitaria e integración (Jest)', 'Servicios y repositorios con mocks; una prueba de integración real de concurrencia contra PostgreSQL', 'Jest 29 + supertest', 'Postgres temporal (contenedor)'],
      ['Funcional (API y sockets)', 'Cada criterio de aceptación contra la API REST y los eventos Socket.IO, con casos positivos y negativos y verificación directa en la base de datos', 'Scripts Node (fetch, socket.io-client, psql)', 'Entorno Docker aislado'],
      ['End-to-End (E2E)', 'Flujos completos en navegador: registro, login, catálogo, reserva cronometrada, tiempo real entre dos usuarios, expiración real, móvil', 'Playwright (Chromium)', 'Entorno Docker aislado'],
      ['No funcional', 'Rendimiento y carga, seguridad, accesibilidad (WCAG 2.1 AA), responsive, compatibilidad de navegadores, fiabilidad y mantenibilidad', 'Scripts Node, axe-core, Playwright, npm audit, ESLint', 'Entorno Docker aislado'],
      ['Smoke test de Docker', 'Construcción desde cero, arranque, salud, persistencia, seguridad de imágenes, smoke test del pipeline y análisis del workflow', 'Docker Compose, scripts de shell', 'Docker local']]),
    p('', { despues: 80 }),
    h2('4.1 Técnicas de diseño de casos'),
    viñeta('Casos positivos (camino feliz) y negativos (errores esperados): cada caso documenta el error que "debería" devolver el sistema y lo compara con el obtenido.'),
    viñeta('Partición de equivalencia y valores límite: fechas pasadas/futuras, hora actual, contraseñas válidas e inválidas, tamaños de cuerpo, 180 s exactos del temporizador.'),
    viñeta('Concurrencia: peticiones simultáneas por la misma franja (2, 10, 25 y 100 usuarios) y verificación de integridad en la base de datos.'),
    viñeta('Tiempo real: dos usuarios simultáneos y pruebas de 180 s reales con el reloj del servidor.'),
    viñeta('Seguridad: manipulación de JWT, inyección SQL y XSS, CORS, control de acceso entre usuarios y límites de intentos.'),
    viñeta('Trazabilidad: toda prueba declara la HU y el criterio que cubre; la matriz de la sección 9 muestra el resultado por criterio.'),
    h1('5. Entorno de pruebas'),
    p('Las pruebas se ejecutan en un entorno Docker Compose aislado (proyecto "canchaya-qa", puertos 4300 y 8380) con su propio PostgreSQL. No se usa la base de datos compartida de Neon ni se modifica el despliegue del pipeline (proyecto "canchaya"). Los datos de prueba (usuarios, reservas) se generan en cada ejecución y el entorno se elimina al terminar.'),
    tablaEntorno(),
    h1('6. Datos de prueba'),
    viñeta('Usuarios: se registran por la API con correos únicos @qa.local y la contraseña "Password123!" (cumple la política mínima).'),
    viñeta('Canchas: las 5 canchas de ejemplo del seed (Fútbol 5, 6, 7 y 8) con horario de atención diario.'),
    viñeta('Fechas: las pruebas de API usan fechas únicas de los años 2100 en adelante para no chocar entre sí; las E2E usan días consecutivos a partir de mañana; las de "hoy" usan la hora real de Colombia (UTC-5).'),
    viñeta('Aislamiento: cada caso crea sus propios usuarios y franjas, de modo que ningún resultado depende del orden de ejecución.'),
    h1('7. Criterios de entrada, salida y aceptación'),
    h3('Criterios de entrada'),
    viñeta('El entorno Docker se construye desde cero y los 3 servicios quedan "healthy".'),
    viñeta('El esquema de la base se aplicó y existen las canchas de ejemplo.'),
    h3('Criterios de salida (versión apta para liberar)'),
    tabla([5400, 4680], [['Criterio', 'Umbral'],
      ['Casos de prioridad Alta', '100 % aprobados'],
      ['Defectos de severidad Crítica o Alta abiertos', '0'],
      ['Pruebas automatizadas del backend (Jest)', '100 % aprobadas'],
      ['Smoke test de Docker', '100 % aprobado'],
      ['Criterios de aceptación con al menos un caso de prueba', '≥ 90 %'],
      ['Requisitos no funcionales (RNF-01: p95 < 2 s; sin vulnerabilidades altas)', 'Cumplidos']]),
    p('', { despues: 80 }),
    h3('Clasificación de defectos'),
    tabla([1500, 8580], [['Severidad', 'Definición'],
      [{ t: 'Crítica', bold: true }, 'Impide usar el sistema o compromete la integridad o seguridad de los datos, sin alternativa.'],
      [{ t: 'Alta', bold: true }, 'Incumple un criterio de aceptación en el flujo normal o rompe el pipeline de integración continua.'],
      [{ t: 'Media', bold: true }, 'Comportamiento incorrecto fuera del flujo habitual (por ejemplo, solo por la API directa) o que degrada la calidad sin bloquear el uso.'],
      [{ t: 'Baja', bold: true }, 'Robustez, mensajes o mejoras menores sin impacto funcional.']]),
    h1('8. Roles, riesgos y limitaciones'),
    h3('Roles'),
    viñeta('Responsable de QA del equipo: Byron Stiven Zapata Zapata (tarea PIG1-22 del tablero). Desarrollo: Samuel Rios, Juan Esteban Panesso y Juan Sebastian Castillo.'),
    viñeta('Ejecución: scripts automatizados y reproducibles en la carpeta qa/ del repositorio (ver qa/README.md); los documentos de resultados y las evidencias están en docs/testing/.'),
    h3('Riesgos y limitaciones'),
    viñeta('Los criterios de US-05, US-06, US-07, US-19 y US-20 son derivados; conviene que el equipo los valide.'),
    viñeta('Las pruebas de tiempo real dependen de relojes y red locales; se mitigan con tolerancias definidas en cada caso.'),
    viñeta('El correo real por SMTP y la ejecución remota de GitHub Actions no pudieron ejercitarse localmente.'),
    viñeta('La suite corre en un solo equipo; el rendimiento absoluto puede variar en otro hardware.'),
  );

  // casos planificados
  hijos.push(h1('9. Casos de prueba y matriz de trazabilidad'));
  hijos.push(h2('9.1 Casos de prueba por suite'));
  for (const [nombre, suite] of SUITES.map(([n, s]) => [n, s])) {
    if (!suite) continue;
    hijos.push(h3(`${nombre} (${suite.casos.length} casos)`), tabla([1000, 1500, 7580], [['ID', 'HU', 'Caso de prueba'], ...suite.casos.map((c) => [c.id, husDe(c).map((h) => (h === 'NF' ? 'Transversal' : h)).join(', '), c.titulo])]), p('', { despues: 80 }));
  }
  hijos.push(h2('9.2 Matriz de trazabilidad HU / criterio de aceptación'), p('Resultado agregado de todos los casos que cubren cada criterio (después de ejecutar las pruebas).'), coberturaTabla(todos, ORDEN_HU, { soloDeEstaSuite: false }));
  return documento({ titulo: 'Plan de Pruebas QA', subtitulo: 'Estrategia, alcance, entorno y trazabilidad', meta: portadaMeta([['Alcance', `${ORDEN_HU.length} historias de usuario · ${todos.length} casos de prueba + ${jest ? jest.resumen.pruebas : 0} pruebas automatizadas del backend`]]), hijos });
}

// ---------- Informe resumen y defectos ----------
function comparacionEjecuciones() {
  const previas = [['Smoke de Docker', leer1('smoke'), smoke], ['Funcionales', leer1('funcionales'), fun], ['E2E', leer1('e2e'), e2e], ['No funcionales', leer1('nofuncionales'), nf]].filter(([, a]) => a);
  if (!previas.length) return [];
  const fila = (c) => `${c.ap} apr. · ${c.fa} fall. · ${c.ob} obs.`;
  const j1 = leer1('jest');
  return [
    h1('2. Comparación entre la ejecución inicial y la regresión'),
    p('La ejecución inicial detectó los defectos de la sección 4. Tras corregirlos se repitió el plan completo, desde la construcción de las imágenes sin caché, y se agregaron casos para las correcciones.'),
    tabla([3200, 3440, 3440], [['Suite', 'Ejecución inicial', 'Regresión (tras las correcciones)'],
      ...previas.map(([n, a, b]) => [n, fila(contar(a.casos)) + ` (de ${a.casos.length})`, fila(contar(b.casos)) + ` (de ${b.casos.length})`]),
      ...(j1 && jest ? [['Jest (backend)', `${j1.resumen.aprobadas} apr. · ${j1.resumen.fallidas} fall. (de ${j1.resumen.pruebas})`, `${jest.resumen.aprobadas} apr. · ${jest.resumen.fallidas} fall. (de ${jest.resumen.pruebas})`]] : [])]),
    p('', { despues: 60 }),
  ];
}

function docResumen() {
  const hijos = [];
  const t = contar(todos);
  const altas = todos.filter((c) => c.prioridad === 'Alta');
  const altasFallidas = altas.filter((c) => c.estado === 'FALLIDA');
  const m = mapaCobertura(todos);
  let caTotal = 0, caCub = 0, caOk = 0, caFa = 0;
  const filasHU = [['HU', 'CA', 'Con casos', 'Aprobados', 'Con fallos', 'Casos']];
  for (const id of ORDEN_HU) {
    const n = HU[id].criterios.length;
    let cub = 0, ok = 0, fa = 0;
    HU[id].criterios.forEach((_, i) => {
      const e = agregarEstado(m.get(`${id}#${i + 1}`) ?? []);
      if (e) cub += 1;
      if (e === 'APROBADA' || e === 'OBSERVACIÓN') ok += 1;
      if (e === 'FALLIDA') fa += 1;
    });
    caTotal += n; caCub += cub; caOk += ok; caFa += fa;
    filasHU.push([`${id} · ${HU[id].titulo}`, { t: String(n), alinear: AlignmentType.CENTER }, { t: `${cub}/${n}`, alinear: AlignmentType.CENTER }, { t: String(ok), alinear: AlignmentType.CENTER }, { t: String(fa), alinear: AlignmentType.CENTER, fondo: fa ? COLOR_ESTADO.FALLIDA.fondo : undefined, bold: fa > 0 }, { t: String(todos.filter((c) => husDe(c).includes(id)).length), alinear: AlignmentType.CENTER }]);
  }
  const jr = jest?.resumen;
  const abiertosGraves = defectos.filter((d) => ['Crítica', 'Alta'].includes(d.severidad) && d.estado === 'Abierto');
  const smokeCont = smoke ? contar(smoke.casos) : null;
  const criterios = [
    ['Casos de prioridad Alta aprobados', '100 %', `${altas.length - altasFallidas.length}/${altas.length} (${pct(altas.length - altasFallidas.length, altas.length)})`, altasFallidas.length === 0],
    ['Defectos Crítica/Alta abiertos', '0', String(abiertosGraves.length), abiertosGraves.length === 0],
    ['Pruebas automatizadas del backend (Jest)', '100 % aprobadas', jr ? `${jr.aprobadas}/${jr.pruebas}` : '—', jr ? jr.fallidas === 0 : false],
    ['Smoke test de Docker', '100 % aprobado', smokeCont ? `${smokeCont.ap + smokeCont.ob}/${smokeCont.total}` : '—', smokeCont ? smokeCont.fa === 0 : false],
    ['Criterios de aceptación con caso de prueba', '≥ 90 %', `${caCub}/${caTotal} (${pct(caCub, caTotal)})`, caCub / caTotal >= 0.9],
    ['Rendimiento RNF-01 (p95 < 2 s) y sin vulnerabilidades altas', 'Cumplidos', nf ? nf.casos.filter((c) => ['NF-01', 'NF-02', 'NF-03', 'NF-13'].includes(c.id)).map((c) => `${c.id} ${c.estado.toLowerCase()}`).join(' · ') : '—', nf ? nf.casos.filter((c) => ['NF-01', 'NF-02', 'NF-03', 'NF-13'].includes(c.id)).every((c) => c.estado !== 'FALLIDA') : false],
  ];
  const cumple = criterios.every((c) => c[3]);

  hijos.push(
    h1('1. Resumen ejecutivo'),
    p(`Se ejecutaron ${t.total} casos de prueba en cuatro suites (smoke de Docker, funcionales, E2E y no funcionales) más ${jr ? jr.pruebas : 0} pruebas automatizadas del backend. Los ${caTotal} criterios de aceptación de las ${ORDEN_HU.length} historias evaluadas quedaron cubiertos en un ${pct(caCub, caTotal)}.`),
    tablaTotales(todos),
    p('', { despues: 100 }),
    h3('Resultado por suite'),
    tabla([4400, 1100, 1300, 1100, 1100, 1080], [['Suite', 'Casos', 'Aprobados', 'Fallidos', 'Obs.', '% apr.'],
      ...SUITES.filter(([, s]) => s).map(([n, s]) => { const c = contar(s.casos); return [n, String(c.total), String(c.ap), { t: String(c.fa), bold: c.fa > 0, fondo: c.fa ? COLOR_ESTADO.FALLIDA.fondo : undefined }, String(c.ob), pct(c.ap, c.total)]; }),
      ...(jr ? [['Jest: pruebas unitarias e integración del backend', String(jr.pruebas), String(jr.aprobadas), { t: String(jr.fallidas), bold: jr.fallidas > 0, fondo: jr.fallidas ? COLOR_ESTADO.FALLIDA.fondo : undefined }, String(jr.omitidas), pct(jr.aprobadas, jr.pruebas)]] : [])]),
    p('', { despues: 100 }),
    h3('Veredicto frente a los criterios de salida'),
    tabla([4200, 1800, 2780, 1300], [['Criterio', 'Umbral', 'Obtenido', 'Cumple'], ...criterios.map(([a, b, c2, ok]) => [a, b, c2, { t: ok ? 'SÍ' : 'NO', bold: true, alinear: AlignmentType.CENTER, fondo: ok ? COLOR_ESTADO.APROBADA.fondo : COLOR_ESTADO.FALLIDA.fondo, color: ok ? COLOR_ESTADO.APROBADA.texto : COLOR_ESTADO.FALLIDA.texto }])]),
    p('', { despues: 80 }),
    p([{ text: 'Veredicto: ', bold: true }, cumple ? `la versión cumple los criterios de salida definidos en el plan${defectos.length ? ` y los ${defectos.filter((d) => d.estado === 'Cerrado').length} defectos detectados en la ejecución inicial están corregidos y verificados` : ''}.` : `la versión NO cumple todos los criterios de salida. ${abiertosGraves.length ? `Hay ${abiertosGraves.length} defecto(s) de severidad Alta/Crítica abierto(s): ${abiertosGraves.map((d) => d.id).join(', ')}.` : ''} Los criterios marcados con "NO" deben resolverse y volver a probarse antes de liberar.`]),
    ...comparacionEjecuciones(),
    h1('3. Cobertura por historia de usuario'),
    tabla([4200, 800, 1300, 1300, 1300, 1180], filasHU),
    p('', { despues: 60 }),
    p('CA = criterios de aceptación. "Aprobados" incluye los que pasaron con observación; "Con fallos" son criterios con al menos un caso fallido.', { size: 17, italics: true }),
    h1('4. Defectos encontrados y su cierre'),
  );

  if (!defectos.length) hijos.push(p('No se registraron defectos.'));
  else {
    hijos.push(tabla([800, 4100, 900, 1500, 1400, 1380], [['ID', 'Defecto', 'Severidad', 'HU / criterio', 'Casos', 'Estado'], ...defectos.map((d) => [{ t: d.id, bold: true }, d.titulo, { t: d.severidad, bold: true, color: ['Alta', 'Crítica'].includes(d.severidad) ? 'B71C1C' : '8A4B00' }, d.hu, d.casos.join(', '), { t: d.estado, bold: true, alinear: AlignmentType.CENTER, fondo: d.estado === 'Cerrado' ? COLOR_ESTADO.APROBADA.fondo : COLOR_ESTADO.FALLIDA.fondo }])]));
    hijos.push(h2('4.1 Detalle de cada defecto'));
    for (const d of defectos) {
      hijos.push(
        h3(`${d.id} · ${d.titulo}`),
        tabla([2100, W - 2100], [
          [{ t: 'Severidad / estado', bold: true, fondo: 'EEF2F5' }, `${d.severidad} · ${d.estado === 'Cerrado' ? 'Cerrado (corregido y verificado en la regresión)' : 'Abierto'}`],
          [{ t: 'HU / criterio', bold: true, fondo: 'EEF2F5' }, d.hu],
          [{ t: 'Casos que lo detectaron', bold: true, fondo: 'EEF2F5' }, d.casos.join(', ')],
          [{ t: 'Descripción', bold: true, fondo: 'EEF2F5' }, d.descripcion],
          [{ t: 'Pasos para reproducir', bold: true, fondo: 'EEF2F5' }, d.pasos.map((x, i) => p(`${i + 1}. ${x}`, { despues: 30 }))],
          [{ t: 'Resultado esperado', bold: true, fondo: 'EEF2F5' }, d.esperado],
          [{ t: 'Resultado obtenido (ejecución inicial)', bold: true, fondo: 'EEF2F5', color: 'B71C1C' }, { t: d.obtenido, color: 'B71C1C' }],
          [{ t: 'Impacto', bold: true, fondo: 'EEF2F5' }, d.impacto],
          [{ t: 'Recomendación', bold: true, fondo: 'EEF2F5' }, d.recomendacion],
          ...(d.correccion ? [[{ t: 'Corrección aplicada', bold: true, fondo: 'E8F5E9' }, d.correccion]] : []),
          ...(d.verificacion?.length ? [[{ t: 'Verificación (regresión)', bold: true, fondo: 'E8F5E9' }, d.verificacion.map((v) => p([{ text: `${v.id}: `, bold: true }, { text: v.estado === 'APROBADA' ? 'APROBADA' : v.estado ?? 'sin resultado', bold: true, color: v.estado === 'APROBADA' ? '1B5E20' : 'B71C1C' }, v.estado === 'APROBADA' ? ' (el resultado obtenido ahora coincide con el esperado)' : ''], { despues: 30 }))]] : []),
        ], { encabezado: false }),
        p('', { despues: 120 })
      );
    }
  }

  const obs = todos.flatMap((c) => c.resultado.filter((l) => l.ok === 'obs').map((l) => ({ id: c.id, texto: l.texto })));
  hijos.push(h1('5. Ajustes a los casos durante la puesta a punto'));
  if (ajustes.length) {
    hijos.push(
      p('Al ejecutar por primera vez las suites, algunos casos fallaron por suposiciones erróneas del propio script de prueba (no por defectos del producto). Se corrigieron y se volvieron a ejecutar; los documentos de resultados muestran la ejecución final. Se deja constancia para que el historial sea transparente.'),
      tabla([1000, 4000, 5080], [['Caso', 'Qué ocurrió en la primera ejecución', 'Corrección'], ...ajustes.map((a) => [{ t: a.caso, bold: true }, a.problema, a.correccion])])
    );
  } else hijos.push(p('No hubo ajustes.'));
  hijos.push(h1('6. Observaciones y limitaciones'));
  if (obs.length) hijos.push(...obs.map((o) => viñeta([{ text: `${o.id}: `, bold: true }, o.texto])));
  hijos.push(
    viñeta('Las pruebas de este informe se ejecutaron sobre el commit indicado en la portada; los cambios posteriores deben volver a probarse con los mismos scripts.'),
    viñeta('No se probó el envío real de correo por SMTP ni la ejecución remota de GitHub Actions (ver plan, sección 2.2).'),
    h1('7. Recomendaciones y próximos pasos'),
  );
  const recs = defectos.filter((d) => d.estado === 'Abierto').map((d) => `${d.id} (${d.severidad}): ${d.recomendacion}`);
  hijos.push(...(recs.length ? recs.map((r) => viñeta(r)) : [p('Sin recomendaciones pendientes.')]));
  hijos.push(
    viñeta('Corregir los defectos y volver a ejecutar las suites completas; actualizar el estado de cada defecto en este informe.'),
    viñeta('Agregar los casos automatizados de este plan al pipeline (los de API y E2E ya son reproducibles con los scripts) para detectar regresiones en cada push.'),
    h1('8. Documentos de esta entrega'),
    tabla([4300, 5780], [['Documento', 'Contenido'],
      ['01_Plan_de_Pruebas_QA.docx', 'Alcance, estrategia, entorno, criterios y matriz de trazabilidad'],
      ['02_Resultados_Pruebas_Funcionales.docx', 'API REST y sockets por historia de usuario + pruebas Jest'],
      ['03_Resultados_Pruebas_No_Funcionales.docx', 'Rendimiento, carga, seguridad, accesibilidad, compatibilidad, fiabilidad y mantenibilidad'],
      ['04_Resultados_Pruebas_E2E.docx', 'Flujos de usuario en navegador con capturas'],
      ['05_Resultados_Smoke_Docker.docx', 'Docker, smoke test del pipeline y análisis del workflow'],
      ['06_Informe_Resumen_QA_y_Defectos.docx', 'Este informe']]),
  );
  return documento({ titulo: 'Informe de Resumen QA y Defectos', subtitulo: 'Conclusiones de la ejecución del plan de pruebas', meta: portadaMeta([['Resultado global', `${t.ap} de ${t.total} casos aprobados · ${t.fa} fallidos · ${t.ob} con observación`], ['Defectos', `${defectos.length} registrados (${defectos.filter((d) => d.estado === 'Abierto').length} abiertos)`]]), hijos });
}

// ---------- Generación ----------
const intros = {
  funcionales: 'Pruebas de caja negra sobre la API REST y los eventos Socket.IO, que verifican cada criterio de aceptación con casos positivos y negativos. Siempre que es posible el resultado se confirma también directamente en la base de datos PostgreSQL.',
  e2e: 'Recorridos completos de usuario en un navegador real (Chromium) sobre el frontend desplegado en Docker. Cada caso documenta los pasos, el resultado esperado y el obtenido, e incluye capturas de pantalla como evidencia.',
  nf: 'Pruebas de las características de calidad del sistema: rendimiento, carga y concurrencia, seguridad, accesibilidad y responsive, compatibilidad, fiabilidad y mantenibilidad.',
  smoke: 'Verificación rápida de que el entorno Docker se construye, arranca, es seguro y se mantiene sano, y de que el pipeline CI/CD está bien definido.',
};
const GRUPOS_NF = {
  Rendimiento: 'RNF-01: el listado responde en menos de 2 s para el 95 % de las solicitudes. Se mide la API, las páginas en el navegador y el peso del bundle.',
  'Carga y concurrencia': 'Cargas simultáneas sobre sockets y reservas para comprobar la integridad (sin eventos perdidos ni reservas duplicadas) bajo presión.',
  Seguridad: 'RNF-03 y buenas prácticas: manejo del JWT, control de acceso, inyección SQL y XSS, CORS y cabeceras, límite de intentos, secretos y dependencias.',
  'Usabilidad y accesibilidad': 'RNF-05 y WCAG 2.1 AA: accesibilidad automatizada, diseño responsive entre 360 y 1920 px y uso con teclado.',
  Compatibilidad: 'Funcionamiento en los tres motores de navegador: Chromium, Firefox y WebKit.',
  Fiabilidad: 'Recuperación ante la caída de la base de datos, idempotencia de las migraciones y manejo correcto de la zona horaria.',
  Mantenibilidad: 'Calidad estática del código y cobertura de las pruebas automatizadas.',
};
const GRUPOS_E2E = {
  Autenticación: 'US-01, US-02 y US-03: registro, inicio de sesión, rutas protegidas y recuperación de contraseña.',
  Catálogo: 'US-04 a US-07: listado, filtros, detalle de la cancha y selección de fecha y hora.',
  'Flujo de reserva': 'US-08 a US-11: el recorrido de reserva completo, sus validaciones, errores y la confirmación.',
  'Temporizador y tiempo real': 'US-17 y US-18: temporizador de 3 minutos, retención de franjas y disponibilidad en tiempo real entre usuarios.',
  Transversal: 'Verificaciones que abarcan todo el recorrido.',
};

const lanzamientos = [];
const dentro = (f) => `${SALIDA}/${f}`;
lanzamientos.push(guardar(docPlan(), dentro('01_Plan_de_Pruebas_QA.docx')));

if (fun) {
  const r = docResultados({ archivo: '02', titulo: 'Resultados de Pruebas Funcionales', subtitulo: 'API REST y Socket.IO por historia de usuario', suite: fun, agrupar: (c) => c.grupo, intro: intros.funcionales, metodologia: 'Cada caso se ejecuta con un script automatizado que usa peticiones HTTP (fetch) y conexiones Socket.IO reales contra el entorno Docker. Las verificaciones se evalúan una por una (no se detiene en la primera falla) y se registran con ✓ (cumple) o ✗ (no cumple). Cuando el resultado debe verse en la base de datos se consulta directamente PostgreSQL.', extraFinal: seccionJest(), idsExtra: ['JEST'] });
  lanzamientos.push(guardar(r.doc, dentro('02_Resultados_Pruebas_Funcionales.docx')));
}
if (nf) {
  const r = docResultados({ archivo: '03', titulo: 'Resultados de Pruebas No Funcionales', subtitulo: 'Rendimiento, seguridad, accesibilidad, compatibilidad, fiabilidad y mantenibilidad', suite: nf, agrupar: (c) => c.grupo, introGrupos: GRUPOS_NF, intro: intros.nf, metodologia: 'Las mediciones se hacen contra el entorno Docker local con scripts automatizados: latencias con temporizadores de alta resolución, carga con clientes Socket.IO reales, accesibilidad con axe-core, navegadores con Playwright y dependencias con npm audit. Los valores de rendimiento dependen del hardware indicado más abajo.' });
  lanzamientos.push(guardar(r.doc, dentro('03_Resultados_Pruebas_No_Funcionales.docx')));
}
if (e2e) {
  const r = docResultados({ archivo: '04', titulo: 'Resultados de Pruebas End-to-End', subtitulo: 'Flujos de usuario completos en navegador', suite: e2e, agrupar: (c) => c.grupo, introGrupos: GRUPOS_E2E, intro: intros.e2e, metodologia: 'Cada caso abre uno o más contextos de navegador aislados (Chromium con Playwright), actúa como un usuario (clics, escritura, teclado y táctil) y verifica lo que se ve en pantalla y lo que queda en la base de datos. Las capturas son evidencia de los momentos clave.' });
  lanzamientos.push(guardar(r.doc, dentro('04_Resultados_Pruebas_E2E.docx')));
}
if (smoke) {
  const r = docResultados({ archivo: '05', titulo: 'Resultados del Smoke Test de Docker', subtitulo: 'Contenedorización (US-19) y pipeline CI/CD (US-20)', suite: smoke, agrupar: (c) => c.hu, intro: intros.smoke, metodologia: 'Las verificaciones usan los mismos comandos que el pipeline (docker compose, scripts/smoke-test.sh) sobre un proyecto Docker aislado construido desde cero, sin caché. La fase final destruye el entorno para probar la persistencia y la recuperación.' });
  lanzamientos.push(guardar(r.doc, dentro('05_Resultados_Smoke_Docker.docx')));
}
lanzamientos.push(guardar(docResumen(), dentro('06_Informe_Resumen_QA_y_Defectos.docx')));
await Promise.all(lanzamientos);
console.log('Documentos generados en', SALIDA);
fs.readdirSync(SALIDA).filter((f) => f.endsWith('.docx')).forEach((f) => console.log(' -', f, `${(fs.statSync(`${SALIDA}/${f}`).size / 1024).toFixed(0)} KB`));
