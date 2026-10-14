import fs from 'fs';
import path from 'path';

// Capturar argumentos de la línea de comandos
// process.argv[0] = node, process.argv[1] = script.mjs
const inputPath = process.argv[2];
const outputPath = process.argv[3];
const prefix = process.argv[4];

if (!inputPath || !outputPath || !prefix) {
  console.error('Uso: node prefijar-lcov.mjs <ruta-origen> <ruta-destino> <prefijo>');
  process.exit(1);
}

try {
  if (!fs.existsSync(inputPath)) {
    console.error(`El archivo origen no existe en: ${inputPath}`);
    process.exit(1);
  }

  const lcovContent = fs.readFileSync(inputPath, 'utf8');
  
  // Reemplazar las rutas en las líneas "SF:" (Source File)
  const updatedLcov = lcovContent.replace(/^SF:(.+)$/gm, (match, p1) => {
    // Si la ruta ya tiene el prefijo, no lo duplica
    if (p1.startsWith(prefix)) return match;
    return `SF:${prefix}${p1}`;
  });

  // Asegurar que el directorio destino exista antes de escribir
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, updatedLcov, 'utf8');
  console.log(`LCOV procesado con éxito. Guardado en: ${outputPath} (Prefijo: ${prefix})`);
} catch (error) {
  console.error('Error al procesar el archivo lcov:', error);
  process.exit(1);
}