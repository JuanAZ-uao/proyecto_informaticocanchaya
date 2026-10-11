// Funciones de formato para los documentos Word de QA (docx).
import fs from 'node:fs';
import path from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, BorderStyle, ImageRun, Header, Footer, PageNumber, PageBreak, LevelFormat, VerticalAlign,
} from 'docx';
import { HU } from './hu.mjs';
import { EVID } from './lib.mjs';

export const W = 10080; // ancho útil (Letter, márgenes de 0,75")
const VERDE = '0A3D2A';
const GRIS = '5B6770';
const COLOR_ESTADO = {
  APROBADA: { texto: '1B5E20', fondo: 'E8F5E9', etiqueta: 'APROBADA' },
  FALLIDA: { texto: 'B71C1C', fondo: 'FDECEA', etiqueta: 'FALLIDA' },
  'OBSERVACIÓN': { texto: '8A4B00', fondo: 'FFF3E0', etiqueta: 'OBSERVACIÓN' },
};
const FUENTE = 'Arial';

const borde = { style: BorderStyle.SINGLE, size: 4, color: 'C5CDD3' };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

// ---------- Texto ----------
export function runs(texto, base = {}) {
  if (Array.isArray(texto)) return texto.flatMap((t) => runs(t, base));
  if (typeof texto === 'object' && texto !== null) return [new TextRun({ font: FUENTE, size: 19, ...base, ...texto })];
  return [new TextRun({ font: FUENTE, size: 19, ...base, text: String(texto) })];
}

export function p(texto = '', { bold, italics, color, size, alinear, despues = 100, antes = 0, sangria, base = {} } = {}) {
  return new Paragraph({
    alignment: alinear,
    spacing: { before: antes, after: despues, line: 276 },
    indent: sangria ? { left: sangria } : undefined,
    children: runs(texto, { bold, italics, color, ...(size ? { size } : {}), ...base }),
  });
}

export const h1 = (t) =>
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun({ text: t, font: FUENTE, bold: true, size: 30, color: VERDE })] });
export const h2 = (t) =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text: t, font: FUENTE, bold: true, size: 25, color: VERDE })] });
export const h3 = (t) =>
  new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: t, font: FUENTE, bold: true, size: 21, color: '2F3B45' })] });

export const viñeta = (t, nivel = 0) =>
  new Paragraph({ numbering: { reference: 'vinetas', level: nivel }, spacing: { after: 60, line: 276 }, children: runs(t) });

export const saltoPagina = () => new Paragraph({ children: [new PageBreak()] });

// ---------- Tablas ----------
export function celda(contenido, ancho, { fondo, bold, color, alinear, columnas, vertical, size } = {}) {
  const items = Array.isArray(contenido) ? contenido : [contenido];
  const hijos = items.map((item) =>
    item instanceof Paragraph
      ? item
      : new Paragraph({ alignment: alinear, spacing: { after: 40, line: 264 }, children: runs(item ?? '', { bold, color, ...(size ? { size } : {}) }) })
  );
  return new TableCell({
    width: { size: ancho, type: WidthType.DXA },
    columnSpan: columnas,
    verticalAlign: vertical ?? VerticalAlign.TOP,
    borders: bordes,
    shading: fondo ? { fill: fondo, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 50, left: 110, right: 110 },
    children: hijos.length ? hijos : [new Paragraph({ children: [] })],
  });
}

// filas: arreglo de arreglos; cada elemento puede ser string o {t, fondo, bold, color, alinear}
export function tabla(anchos, filas, { encabezado = true } = {}) {
  const total = anchos.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    rows: filas.map((fila, i) =>
      new TableRow({
        tableHeader: encabezado && i === 0,
        cantSplit: true,
        children: fila.map((c, j) => {
          const o = typeof c === 'object' && c !== null && !Array.isArray(c) && !(c instanceof Paragraph) ? c : { t: c };
          const esEnc = encabezado && i === 0;
          return celda(o.t, anchos[j], {
            fondo: esEnc ? VERDE : o.fondo,
            bold: esEnc ? true : o.bold,
            color: esEnc ? 'FFFFFF' : o.color,
            alinear: o.alinear,
          });
        }),
      })
    ),
  });
}

export const estadoCelda = (estado) => {
  const c = COLOR_ESTADO[estado] ?? { texto: '000000', fondo: 'FFFFFF' };
  return { t: estado, fondo: c.fondo, color: c.texto, bold: true, alinear: AlignmentType.CENTER };
};

// ---------- Imágenes ----------
function dimensiones(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), tipo: 'png' };
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marcador = buf[i + 1];
    const largo = buf.readUInt16BE(i + 2);
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), tipo: 'jpg' };
    }
    i += 2 + largo;
  }
  throw new Error('JPEG sin dimensiones');
}

