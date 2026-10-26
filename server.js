'use strict';

// Servidor estático muy simple para probar el dashboard en local.
// No usa dependencias: con `node server.js` es suficiente.
// Hace falta porque fetch() no funciona con file:// y las librerías
// de gráficos necesitan que la página venga de un servidor.

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PUERTO = Number(process.env.PORT) || 3000;
const RAIZ = __dirname;

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Cabeceras comunes. Con no-store me aseguro de que el navegador no
// reutilice una copia vieja del JSON cuando pulso "Actualizar".
function cabecerasPara(extension) {
  return {
    'Content-Type': TIPOS_MIME[extension] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff'
  };
}

function responderTexto(res, codigo, mensaje) {
  res.writeHead(codigo, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(mensaje);
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const relativa = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '');
    let ruta = path.resolve(RAIZ, relativa || 'index.html');

    // Protección contra path traversal (../ fuera de la carpeta del proyecto).
    if (ruta !== RAIZ && !ruta.startsWith(RAIZ + path.sep)) {
      responderTexto(res, 403, '403 · Acceso denegado');
      return;
    }

    let info = await fsp.stat(ruta).catch(() => null);
    if (info && info.isDirectory()) {
      ruta = path.join(ruta, 'index.html');
      info = await fsp.stat(ruta).catch(() => null);
    }

    if (!info || !info.isFile()) {
      responderTexto(res, 404, `404 · No encontrado: ${url.pathname}`);
      return;
    }

    res.writeHead(200, cabecerasPara(path.extname(ruta).toLowerCase()));
    fs.createReadStream(ruta).pipe(res);
    console.log(`200  ${req.method}  ${url.pathname}`);
  } catch (error) {
    console.error('Error al servir la petición:', error);
    responderTexto(res, 500, '500 · Error interno del servidor');
  }
});

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nEl puerto ${PUERTO} ya está ocupado.`);
    console.error(`Prueba con otro puerto:  PORT=3001 node server.js\n`);
  } else {
    console.error('No se pudo iniciar el servidor:', error);
  }
  process.exit(1);
});

servidor.listen(PUERTO, () => {
  console.log('\n  Dashboard de ventas · servidor local');
  console.log(`  http://localhost:${PUERTO}\n`);
  console.log('  Pulsa Ctrl+C para detenerlo.\n');
});
