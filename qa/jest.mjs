// Ejecuta las pruebas unitarias y de integración del backend (Jest) con cobertura, contra un
// Postgres temporal (contenedor aparte, puerto 5434) y guarda los resultados en jest.json.
import fs from 'node:fs';
import path from 'node:path';
import { sh, ROOT, OUT, esperar } from './lib.mjs';

const NOMBRE = 'canchaya-qa-jest-pg';
const salida = path.join(OUT, 'jest-bruto.json');
const cobertura = path.join(OUT, 'cobertura');

sh(`docker rm -f ${NOMBRE}`);
const run = sh(`docker run -d --rm --name ${NOMBRE} -e POSTGRES_DB=canchaya_test -e POSTGRES_USER=canchaya -e POSTGRES_PASSWORD=canchaya -p 5434:5432 postgres:16-alpine`);
if (run.code !== 0) throw new Error(`No se pudo iniciar Postgres: ${run.out}`);
for (let i = 0; i < 40; i += 1) {
  if (sh(`docker exec ${NOMBRE} pg_isready -U canchaya -d canchaya_test`).code === 0) break;
  await esperar(1000);
}
await esperar(2000);

const env = { DATABASE_URL: 'postgresql://canchaya:canchaya@localhost:5434/canchaya_test', JWT_SECRET: 'secreto-solo-para-ci' };
const migra = sh('npm run migrate', { cwd: `${ROOT}/backend`, env });
const t0 = Date.now();
const r = sh(`npx jest --runInBand --forceExit --json --outputFile="${salida}" --coverage --coverageReporters=json-summary --coverageDirectory="${cobertura}" --collectCoverageFrom="src/**/*.js"`, { cwd: `${ROOT}/backend`, env, timeout: 300000 });
const duracion = Date.now() - t0;
sh(`docker stop ${NOMBRE}`);

const bruto = JSON.parse(fs.readFileSync(salida, 'utf8'));
const resumenCob = JSON.parse(fs.readFileSync(path.join(cobertura, 'coverage-summary.json'), 'utf8'));
const suites = bruto.testResults.map((s) => ({
  archivo: path.relative(`${ROOT}/backend`, s.name).replace(/\\/g, '/'),
  estado: s.status === 'passed' ? 'APROBADA' : 'FALLIDA',
  duracionMs: s.endTime - s.startTime,
  tests: s.assertionResults.map((t) => ({ grupo: t.ancestorTitles.join(' › '), nombre: t.title, estado: t.status === 'passed' ? 'APROBADA' : t.status === 'pending' ? 'OMITIDA' : 'FALLIDA', duracionMs: t.duration ?? 0 })),
}));
const resultado = {
  fecha: new Date().toISOString(),
  migracion: migra.code === 0,
  duracionMs: duracion,
  resumen: { suites: bruto.numTotalTestSuites, suitesAprobadas: bruto.numPassedTestSuites, pruebas: bruto.numTotalTests, aprobadas: bruto.numPassedTests, fallidas: bruto.numFailedTests, omitidas: bruto.numPendingTests },
  suites,
  cobertura: resumenCob,
};
fs.writeFileSync(path.join(OUT, 'jest.json'), JSON.stringify(resultado, null, 2));
console.log(JSON.stringify(resultado.resumen), 'cobertura total líneas:', resumenCob.total.lines.pct, '%');
process.exit(r.code === 0 ? 0 : 1);