export function imagen(archivo, { maxAncho = 600, maxAlto = 520 } = {}) {
  const ruta = path.isAbsolute(archivo) ? archivo : path.join(EVID, archivo);
  const buf = fs.readFileSync(ruta);
  const { w, h, tipo } = dimensiones(buf);
  const escala = Math.min(maxAncho / w, maxAlto / h, 1);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 40 },
    keepNext: true,
    children: [new ImageRun({ type: tipo, data: buf, transformation: { width: Math.round(w * escala), height: Math.round(h * escala) } })],
  });
}

// Las tablas de evidencia llegan con tabuladores entre columnas: se alinean con espacios (fuente monoespaciada).
function alinearColumnas(texto) {
  const filas = String(texto).split('\n').map((l) => l.split('\t'));
  if (!filas.some((f) => f.length > 1)) return String(texto);
  const ancho = [];
  filas.forEach((f) => f.forEach((c, i) => { ancho[i] = Math.max(ancho[i] ?? 0, c.length); }));
  return filas.map((f) => f.map((c, i) => (i === f.length - 1 ? c : c.padEnd(ancho[i] + 3))).join('')).join('\n');
}

function bloqueTexto(titulo, texto) {
  const lineas = alinearColumnas(texto).split('\n').slice(0, 60);
  return [
    p(titulo, { bold: true, size: 17, color: GRIS, despues: 40, antes: 80 }),
    new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: [W],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: W, type: WidthType.DXA },
              borders: bordes,
              shading: { fill: 'F4F6F8', type: ShadingType.CLEAR, color: 'auto' },
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: lineas.map((l) => new Paragraph({ spacing: { after: 0, line: 240 }, children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 15 })] })),
            }),
          ],
        }),
      ],
    }),
  ];
}

// ---------- Tarjeta de caso de prueba ----------
const lista = (items, numerada = false) =>
  (Array.isArray(items) ? items : [items]).map((t, i) => p(numerada ? `${i + 1}. ${t}` : t, { despues: 30 }));

function lineasResultado(resultado) {
  return resultado.map((l) => {
    const marca = l.ok === true ? { m: '✓ ', c: '1B5E20' } : l.ok === false ? { m: '✗ ', c: 'B71C1C' } : l.ok === 'obs' ? { m: '⚠ ', c: '8A4B00' } : { m: '• ', c: GRIS };
    return new Paragraph({
      spacing: { after: 30, line: 264 },
      children: [
        new TextRun({ text: marca.m, bold: true, color: marca.c, font: FUENTE, size: 19 }),
        new TextRun({ text: l.texto, font: FUENTE, size: 19, color: l.ok === false ? 'B71C1C' : undefined }),
      ],
    });
  });
}

