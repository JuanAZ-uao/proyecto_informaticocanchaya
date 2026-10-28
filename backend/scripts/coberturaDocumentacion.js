// Compara los endpoints implementados en Express contra los documentados en openapi/openapi.yaml
// y calcula el porcentaje de cobertura (RNF-07: mínimo 90 %).
//   npm run docs:cobertura            → imprime la tabla y falla si la cobertura es menor al 90 %
//   npm run docs:cobertura -- --md    → imprime la tabla en Markdown (para el README / informes)
const MINIMO = 90;

function normalizarRuta(ruta) {
  return quitarBarrasFinales(ruta.replace(/:([A-Za-z0-9_]+)/g, '{$1}')) || '/';
}

// Sin expresión regular: evita el backtracking de /\/+$/ en rutas largas.
function quitarBarrasFinales(texto) {
  let fin = texto.length;
  while (fin > 0 && texto[fin - 1] === '/') fin -= 1;
  return texto.slice(0, fin);
}

function endpointsImplementados(app) {
  const listarEndpoints = require('express-list-endpoints');
  const encontrados = [];

  for (const { path: ruta, methods } of listarEndpoints(app)) {
    if (ruta.startsWith('/api/docs')) continue; // la propia documentación no es parte de la API de negocio
    for (const metodo of methods) encontrados.push({ metodo: metodo.toLowerCase(), ruta: normalizarRuta(ruta) });
  }

  return encontrados.sort((a, b) => a.ruta.localeCompare(b.ruta) || a.metodo.localeCompare(b.metodo));
}

function endpointsDocumentados(especificacion) {
  const metodosHttp = ['get', 'post', 'put', 'patch', 'delete'];
  const documentados = [];

  for (const [ruta, operaciones] of Object.entries(especificacion.paths ?? {})) {
    for (const metodo of metodosHttp) {
      if (operaciones[metodo]) documentados.push({ metodo, ruta: normalizarRuta(ruta) });
    }
  }

  return documentados;
}

function calcularCobertura(app, especificacion) {
  const implementados = endpointsImplementados(app);
  const documentados = endpointsDocumentados(especificacion);
  const clave = ({ metodo, ruta }) => `${metodo} ${ruta}`;
  const setDocumentados = new Set(documentados.map(clave));
  const setImplementados = new Set(implementados.map(clave));

  const filas = implementados.map((e) => ({ ...e, documentado: setDocumentados.has(clave(e)) }));
  const cubiertos = filas.filter((f) => f.documentado).length;

  return {
    filas,
    implementados: implementados.length,
    documentados: cubiertos,
    porcentaje: implementados.length === 0 ? 0 : Math.round((cubiertos / implementados.length) * 1000) / 10,
    sobrantes: documentados.filter((d) => !setImplementados.has(clave(d))),
  };
}

function tablaTexto({ filas, implementados, documentados, porcentaje, sobrantes }) {
  const lineas = filas.map((f) => `${f.documentado ? 'SI' : 'NO'}  ${f.metodo.toUpperCase().padEnd(6)} ${f.ruta}`);
  lineas.push('', `Endpoints implementados: ${implementados}`, `Endpoints documentados:  ${documentados}`, `Cobertura: ${porcentaje} %`);
  if (sobrantes.length) lineas.push(`Documentados que no existen: ${sobrantes.map((s) => `${s.metodo.toUpperCase()} ${s.ruta}`).join(', ')}`);
  return lineas.join('\n');
}

function tablaMarkdown({ filas, implementados, documentados, porcentaje }) {
  const cuerpo = filas.map((f) => `| ${f.metodo.toUpperCase()} | \`${f.ruta}\` | ${f.documentado ? 'Sí' : '**No**'} |`);
  return [
    '| Método | Ruta | Documentado |',
    '|---|---|---|',
    ...cuerpo,
    '',
    `**${documentados} de ${implementados} endpoints documentados (${porcentaje} %).**`,
  ].join('\n');
}

module.exports = { MINIMO, calcularCobertura, endpointsImplementados, endpointsDocumentados, tablaTexto, tablaMarkdown };

if (require.main === module) {
  process.env.JWT_SECRET ||= 'solo-para-documentacion';
  process.env.DATABASE_URL ||= 'postgresql://sin:uso@localhost:5432/sin_uso';
  // El script solo lee las rutas: no necesita una base de datos real.
  require.cache[require.resolve('../src/config/db')] = {
    id: 'db', filename: require.resolve('../src/config/db'), loaded: true, exports: { query: async () => ({ rows: [] }), on() {}, connect: async () => ({}) },
  };
  const app = require('../src/app');
  const { cargarEspecificacion } = require('../src/config/documentacion');
  const resultado = calcularCobertura(app, cargarEspecificacion());

  console.log(process.argv.includes('--md') ? tablaMarkdown(resultado) : tablaTexto(resultado));
  process.exit(resultado.porcentaje >= MINIMO && resultado.sobrantes.length === 0 ? 0 : 1);
}
