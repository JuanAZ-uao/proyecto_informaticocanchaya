// Genera el informe PDF de prácticas de control de versiones (Sprint Review #3 y #4).
//   node docs/informe/generar-informe.mjs [ruta-de-salida.pdf]
// Formato: Arial 12 pt, texto justificado y todo en negro. Los datos salen del historial de Git, de la
// API pública de GitHub (datos-informe.json) y de los resultados de QA (qa/resultados).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const AQUI = import.meta.dirname;
const ROOT = path.resolve(AQUI, '../..');
const EVID = path.join(AQUI, 'evidencias');
const requireQa = createRequire(path.join(ROOT, 'qa/package.json'));
const { chromium } = requireQa('playwright');
const salida = process.argv[2] ?? path.join(AQUI, 'Informe_Control_de_Versiones_Sprint_3.pdf');
const datos = JSON.parse(fs.readFileSync(path.join(AQUI, 'datos-informe.json'), 'utf8'));

const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const esc = (t) => String(t).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const leer = (n) => (fs.existsSync(path.join(ROOT, `qa/resultados/${n}.json`)) ? JSON.parse(fs.readFileSync(path.join(ROOT, `qa/resultados/${n}.json`), 'utf8')) : null);
const existe = (f) => fs.existsSync(path.join(EVID, f));

