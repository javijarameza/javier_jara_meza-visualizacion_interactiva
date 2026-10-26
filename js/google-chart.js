// Gráfico de columnas con Google Charts.
// Eje X = meses, eje Y = ventas y un color por producto.
// Aquí solo transformo los datos y dibujo; la recarga la lleva app.js.

const PALETA = ['#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2'];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

let grafico = null;
let contenedor = null;
let leyendaEl = null;
let productosLeyenda = '';
let tabla = null;
let listo = false;
let temporizadorResize = null;

// Devuelve los meses en orden de calendario; los que no reconozco van al final.
function ordenarMeses(lista) {
  const conocidos = lista
    .filter((mes) => MESES.includes(mes))
    .sort((a, b) => MESES.indexOf(a) - MESES.indexOf(b));
  const otros = lista.filter((mes) => !MESES.includes(mes));
  return [...conocidos, ...otros];
}

// El orden en que aparecen los productos en el JSON decide el color de cada serie.
function productosEnOrden(datos) {
  return [...new Set(datos.map((d) => d.producto))];
}

// Espero a que Google Charts esté listo. Devuelve error si el loader no
// está o si tarda demasiado, para poder reintentar.
function esperarLibreria() {
  return new Promise((resolve, reject) => {
    const g = window.google;
    if (!g || !g.charts) {
      reject(new Error('El loader de Google Charts no está disponible.'));
      return;
    }

    const limite = setTimeout(() => {
      reject(new Error('Google Charts tardó demasiado en responder.'));
    }, 15000);

    g.charts.load('current', { packages: ['corechart'], language: 'es' });
    g.charts.setOnLoadCallback(() => {
      clearTimeout(limite);
      resolve();
    });
  });
}

// Vuelvo a insertar el script del loader por si el primer intento falló.
function insertarLoader() {
  return new Promise((resolve) => {
    if (window.google && window.google.charts) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/charts/loader.js';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

// Cargo el paquete corechart. Si el CDN falla, lo intento una segunda vez.
export async function cargarGoogleCharts() {
  for (let intento = 0; intento < 2; intento++) {
    if (!window.google || !window.google.charts) {
      await insertarLoader();
    }

    try {
      await esperarLibreria();
      listo = true;
      return;
    } catch (error) {
      if (intento === 1) {
        throw new Error('No se pudo cargar Google Charts desde el CDN.');
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

// Creo el gráfico y lo vuelvo a dibujar cuando cambia el tamaño de la ventana.
// Google Charts necesita medidas en píxeles, así que las recalculo en cada resize.
export function iniciarGraficoGoogle(elemento, leyenda) {
  contenedor = elemento;
  leyendaEl = leyenda || null;
  grafico = new window.google.visualization.ColumnChart(contenedor);

  window.addEventListener('resize', () => {
    clearTimeout(temporizadorResize);
    temporizadorResize = setTimeout(() => {
      if (tabla && contenedor.clientWidth > 0) {
        grafico.draw(tabla, opciones());
      }
    }, 180);
  });
}

// Opciones del gráfico. Ajusto las medidas según el ancho del contenedor.
function opciones() {
  const estrecho = (contenedor.clientWidth || 600) < 520;
  const ancho = Math.max(280, Math.round(contenedor.clientWidth || 600));
  const alto = estrecho ? 320 : 360;
  const margenIzquierdo = estrecho ? 54 : 66;

  return {
    width: ancho,
    height: alto,
    colors: PALETA,
    backgroundColor: { fill: 'transparent' },
    // Dejo sitio abajo para las marcas del eje y su título.
    chartArea: {
      left: margenIzquierdo,
      right: 20,
      top: 24,
      bottom: estrecho ? 58 : 64
    },
    bar: { groupWidth: '62%' },
    // La leyenda la pinto en HTML (ver pintarLeyenda), así no se corta
    // en pantallas estrechas como pasa con la de Google.
    legend: { position: 'none' },
    hAxis: {
      title: 'Mes',
      titleTextStyle: { color: '#94a3b8', italic: false, fontSize: 11, bold: true },
      textStyle: { color: '#64748b', fontSize: 12, fontName: 'Segoe UI' }
    },
    vAxis: {
      title: 'Ventas (unidades)',
      titleTextStyle: { color: '#94a3b8', italic: false, fontSize: 11, bold: true },
      textStyle: { color: '#64748b', fontSize: 11, fontName: 'Segoe UI' },
      minValue: 0,
      gridlines: { color: '#eef2f7', count: 5 },
      baselineColor: '#cbd5e1'
    },
    animation: {
      startup: true,
      duration: 800,
      easing: 'out'
    },
    focusTarget: 'datum',
    tooltip: {
      textStyle: { fontName: 'Segoe UI', fontSize: 12 },
      showColorCode: true
    },
    fontName: 'Segoe UI'
  };
}

// Paso el JSON a una DataTable: una fila por mes y una columna por producto.
// Si falta un dato, pongo 0 para que el eje no se rompa.
function construirTabla(datos) {
  const meses = ordenarMeses([...new Set(datos.map((d) => d.mes))]);
  const productos = productosEnOrden(datos);

  const nuevaTabla = new window.google.visualization.DataTable();
  nuevaTabla.addColumn('string', 'Mes');
  productos.forEach((producto) => nuevaTabla.addColumn('number', producto));

  const indice = new Map();
  datos.forEach((d) => indice.set(`${d.mes}|${d.producto}`, d));

  const filas = meses.map((mes) => [
    mes,
    ...productos.map((producto) => {
      const registro = indice.get(`${mes}|${producto}`);
      return registro ? registro.ventas : 0;
    })
  ]);

  nuevaTabla.addRows(filas);
  return { tabla: nuevaTabla, meses, productos };
}

// Pinto la leyenda en HTML para que los nombres no se corten en móvil.
function pintarLeyenda(productos) {
  if (!leyendaEl) return;

  const clave = productos.join('|');
  if (clave === productosLeyenda) return;
  productosLeyenda = clave;

  leyendaEl.innerHTML = productos
    .map(
      (producto, i) =>
        `<span class="leyenda__item leyenda__item--estatica">` +
        `<span class="punto" style="background:${PALETA[i % PALETA.length]}"></span>` +
        `${producto}</span>`
    )
    .join('');
}

// Dibujo (o redibujo) las columnas. Al pasarle una DataTable nueva,
// Google Charts hace la animación de transición por su cuenta.
export function dibujarGraficoGoogle(datos) {
  if (!listo || !grafico || !contenedor) return;
  if (!datos || datos.length === 0) return;

  const { tabla: nuevaTabla, meses, productos } = construirTabla(datos);
  tabla = nuevaTabla;
  pintarLeyenda(productos);
  grafico.draw(tabla, opciones());

  const estado = document.getElementById('google-estado');
  if (estado) {
    estado.textContent =
      `Columnas agrupadas · ${meses.length} meses · ` +
      `${datos.length} observaciones · animación de 800 ms al actualizar.`;
  }
}