export function tarjetaCaso(caso, defectosDelCaso = []) {
  const col = COLOR_ESTADO[caso.estado];
  const etiquetaW = 2150;
  const valorW = W - etiquetaW;
  const hus = caso.hus ?? [caso.hu];
  const filaDato = (etiqueta, contenido) =>
    new TableRow({
      cantSplit: false,
      children: [celda(etiqueta, etiquetaW, { fondo: 'EEF2F5', bold: true, color: '2F3B45' }), celda(contenido, valorW)],
    });

  const criterios = [];
  hus.forEach((id) => {
    const info = HU[id];
    if (!info) return;
    const cas = (caso.ca?.[id] ?? (hus.length === 1 ? caso.ca : null)) ?? [];
    const listaCA = Array.isArray(cas) ? cas : [];
    if (!listaCA.length) {
      criterios.push(p([{ text: `${id} · ${info.titulo}`, bold: true }], { despues: 20 }));
      return;
    }
    listaCA.forEach((n) => criterios.push(p([{ text: `${id} · CA-${n}: `, bold: true }, info.criterios[n - 1] ?? ''], { despues: 40 })));
  });

  const filas = [
    new TableRow({
      cantSplit: true,
      children: [
        celda([new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${caso.id}  ·  ${caso.titulo}`, bold: true, font: FUENTE, size: 21, color: 'FFFFFF' })] })], W - 2000, { fondo: VERDE }),
        celda(caso.estado, 2000, { fondo: col.fondo, color: col.texto, bold: true, alinear: AlignmentType.CENTER, vertical: VerticalAlign.CENTER }),
      ],
    }),
  ];
  const resto = [
    filaDato('Historia de usuario', hus.map((id) => p(HU[id] ? `${id} · ${HU[id].titulo}` : 'Transversal: requisito no funcional que aplica a todo el sistema', { despues: 20 }))),
    filaDato('Criterio(s) de aceptación', criterios.length ? criterios : [p(caso.rnf ? `Requisito de calidad: ${caso.rnf}` : 'Requisito transversal (ver objetivo).', { despues: 20 })]),
    filaDato('Tipo / prioridad', `${caso.tipo}${caso.nivel ? ' · ' + caso.nivel : ''}${caso.rnf ? ' · Requisito: ' + caso.rnf : ''} · Prioridad ${caso.prioridad ?? 'Media'}`),
    filaDato('Objetivo', caso.objetivo),
    filaDato('Precondiciones', lista(caso.precondiciones ?? 'Entorno Docker de pruebas en ejecución.')),
    filaDato('Datos de prueba', lista(caso.datos ?? 'No aplica.')),
    filaDato('Pasos ejecutados', lista(caso.pasos, true)),
    filaDato('Resultado esperado', lista(caso.esperado)),
    filaDato('Resultado obtenido', lineasResultado(caso.resultado)),
    new TableRow({
      cantSplit: true,
      children: [
        celda('Estado final', etiquetaW, { fondo: 'EEF2F5', bold: true, color: '2F3B45' }),
        celda(`${caso.estado}  ·  duración ${(caso.duracionMs / 1000).toFixed(1)} s  ·  ${new Date(caso.ejecutadaEn).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' })} (hora de Colombia)`, valorW, { fondo: col.fondo, color: col.texto, bold: true }),
      ],
    }),
  ];
  if (defectosDelCaso.length) {
    resto.push(filaDato('Defecto asociado', defectosDelCaso.map((d) => p(`${d.id} (${d.severidad}): ${d.titulo}`, { despues: 20, base: { color: 'B71C1C', bold: true } }))));
  }
  if (caso.notaQA) resto.push(filaDato('Nota del analista', lista(caso.notaQA)));

  const tablaCaso = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [etiquetaW, valorW], rows: [filas[0], ...resto] });
  // La primera fila tiene dos celdas de anchos distintos: se declara con una tabla propia para evitar desajuste de columnas.
  const encabezado = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W - 2000, 2000], rows: [filas[0]] });
  const cuerpo = new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [etiquetaW, valorW], rows: resto });
  void tablaCaso;

  const salida = [encabezado, cuerpo];
  for (const ev of caso.evidencias ?? []) {
    if (ev.archivo) {
      salida.push(imagen(ev.archivo));
      salida.push(p(`Evidencia: ${ev.leyenda}`, { italics: true, color: GRIS, size: 16, alinear: AlignmentType.CENTER, despues: 120 }));
    } else if (ev.texto) {
      salida.push(...bloqueTexto(`Evidencia: ${ev.titulo}`, ev.texto));
    }
  }
  salida.push(p('', { despues: 200 }));
  return salida;
}

// ---------- Documento ----------
export function documento({ titulo, subtitulo, meta = [], hijos }) {
  const portada = [
    new Paragraph({ spacing: { before: 600, after: 60 }, children: [new TextRun({ text: 'CanchaYa', font: FUENTE, bold: true, size: 56, color: VERDE })] }),
    new Paragraph({ spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 'A3E635', space: 6 } }, children: [new TextRun({ text: 'Sistema de reserva de canchas sintéticas', font: FUENTE, size: 24, color: GRIS })] }),
    new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: titulo, font: FUENTE, bold: true, size: 40, color: '1F2933' })] }),
    new Paragraph({ spacing: { after: 320 }, children: [new TextRun({ text: subtitulo, font: FUENTE, size: 24, color: GRIS })] }),
    tabla([2600, W - 2600], meta.map(([k, v]) => [{ t: k, bold: true, fondo: 'EEF2F5' }, v]), { encabezado: false }),
    p('', { despues: 240 }),
  ];

  return new Document({
    creator: 'Equipo CanchaYa',
    title: `${titulo} - CanchaYa`,
    styles: {
      default: { document: { run: { font: FUENTE, size: 19 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: FUENTE, color: VERDE }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, font: FUENTE, color: VERDE }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 21, bold: true, font: FUENTE, color: '2F3B45' }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'vinetas',
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
            { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, bottom: 1100, left: 1080, right: 1080 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C5CDD3', space: 4 } },
                children: [new TextRun({ text: `CanchaYa · ${titulo}`, font: FUENTE, size: 16, color: GRIS })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: 'Página ', font: FUENTE, size: 16, color: GRIS }), new TextRun({ children: [PageNumber.CURRENT], font: FUENTE, size: 16, color: GRIS }), new TextRun({ text: ' de ', font: FUENTE, size: 16, color: GRIS }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FUENTE, size: 16, color: GRIS })],
              }),
            ],
          }),
        },
        children: [...portada, ...hijos],
      },
    ],
  });
}

export async function guardar(doc, ruta) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, await Packer.toBuffer(doc));
}

export { COLOR_ESTADO, VERDE, GRIS };