// ---------- Figuras y tablas ----------
let nFigura = 0;
let nTabla = 0;
function figura(archivo, leyenda, { ancho = '100%' } = {}) {
  if (!existe(archivo)) return `<p class="aviso">[Falta la imagen ${esc(archivo)}]</p>`;
  nFigura += 1;
  const datosImg = fs.readFileSync(path.join(EVID, archivo)).toString('base64');
  const tipo = archivo.endsWith('.png') ? 'png' : 'jpeg';
  return `<figure><img src="data:image/${tipo};base64,${datosImg}" alt="${esc(leyenda)}" style="width:${ancho}"><figcaption>Figura ${nFigura}. ${esc(leyenda)}</figcaption></figure>`;
}
function tabla(titulo, encabezados, filas, { anchos } = {}) {
  nTabla += 1;
  const cols = anchos ? `<colgroup>${anchos.map((a) => `<col style="width:${a}">`).join('')}</colgroup>` : '';
  return `<p class="titulo-tabla">Tabla ${nTabla}. ${esc(titulo)}</p><table>${cols}<thead><tr>${encabezados.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${typeof c === 'object' && c !== null ? c.html : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const enlace = (url, texto = url) => `<a href="${esc(url)}">${esc(texto)}</a>`;
const h1 = (t) => `<h1>${esc(t)}</h1>`;
const h2 = (t) => `<h2>${esc(t)}</h2>`;
const p = (t) => `<p>${t}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const ol = (items) => `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;

// ---------- Datos del repositorio ----------
const repo = datos.repo;
const urlPr = (n) => `${repo}/pull/${n}`;
const shortlog = git('shortlog -sn --all').split('\n').map((l) => l.trim().split(/\s+/)).map(([n, ...nombre]) => [nombre.join(' '), n]);
const commitsTotales = git('rev-list --all --count');
const AUTORES = { 'JuanAZ-uao': 'Juan Esteban Panesso Bernal', Juansec01: 'Juan Sebastián Castillo Acevedo', 'Samuel Rios': 'Samuel Ríos Calderón', ByronZapata2003: 'Byron Stiven Zapata Zapata' };
const CORTO = { 'JuanAZ-uao': 'J. E. Panesso', Juansec01: 'J. S. Castillo', 'Samuel Rios': 'S. Ríos', ByronZapata2003: 'B. Zapata' };

// Commits del ciclo (Sprint 3: 30 de septiembre al 13 de octubre) con su historia de usuario.
const HU_DE_COMMIT = {
  '8f7aee5': 'US-08', b071329: 'US-09', '5b9d8d3': 'US-08, US-09, US-10, US-17', '3fdf148': 'US-08, US-09, US-10, US-17', '8a4716a': 'US-08, US-09',
  c2f18cb: 'US-08, US-09', '4d07a4d': 'US-20 (CI/CD)', ec48c97: 'PIG1-22 (plan de pruebas)', '548e6ad': 'US-11, US-18, US-19, US-20', ee309ca: 'US-20 (CI/CD)',
  '1780736': 'Correcciones de QA (DEF-01 a DEF-10)', '351c9d0': 'US-13', eb180bc: 'US-12', '618e3ac': 'US-21', '6576922': 'US-21', '20baa05': 'US-21',
  '07d8ce2': 'US-21', b51b71c: 'US-21', '7e8202f': 'US-21', be08e91: 'US-12 (resolución del conflicto)', '52c31a6': 'US-12 (merge del PR #5)', fe996dc: 'US-21 (merge del PR #6)', '7910419': 'US-13 (merge del PR #4)', '543243a': 'US-11, US-18, US-19, US-20 (merge del PR #3)',
};
const desde = '2026-09-29';
const lineasLog = git(`log --all --since=${desde} --format=%x1e%h%x1f%an%x1f%ad%x1f%s --date=short`).split('\x1e').filter(Boolean).map((l) => l.split('\x1f'));
const filasCommits = lineasLog
  .filter(([h]) => HU_DE_COMMIT[h])
  .sort((a, b) => a[2].localeCompare(b[2]))
  .map(([h, a, f, m]) => [h, CORTO[a] ?? a, f, esc(m.replace(/\s+/g, ' ').trim().slice(0, 70)) + (m.trim().length > 70 ? '…' : ''), HU_DE_COMMIT[h]]);
const grafo = git('log --oneline --graph --all -n 28 --decorate=short --format=%h%x20%s').split('\n').map((l) => l.slice(0, 118)).join('\n');

// ---------- Resultados de calidad (opcionales) ----------
const fun = leer('funcionales');
const e2e = leer('e2e');
const nf = leer('nofuncionales');
const sm = leer('smoke');
const jest = leer('jest');
const sonar = leer('sonar-2') ?? leer('sonar-1');
const resumen = (s) => (s ? { total: s.casos.length, ok: s.casos.filter((c) => c.estado === 'APROBADA').length, fa: s.casos.filter((c) => c.estado === 'FALLIDA').length, ob: s.casos.filter((c) => c.estado === 'OBSERVACIÓN').length } : null);
const numDefectos = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/datos/defectos.json'), 'utf8')).length;
const medida = (k) => sonar?.medidas.find((m) => m.metric === k)?.value ?? '—';

// ---------- Contenido ----------
const cuerpo = [];

// Portada
cuerpo.push(`<section class="portada">
<p class="centro"><strong>UNIVERSIDAD AUTÓNOMA DE OCCIDENTE</strong><br>Facultad de Ingeniería<br>Proyecto Informático 1 · 2026-2</p>
<p class="centro grande"><strong>INFORME DE PRÁCTICAS DE INGENIERÍA:<br>CONTROL DE VERSIONES, PULL REQUESTS Y REVISIÓN DE CÓDIGO</strong></p>
<p class="centro"><strong>Proyecto CanchaYa · Sprint Review #3 y #4</strong></p>
<p class="centro">Equipo de desarrollo</p>
<table class="sin-borde" role="presentation"><tbody>
<tr><td>Samuel Ríos Calderón (2230205)</td><td>GitHub: Samuel Rios</td></tr>
<tr><td>Juan Esteban Panesso Bernal (2215930)</td><td>GitHub: JuanAZ-uao</td></tr>
<tr><td>Juan Sebastián Castillo Acevedo (2231921)</td><td>GitHub: Juansec01</td></tr>
<tr><td>Byron Stiven Zapata Zapata (2210718)</td><td>GitHub: ByronZapata2003</td></tr>
</tbody></table>
<p class="centro">Docente: Jorge González Rivera</p>
<p class="centro">Repositorio: ${enlace(repo)}</p>
<p class="centro">Cali · 14 de octubre de 2026</p>
</section>`);

// Contenido (índice simple)
cuerpo.push(`<section class="pagina">${h1('Contenido')}
${ol(['Tablero de la Sprint Planning y sprint backlog (Sprint #3 y #4)', 'Repositorio, README y .gitignore', 'Tabla resumen de Pull Requests', 'Evidencias del historial de Git del ciclo (Sprint #3)', 'Preguntas guía sobre las prácticas de ingeniería', 'Calidad del incremento: pruebas, SonarQube y documentación de la API', 'Declaración de uso de inteligencia artificial', 'Estado de cumplimiento de la guía y mejoras'])}
</section>`);

// 1. Tablero
cuerpo.push(`<section class="pagina">${h1('1. Tablero de la Sprint Planning y sprint backlog')}
${p('La Sprint Planning #3 definió el alcance del motor de reservas (validación de disponibilidad, bloqueo de duplicados, flujo rápido de reserva y temporizador por socket) más el plan de pruebas de QA. Las figuras 1 y 2 muestran el tablero de Jira con el listado de historias de usuario (HU) del sprint backlog actual: el Sprint 3 (30 de septiembre al 13 de octubre) y el Sprint 4 (14 al 27 de octubre).')}
${figura('jira-sprint-3.png', 'Tablero de Jira: Sprint Backlog del Sprint 3 (30 sep – 13 oct), 5 actividades.')}
${figura('jira-sprint-4.png', 'Tablero de Jira: Sprint Backlog del Sprint 4 (14 oct – 27 oct), 8 actividades.')}
${tabla('Historias de usuario de los sprints 3 y 4 según el tablero', ['Sprint', 'Clave Jira', 'Historia de usuario', 'Puntos'], [
  ['3', 'PIG1-12', 'US-08 · Validación de disponibilidad', '8'], ['3', 'PIG1-13', 'US-09 · Bloqueo de reserva duplicada', '8'], ['3', 'PIG1-14', 'US-10 · Flujo rápido de reserva', '5'],
  ['3', 'PIG1-40', 'US-17 · Temporizador de sesión de reserva (Socket)', '5'], ['3', 'PIG1-22', 'Plan de pruebas y casos de prueba (QA)', '—'],
  ['4', 'PIG1-15', 'US-11 · Confirmación de reserva', '3'], ['4', 'PIG1-16', 'US-12 · Reservas múltiples', '3'], ['4', 'PIG1-17', 'US-13 · Historial de reservas', '3'],
  ['4', 'PIG1-41', 'US-18 · Retención de franja y disponibilidad en tiempo real (Socket)', '5'], ['4', 'PIG1-23', 'Documentación técnica de API (OpenAPI/Swagger)', '—'],
  ['4', 'PIG1-42', 'US-19 · Contenedorización con Docker', '5'], ['4', 'PIG1-43', 'US-20 · Pipeline CI/CD con Docker', '5'], ['4', 'PIG1-44', 'US-21 · Integración de SonarQube y continuación de pruebas QA', '5'],
], { anchos: ['10%', '14%', '62%', '14%'] })}
</section>`);

// 2. Repositorio
cuerpo.push(`<section class="pagina">${h1('2. Repositorio, README y .gitignore')}
${p(`Repositorio público del proyecto: ${enlace(repo)}. Contiene dos proyectos npm independientes (backend y frontend), la configuración de Docker Compose, el pipeline de GitHub Actions, las pruebas de QA y la documentación.`)}
${h2('2.1 README.md')}
${p(`El README (${enlace(repo + '/blob/sprint_4/README.md', 'README.md')}) incluye lo que pide la guía:`)}
${ul(['<strong>Descripción del proyecto:</strong> aplicación web para consultar canchas sintéticas, ver su disponibilidad y reservar franjas de una hora, sin reservas duplicadas y con disponibilidad en tiempo real.', '<strong>Stack tecnológico:</strong> React 18 con Vite, Node.js 22 con Express, PostgreSQL, Socket.IO, Docker Compose, GitHub Actions, Jest, Playwright, SonarQube y OpenAPI/Swagger.', '<strong>Estrategia de ramas con diagrama:</strong> <em>main</em> (versión validada), <em>sprint_N</em> (integración del sprint), <em>feature/us-n-descripcion</em> (una rama por historia), <em>fix/</em> y <em>qa/</em>. La figura 3 resume el diagrama.', '<strong>Convención de commits:</strong> Conventional Commits con los tipos feat, fix, docs, test, refactor, style, build, ci, chore y perf, con el formato tipo(alcance): descripción corta en imperativo.', '<strong>Proceso de Pull Request, método de fusión y resolución de conflictos.</strong>', 'Además, la evolución del proyecto por sprint con capturas del tablero de Jira, la documentación de la API y el resumen de las pruebas de QA.'])}
${figura('diagrama-ramas.png', 'Estrategia de ramas del equipo (diagrama del README).', { ancho: '92%' })}
${h2('2.2 Archivo .gitignore')}
${p('El .gitignore de la raíz, junto con los de backend y frontend, excluye lo que no debe versionarse en un proyecto Node.js con Docker:')}
${ul(['<strong>Dependencias y artefactos:</strong> node_modules/, dist/, build/ y coverage/.', '<strong>Variables de entorno:</strong> .env y .env.* (con la excepción !.env.example). El archivo .env real contiene credenciales de la base de datos y nunca se sube; solo se versionan los .env.example sin secretos.', '<strong>Registros:</strong> npm-debug.log* y *.log.', '<strong>Sistema operativo y editores:</strong> .DS_Store, Thumbs.db y .idea/.', '<strong>SonarQube:</strong> .scannerwork/, report-task.txt y .sonar_lock.'])}
${h2('2.3 Ramas del repositorio y su relación con las historias de usuario')}
${tabla('Ramas remotas y la historia de usuario que desarrollan', ['Rama', 'Historia de usuario', 'Integrante'], [
  ['feature/us-08-validacion-disponibilidad', 'US-08', 'Juan Sebastián Castillo'], ['US-09/Bloqueo_reserva_duplicada', 'US-09', 'Samuel Ríos'], ['US-07/Selección_de_fecha_hora', 'US-07 (Sprint 2)', 'Samuel Ríos'],
  ['H.U-06-Filtro_de_canchas', 'US-06 (Sprint 2)', 'Byron Zapata'], ['feature/ci-cd-pipeline', 'CI/CD inicial (Sprint 2)', 'Juan Sebastián Castillo'], ['US--11,18,19,20', 'US-11, US-18, US-19, US-20', 'Juan Esteban Panesso'],
  ['feature/us-13-historial-reservas', 'US-13', 'Juan Sebastián Castillo'], ['US-12/Reservas_multiples', 'US-12', 'Samuel Ríos'], ['US-21_SonarQube_y_continuacion_de_pruebas_QA', 'US-21', 'Byron Zapata'],
  ['qa/sprint-3-testing', 'PIG1-22 (plan de pruebas del Sprint 3)', 'Byron Zapata'], ['sprint_1 · sprint_2 · sprint_3 · sprint_4', 'Ramas de integración de cada sprint', 'Equipo'],
], { anchos: ['44%', '31%', '25%'] })}
${figura('gh-ramas.png', 'Página de ramas del repositorio en GitHub.')}
</section>`);

// 3. Tabla de PR (apaisada)
cuerpo.push(`<section class="apaisada">${h1('3. Tabla resumen de Pull Requests')}
${p('La tabla 3 lista todos los Pull Requests del repositorio al 14 de octubre de 2026, con la URL pública de cada uno. La columna <em>Revisor</em> refleja lo que GitHub tiene registrado: ningún PR tiene aún revisiones ni comentarios de otra persona, por lo que se indica quién fusionó cada uno y el resultado de los checks automáticos.')}
${tabla('Pull Requests del repositorio', ['#PR', 'HU relacionada', 'Autor', 'Revisor', 'Método de merge', 'Enlace'], datos.prs.map((x) => [`#${x.n}`, x.hu, x.autor, x.revisor, x.metodo, { html: enlace(urlPr(x.n)) }]), { anchos: ['6%', '12%', '17%', '19%', '20%', '26%'] })}
${p('Nota: el código de las historias integradas por los PR #5 y #6 lo escribieron Samuel Ríos (US-12) y Byron Zapata (US-21); el PR lo abrió la cuenta JuanAZ-uao porque era quien integraba la rama del sprint.')}
${figura('gh-prs-fusionados.png', 'Pestaña Pull requests de GitHub filtrada con is:pr is:merged: PR fusionados.', { ancho: '78%' })}
</section>`);

// 4. Evidencias Git
const pr = (n) => urlPr(n);
cuerpo.push(`<section class="pagina">${h1('4. Evidencias del historial de Git del ciclo (Sprint #3)')}
${p(`El repositorio tiene ${commitsTotales} commits en todas sus ramas. El comando git shortlog -sn --all muestra el aporte de cada integrante, lo que respalda que los cuatro trabajaron con commits propios:`)}
${tabla('Commits por integrante (git shortlog -sn --all)', ['Cuenta de Git', 'Integrante', 'Commits'], shortlog.map(([n, c]) => [n, AUTORES[n] ?? n, c]), { anchos: ['34%', '46%', '20%'] })}
${h2('4.1 Commits trazables a la tarea de su historia de usuario')}
${p('La tabla siguiente recoge los commits del ciclo (desde el 29 de septiembre) y la historia de usuario a la que corresponde cada uno. La trazabilidad HU → rama → commit existe en los nombres de las ramas y en los PR. Como autocrítica, varios commits agrupan más de una historia (por ejemplo, 3fdf148 con US-08, US-09, US-10 y US-17) y seis commits de la rama de US-21 conservan como mensaje la salida de git status. La convención de commits atómicos con tipo y alcance quedó definida en el README y se aplica desde este punto.')}
${tabla('Commits del ciclo y su historia de usuario', ['Commit', 'Autor', 'Fecha', 'Mensaje', 'HU / tarea'], filasCommits, { anchos: ['14%', '13%', '15%', '31%', '27%'] })}
${figura('git-log-graph.png', 'Historial de Git (git log --oneline --graph --all): ramas de las HU y sus merges en la rama del sprint.', { ancho: '100%' })}
${h2('4.2 Ramas de funcionalidad vinculadas a su historia y un PR fusionado por integrante')}
${tabla('Pull Request fusionado por integrante', ['Integrante', 'Rama de la historia', 'PR fusionado', 'Historia'], [
  ['Juan Esteban Panesso', 'US--11,18,19,20', { html: enlace(pr(3), 'PR #3') }, 'US-11, US-18, US-19, US-20'],
  ['Juan Sebastián Castillo', 'feature/us-08-validacion-disponibilidad · feature/us-13-historial-reservas', { html: `${enlace(pr(2), 'PR #2')} · ${enlace(pr(4), 'PR #4')}` }, 'US-08 · US-13'],
  ['Samuel Ríos', 'US-12/Reservas_multiples', { html: enlace(pr(5), 'PR #5') }, 'US-12'],
  ['Byron Zapata', 'US-21_SonarQube_y_continuacion_de_pruebas_QA', { html: enlace(pr(6), 'PR #6') }, 'US-21'],
], { anchos: ['22%', '38%', '16%', '24%'] })}
${figura('pr3-fusionado.png', 'PR #3 en estado Merged (morado): fusionó 2 commits de la rama US--11,18,19,20 en sprint_4; 6 de 7 checks en verde.', { ancho: '80%' })}
${figura('lista-de-prs.png', 'Lista de Pull Requests con su estado y resultado de los checks automáticos (8 de 10 en el #5, con error; 10 de 10 en el #6).', { ancho: '70%' })}
${h2('4.3 Pull Request con comentarios o solicitudes de modificación antes de la aprobación')}
${existe('pr-con-revision.png')
  ? `${p('El PR siguiente recibió comentarios de otro integrante y cambios solicitados antes de su aprobación.')}${figura('pr-con-revision.png', 'Pull Request con comentarios de revisión y solicitud de cambios.')}${existe('pr-con-revision-lineas.png') ? figura('pr-con-revision-lineas.png', 'Comentario sobre líneas específicas en la pestaña Files changed.') : ''}`
  : `${p('<strong>Estado: pendiente.</strong> A la fecha de este informe ningún PR del repositorio tiene comentarios de revisión ni solicitudes de cambios de otra persona (la API de GitHub devuelve 0 revisiones y 0 comentarios en los PR #1 a #6). Lo que sí revisó cada PR fueron los checks automáticos del pipeline (backend, frontend, SonarQube y Docker): en el PR #5 esos checks marcaron 8 de 10 y alertaron de un problema que luego se corrigió (sección 4.4). El equipo debe registrar la revisión cruzada en el siguiente PR para cumplir este criterio; el procedimiento está descrito en la sección 8.')}`}
${h2('4.4 Conflicto de fusión y su corrección')}
${p('<strong>Qué pasó.</strong> Al integrar la historia US-12 (rama US-12/Reservas_multiples), GitHub mostró el aviso «This branch has conflicts that must be resolved» en el PR #5, porque la rama del sprint (sprint_4) había avanzado con otras historias (US-11, US-18, US-19, US-20, US-13 y US-21) desde que se creó la rama de la historia.')}
${figura('pr5-conflictos-bloquean-merge.png', 'PR #5: GitHub bloquea el botón Merge pull request hasta resolver los conflictos en dos archivos.', { ancho: '70%' })}
${figura('pr5-editor-de-conflictos.png', 'Editor de conflictos de GitHub: marcadores del conflicto en reservaRepository.js (mock de pruebas).', { ancho: '90%' })}
${tabla('Archivos y líneas que entraron en conflicto', ['Archivo', 'Líneas', 'Causa del conflicto'], [
  ['backend/src/repositories/__mocks__/reservaRepository.js', '1 a 14', 'sprint_4 tenía todo el export del mock en una sola línea; US-12 lo reescribió en varias líneas y agregó los métodos existeSolapadaDeUsuario y contarConfirmadasPorUsuario. Los dos cambios tocaron las mismas líneas.'],
  ['backend/tests/reservaService.test.js', 'Bloque de datosReserva y mocks de beforeEach', 'US-12 usaba una fecha calculada (fechaFutura) y mocks nuevos; sprint_4 cambió la fecha y agregó pruebas de US-18 en el mismo bloque.'],
], { anchos: ['38%', '17%', '45%'] })}
${p('<strong>Comandos usados para identificarlo y resolverlo</strong> (en el repositorio local, sobre la rama sprint_4):')}
${ul(['git fetch origin para traer los cambios de GitHub.', 'git merge origin/sprint_4 para fusionar y provocar el conflicto.', 'git status y git diff --name-only --diff-filter=U para listar los archivos en conflicto.', 'git add archivo1 archivo2 (solo los archivos resueltos, sin git add .) y git commit para cerrar el merge.'])}
${p('<strong>Cómo decidimos qué conservar.</strong> En el mock se conservaron todos los métodos de ambas versiones (los de US-12 y los de sprint_4), porque cada historia los necesita. En el archivo de pruebas se mantuvieron las pruebas de US-18 y las nuevas de US-12 y se dejó una sola fecha futura. Al revisar el resultado se vio que la resolución hecha en la interfaz web de GitHub (opción «Accept both changes») había dejado marcadores de conflicto anidados dentro del código ya fusionado (por eso los checks del PR #5 marcaron 8 de 10): se eliminaron los marcadores y se unificaron los bloques a mano.')}
${p('<strong>Cómo verificamos que todo funcionaba.</strong> Se buscaron marcadores residuales en todo el repositorio, se ejecutaron las pruebas de backend con una base de datos real (92 pruebas en verde al resolver el conflicto) y la regresión completa de QA (funcionales, E2E, no funcionales y smoke de Docker). Esa verificación mostró además que la historia US-13 había quedado incompleta tras la fusión y que las pruebas de US-12 no respetaban la validación de horario; ambos defectos (DEF-11 y DEF-13 del informe de QA) se corrigieron.')}
${figura('ci-backend-fallando.png', 'Checks del push: el job «Backend - lint y pruebas» falla mientras el conflicto estaba mal resuelto.', { ancho: '55%' })}
${figura('ci-fallos-notificaciones.png', 'Notificaciones de GitHub Actions: el pipeline falló en la rama US-12/Reservas_multiples y en sprint_4.', { ancho: '80%' })}
${h2('4.5 Integración continua como control de calidad del PR')}
${p('Cada PR dispara el pipeline de GitHub Actions. Las figuras siguientes muestran los checks de un PR fusionado correctamente (backend, frontend, Docker y despliegue en verde) y el detalle de cada job.')}
${figura('checks-completos-con-despliegue.png', 'Los 4 checks del pipeline en verde tras la fusión en sprint_4.', { ancho: '55%' })}
${figura('pr3-checks-push-y-pr.png', 'Checks del PR #3 en las ejecuciones push y pull_request.', { ancho: '48%' })}
${figura('job-backend.png', 'Detalle del job Backend - lint y pruebas.', { ancho: '82%' })}
${figura('job-docker.png', 'Detalle del job Docker - build y smoke test (incluye la prueba de carga de 100 conexiones).', { ancho: '82%' })}
${figura('job-despliegue.png', 'Job Desplegar en entorno local ejecutado en el self-hosted runner.', { ancho: '82%' })}
${h2('4.6 Protección de ramas')}
${p('<strong>Estado: no configurada.</strong> En el repositorio no está activa la regla «Require a pull request before merging» con «Require approvals» (Settings → Branches → Branch protection rules), de modo que hoy la revisión no está forzada por configuración y el PR #5 se fusionó con checks en rojo. Esta mejora está incluida en la sección 8.')}
</section>`);

// 5. Preguntas guía
cuerpo.push(`<section class="pagina">${h1('5. Preguntas guía sobre las prácticas de ingeniería')}
${h2('5.1 ¿Por qué evitar cambios directos en la rama principal del proyecto?')}
${p('La rama principal debe contener siempre una versión que funciona y que ya fue validada. Un push directo salta la revisión y las pruebas automáticas, impide saber quién cambió qué y por qué, y deja a todo el equipo trabajando sobre código que pudo romperse sin que nadie lo haya revisado. En un equipo de cuatro personas que modifican los mismos módulos (por ejemplo, reservaService.js y su mock), los cambios directos también multiplican los conflictos. Por eso el equipo trabaja cada historia en su propia rama y solo integra en la rama del sprint (sprint_N) por Pull Request; main queda reservada para la versión validada en el Sprint Review. La experiencia del PR #5 lo confirma: un cambio que entró sin revisión suficiente dejó marcadores de conflicto dentro del código y rompió el pipeline hasta corregirlo.')}
${h2('5.2 ¿Cómo funciona nuestro proceso de Pull Request?')}
${ol(['El integrante crea una rama desde la rama del sprint con el número de su historia (por ejemplo, feature/us-13-historial-reservas) y trabaja con commits pequeños.', 'Actualiza la rama con git fetch y git merge origin/sprint_N, y resuelve los conflictos localmente.', 'Abre el PR hacia sprint_N. El título lleva la historia y la descripción explica qué resuelve y cómo se probó.', 'El pipeline de GitHub Actions corre solo: lint y pruebas del backend con una base de datos real, lint y build del frontend, Quality Gate de SonarQube y construcción de Docker con smoke test.', 'Otro integrante revisa el código, comenta y aprueba o solicita cambios; el autor responde con nuevos commits en la misma rama.', 'Con la aprobación y los checks en verde se fusiona con «Create a merge commit» y se elimina la rama.'])}
${p('Ejemplos reales: el PR #4 (US-13) y el PR #3 (US-11, US-18, US-19 y US-20) siguieron este flujo, con los checks automáticos en verde antes de fusionar (8 de 8). La parte de la revisión por otra persona es la que el equipo aún debe registrar en GitHub.')}
${h2('5.3 ¿Qué papel juega la revisión de código en el control de versiones?')}
${p('La revisión es el filtro humano entre el trabajo de una persona y la rama compartida. Detecta errores de lógica que las pruebas no cubren, verifica que el cambio cumple los criterios de aceptación de la historia, mantiene un estilo homogéneo y reparte el conocimiento del código entre los integrantes. En nuestro proyecto lo comprobamos con una revisión posterior a la fusión (la regresión de QA): encontró ${numDefectos} defectos en total, entre ellos que la historia US-13 había quedado incompleta tras unir las ramas (el repositorio no tenía la consulta paginada que la pantalla esperaba) y que las pruebas de integración de US-12 fallaban con la validación de horario. Una revisión previa al merge los habría detectado antes de llegar a la rama del sprint. Además, la revisión deja registro en el PR (comentarios, aprobaciones), que es la evidencia de que el cambio no fue aprobado por su propio autor.')}
${h2('5.4 ¿Cómo se fusiona un Pull Request con una rama?')}
${p('Con el PR abierto y sin conflictos, el revisor pulsa «Merge pull request» (Create a merge commit) en GitHub. GitHub crea un commit de fusión con dos padres (la punta de sprint_N y la punta de la rama de la historia) y sube el resultado a sprint_N. Es equivalente a ejecutar localmente git checkout sprint_4, git merge --no-ff feature/us-13-historial-reservas y git push origin sprint_4. Un ejemplo real es el commit 543243a, «Merge pull request #3 from JuanAZ-uao/US--11,18,19,20», que integró en sprint_4 los commits 548e6ad y ee309ca. Si el PR tiene conflictos, GitHub no permite fusionarlo hasta resolverlos (sección 4.4).')}
${h2('5.5 ¿Qué método de fusión usamos (merge, squash o rebase) y por qué?')}
${p('Usamos <strong>merge commit</strong> (los PR #3, #4, #5 y #6). Elegimos este método porque: (1) conserva todos los commits de la historia con su autor, de modo que se ve quién hizo qué; (2) deja un punto explícito en el historial donde cada historia entró al sprint, visible con git log --graph, lo que da trazabilidad HU → rama → merge; (3) no reescribe commits, algo importante cuando varias personas comparten ramas, y (4) permite revertir una historia completa con un solo git revert -m 1 sobre el commit de fusión. Descartamos <em>squash</em> porque aplasta los commits pequeños en uno solo y perdería el detalle por integrante, y <em>rebase</em> porque cambia los hashes de los commits y puede romper el trabajo de quien ya tenga la rama descargada. El PR #2 (US-08) se integró con un fast-forward local y un push, y GitHub lo marcó como Merged; en adelante todos los PR se fusionan desde GitHub con merge commit.')}
${h2('5.6 ¿Cómo resolvimos un conflicto al fusionar ramas y qué haríamos si se presentara otro?')}
${p('El caso real está documentado en la sección 4.4 (PR #5, historia US-12): se identificaron los archivos con git status y git diff --diff-filter=U, se decidió qué conservar de cada lado, se eliminaron los marcadores, se verificó con las pruebas y se agregaron solo los archivos resueltos antes del commit. Si se presentara otro conflicto, el procedimiento es: (1) no fusionar a ciegas con la opción «Accept both» de la interfaz web sin revisar el resultado; (2) actualizar la rama de la historia con git fetch y git merge origin/sprint_N en local; (3) entender qué intención tiene cada cambio hablando con el autor del otro lado; (4) combinar a mano, buscar marcadores residuales con git grep -n "<<<<<<<" y correr las pruebas; (5) hacer el commit del merge con un mensaje que describa la resolución y subir la rama para que el PR quede sin conflictos. Si no se logra resolver en el sprint, se documenta el motivo y se pide ayuda al autor de la otra rama.')}
</section>`);

// 6. Calidad
const rf = resumen(fun); const re = resumen(e2e); const rn = resumen(nf); const rs = resumen(sm);
const filasCalidad = [];
if (jest) filasCalidad.push(['Pruebas unitarias e integración del backend (Jest)', `${jest.resumen.pruebas} pruebas`, `${jest.resumen.aprobadas} aprobadas · ${jest.resumen.fallidas} fallidas`]);
if (rf) filasCalidad.push(['Pruebas funcionales (API y sockets)', `${rf.total} casos`, `${rf.ok} aprobados · ${rf.fa} fallidos · ${rf.ob} observaciones`]);
if (re) filasCalidad.push(['Pruebas E2E en navegador', `${re.total} casos`, `${re.ok} aprobados · ${re.fa} fallidos · ${re.ob} observaciones`]);
if (rn) filasCalidad.push(['Pruebas no funcionales', `${rn.total} casos`, `${rn.ok} aprobados · ${rn.fa} fallidos · ${rn.ob} observaciones`]);
if (rs) filasCalidad.push(['Smoke test de Docker y pipeline', `${rs.total} casos`, `${rs.ok} aprobados · ${rs.fa} fallidos · ${rs.ob} observaciones`]);
cuerpo.push(`<section class="pagina">${h1('6. Calidad del incremento: pruebas, SonarQube y documentación de la API')}
${p('Las prácticas de control de versiones se apoyan en controles de calidad automáticos antes de integrar. Resumen de la regresión completa ejecutada sobre la rama sprint_4 después de unir las historias US-12, US-13 y US-21:')}
${filasCalidad.length ? tabla('Resultados de la regresión de QA', ['Prueba', 'Cantidad', 'Resultado'], filasCalidad, { anchos: ['46%', '18%', '36%'] }) : ''}
${sonar ? p(`<strong>SonarQube.</strong> Quality Gate ${sonar.gate.status === 'OK' ? 'aprobado' : 'no aprobado'}: ${medida('bugs')} bugs, ${medida('vulnerabilities')} vulnerabilidades, ${medida('security_hotspots')} puntos críticos de seguridad y ${medida('code_smells')} code smells; cobertura del backend ${medida('coverage')} % y duplicación ${medida('duplicated_lines_density')} %.`) : ''}
${p('<strong>Documentación de la API (OpenAPI/Swagger).</strong> La especificación está en backend/openapi/openapi.yaml y se publica con Swagger UI en /api/docs. Documenta los 14 endpoints implementados (cobertura del 100 %, con el 90 % como mínimo) con ejemplos de respuesta, los eventos de Socket.IO y el botón Authorize con token JWT. Se valida con Spectral y con una prueba de contrato que ejecuta los ejemplos contra el backend real; ambas comprobaciones forman parte del pipeline.')}
${p('Los resultados completos están en los documentos de QA de la carpeta docs/testing del repositorio (plan, funcionales, no funcionales, E2E, smoke de Docker, informe de defectos, SonarQube y verificación de la documentación de la API).')}
</section>`);

// 7. IA
cuerpo.push(`<section class="pagina">${h1('7. Declaración de uso de inteligencia artificial')}
${p('El equipo declara que utilizó una herramienta de inteligencia artificial generativa, <strong>Claude Code</strong> (asistente de programación de Anthropic, integrado en Visual Studio Code), como apoyo en el desarrollo del proyecto y en la elaboración de este entregable.')}
${h2('7.1 Para qué se usó')}
${ul(['Implementar y corregir historias de usuario del backend y del frontend (US-10, US-11, US-17, US-18, US-19 y US-20) y completar la historia US-13 después de la fusión de ramas.', 'Resolver los conflictos de fusión y los errores que aparecieron al unir las ramas, y volver a ejecutar las pruebas.', 'Diseñar, programar y ejecutar el plan de pruebas de QA (funcionales, no funcionales, E2E y smoke de Docker), y generar los documentos de resultados.', 'Configurar el pipeline de CI/CD, la contenerización con Docker y el análisis con SonarQube.', 'Redactar la documentación técnica de la API (OpenAPI/Swagger), el README y este informe a partir de datos reales del repositorio y de la API pública de GitHub.'])}
${h2('7.2 Razones que soportan su uso')}
${ul(['Reducir el tiempo de tareas repetitivas y de configuración (pipeline, Docker, documentación) para dedicar más tiempo a las historias de usuario.', 'Ampliar la cobertura de pruebas: la IA permitió ejecutar cientos de verificaciones que habrían tomado mucho más tiempo a mano y encontró defectos reales que el equipo corrigió.', 'Mantener documentación coherente con el código y con los criterios de aceptación.', 'Aprender buenas prácticas (Conventional Commits, flujo de Pull Request, OpenAPI) viendo su aplicación sobre el propio proyecto.'])}
${h2('7.3 Controles aplicados')}
${ul(['Las decisiones de alcance, prioridad y arquitectura las tomó el equipo; la IA ejecutó solo lo solicitado.', 'Todo código generado se ejecutó con pruebas automáticas antes de integrarse, y los resultados se registraron en los documentos de QA.', 'Los datos de este informe (PR, commits, autores, fechas y estado de las revisiones) se tomaron del historial de Git y de la API de GitHub; no se inventaron revisiones ni aprobaciones, y lo que falta se declara como pendiente.', 'Las credenciales reales (archivo .env) nunca se compartieron ni se versionaron.', 'El equipo es responsable de revisar, entender y defender lo entregado; la IA no sustituye la revisión por pares ni la aprobación de los Pull Requests.'])}
</section>`);

// 8. Cumplimiento y mejoras
cuerpo.push(`<section class="pagina">${h1('8. Estado de cumplimiento de la guía y mejoras')}
${tabla('Cumplimiento de los criterios del entregable', ['Criterio', 'Estado', 'Evidencia o acción pendiente'], [
  ['Captura del tablero de la Sprint Planning con las HU de los sprints 3 y 4', 'Cumplido', 'Figuras 1 y 2 y tabla 1.'],
  ['README con descripción, stack, estrategia de ramas (diagrama) y convención de commits', 'Cumplido', 'Sección 2.1 y README.md del repositorio.'],
  ['.gitignore adecuado al stack', 'Cumplido', 'Sección 2.2.'],
  ['Tabla resumen de PR con #PR, HU, autor, revisor, método de merge y URL', 'Cumplido con observación', 'Tabla 3. El campo «Revisor» indica que no hay revisión registrada en GitHub.'],
  ['Commits pequeños, semánticos y trazables a su HU', 'Parcial', 'Trazabilidad por rama y PR (sección 4.1). Los commits agrupan varias HU y varios mensajes no siguen la convención; la convención queda definida y se aplica desde ahora.'],
  ['Ramas de feature vinculadas a su HU y al menos un PR fusionado por integrante', 'Cumplido', 'Sección 4.2: PR #2 y #4 (Castillo), #3 (Panesso), #5 (Ríos), #6 (Zapata). Los PR #5 y #6 los abrió la cuenta JuanAZ-uao.'],
  ['Al menos un PR con comentarios o cambios solicitados antes de aprobarse', 'Pendiente', 'Sin evidencia en GitHub. Acción: ver el procedimiento de abajo.'],
  ['Simulación de un conflicto y su corrección', 'Cumplido', 'Sección 4.4 (PR #5).'],
  ['Declaración de uso de IA', 'Cumplido', 'Sección 7.'],
  ['Branch protection activa (evidencia recomendada por la guía)', 'Pendiente', 'No configurada. Acción: ver el procedimiento de abajo.'],
], { anchos: ['38%', '17%', '45%'] })}
${h2('Acciones del equipo antes de entregar')}
${ol(['<strong>PR con revisión real.</strong> Abrir el PR de la siguiente historia desde su rama hacia sprint_4; otro integrante lo revisa en GitHub, deja al menos un comentario general y uno sobre una línea específica en «Files changed», pulsa «Request changes», el autor corrige con un nuevo commit y el revisor pulsa «Approve». Después se fusiona con merge commit y se captura la conversación y el panel Reviewers.', '<strong>Branch protection.</strong> En GitHub: Settings → Branches → Add branch protection rule sobre sprint_4 (y main cuando exista), con «Require a pull request before merging» y «Require approvals» (1) marcados, más «Require status checks to pass». Capturar la pantalla.', '<strong>Commits atómicos.</strong> Aplicar desde ahora la convención tipo(alcance): descripción, un cambio lógico por commit.'])}
${p('Cuando existan esas evidencias, se guardan como pr-con-revision.png (y opcionalmente pr-con-revision-lineas.png) en la carpeta docs/informe/evidencias y se regenera este informe con node docs/informe/generar-informe.mjs.')}
</section>`);

// ---------- HTML ----------
const css = `
@page { size: Letter; margin: 2.5cm 2.5cm 2.5cm 2.5cm; }
@page apaisada { size: Letter landscape; margin: 2cm; }
* { font-family: Arial, 'Liberation Sans', sans-serif; font-size: 12pt; color: #000; box-sizing: border-box; }
body { margin: 0; line-height: 1.4; text-align: justify; }
p, li { text-align: justify; margin: 0 0 8pt 0; }
h1, h2 { font-weight: bold; text-align: left; margin: 16pt 0 8pt 0; page-break-after: avoid; }
h1 { text-transform: uppercase; }
ul, ol { margin: 0 0 8pt 0; padding-left: 22pt; }
a { text-decoration: underline; color: #000; word-break: break-all; }
section.pagina { page-break-before: always; }
section.portada { padding-top: 20pt; text-align: center; }
section.apaisada { page: apaisada; page-break-before: always; }
.centro { text-align: center; }
.grande { margin: 36pt 0; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 4pt 0 10pt 0; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #000; padding: 4pt 5pt; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
th { background: #d9d9d9; font-weight: bold; }
table.sin-borde { width: 100%; margin: 14pt auto; table-layout: auto; }
table.sin-borde td { border: none; text-align: left; padding: 2pt 6pt; }
.titulo-tabla { font-weight: bold; text-align: left; margin: 10pt 0 2pt 0; page-break-after: avoid; }
figure { margin: 8pt 0 12pt 0; text-align: center; page-break-inside: avoid; }
figure img { display: block; margin: 0 auto; border: 1px solid #000; max-width: 100%; }
figcaption { text-align: center; margin-top: 4pt; }
.aviso { text-align: center; }
`;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de control de versiones · CanchaYa</title><style>${css}</style></head><body>${cuerpo.join('\n')}</body></html>`;
fs.writeFileSync(path.join(AQUI, 'informe.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({
  path: salida,
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%; text-align:center; font-family: Arial, sans-serif; font-size: 16px; color:#000;"><span class="pageNumber"></span></div>',
});
await browser.close();
console.log('PDF generado:', salida);
