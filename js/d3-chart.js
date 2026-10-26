// Gráfico de burbujas hecho con D3.
// Cada burbuja es un producto en un mes:
//   - eje X: mes
//   - eje Y: ingresos
//   - radio: ventas (escala de raíz cuadrada para que el área sea proporcional)
//   - color: producto
// El precio sale en el tooltip y en el panel de detalle.
// También tiene transiciones, hover, clic para seleccionar y filtro en la leyenda.

const PALETA = ['#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2'];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MARGEN = { superior: 24, derecho: 26, inferior: 58, izquierdo: 84 };
const MARGEN_ESTRECHO = { superior: 20, derecho: 14, inferior: 50, izquierdo: 66 };
const DURACION = 750;

let contenedor = null;
let svg = null;
let capaRejilla = null;
let capaEjeX = null;
let capaEjeY = null;
let capaBurbujas = null;
let etiquetaX = null;
let etiquetaY = null;
let tooltip = null;
let leyendaEl = null;
let detalleEl = null;

let escalaX = null;
let escalaY = null;
let escalaR = null;

let ancho = 0;
let alto = 0;
let datos = [];
let meses = [];
let productos = [];
let seleccion = null;
let observador = null;

const formatoMiles = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

function formatear(valor) {
  return formatoMiles.format(valor);
}

function ordenarMeses(lista) {
  const conocidos = lista
    .filter((mes) => MESES.includes(mes))
    .sort((a, b) => MESES.indexOf(a) - MESES.indexOf(b));
  const otros = lista.filter((mes) => !MESES.includes(mes));
  return [...conocidos, ...otros];
}

function colorDe(producto) {
  const indice = productos.indexOf(producto);
  return PALETA[(indice < 0 ? 0 : indice) % PALETA.length];
}

// Preparo el svg, las capas donde dibujo y el tooltip.
// Uso un ResizeObserver para volver a dibujar si cambia el ancho.
export function iniciarGraficoD3(elemento, opciones = {}) {
  contenedor = elemento;
  leyendaEl = opciones.leyenda || null;
  detalleEl = opciones.detalle || null;

  svg = d3
    .select(contenedor)
    .append('svg')
    .attr('role', 'img')
    .attr('aria-label', 'Gráfico de burbujas: ingresos por mes, tamaño según ventas y color según producto');

  capaRejilla = svg.append('g').attr('class', 'rejilla');
  capaEjeX = svg.append('g').attr('class', 'eje eje--x');
  capaEjeY = svg.append('g').attr('class', 'eje eje--y');
  capaBurbujas = svg.append('g').attr('class', 'burbujas');

  etiquetaX = svg
    .append('text')
    .attr('class', 'titulo-eje')
    .attr('text-anchor', 'middle')
    .text('Mes');

  etiquetaY = svg
    .append('text')
    .attr('class', 'titulo-eje')
    .attr('text-anchor', 'middle')
    .text('Ingresos');

  tooltip = d3
    .select(contenedor)
    .append('div')
    .attr('class', 'tooltip')
    .attr('role', 'status')
    .style('opacity', 0);

  observador = new ResizeObserver(() => {
    if (datos.length > 0) {
      render(false);
    } else {
      ajustarLienzo();
    }
  });
  observador.observe(contenedor);
}

// Calculo el alto a partir del ancho para que el gráfico no quede deformado.
function ajustarLienzo() {
  const disponible = contenedor.clientWidth || 640;
  ancho = disponible;
  alto = Math.max(320, Math.min(440, Math.round(disponible * 0.64)));
  svg
    .attr('viewBox', `0 0 ${ancho} ${alto}`)
    .attr('width', ancho)
    .attr('height', alto);
}

// Para que las burbujas del mismo mes no se tapen, las separo un poco
// dentro de la banda del mes.
function posicionX(dato) {
  const centroBanda = escalaX(dato.mes) + escalaX.bandwidth() / 2;
  const total = productos.length;
  let x = centroBanda;

  if (total > 1) {
    const indice = productos.indexOf(dato.producto);
    const separacion = escalaX.bandwidth() * 0.72;
    const paso = separacion / (total - 1);
    x = centroBanda + (indice - (total - 1) / 2) * paso;
  }

  // Se mantiene la burbuja dentro del área de dibujo.
  const limite = escalaX.range()[1];
  const radio = escalaR ? escalaR(dato.ventas) : 10;
  return Math.min(Math.max(x, radio + 2), Math.max(radio + 2, limite - radio - 2));
}

// Dibujo todo el gráfico. Si `animar` es true, uso transiciones.
function render(animar = true) {
  if (!contenedor || !contenedor.clientWidth) return;

  ajustarLienzo();

  const margen = ancho < 560 ? MARGEN_ESTRECHO : MARGEN;
  const interiorAncho = Math.max(140, ancho - margen.izquierdo - margen.derecho);
  const interiorAlto = Math.max(140, alto - margen.superior - margen.inferior);

  capaRejilla.attr('transform', `translate(${margen.izquierdo},${margen.superior})`);
  capaEjeY.attr('transform', `translate(${margen.izquierdo},${margen.superior})`);
  capaEjeX.attr('transform', `translate(${margen.izquierdo},${margen.superior + interiorAlto})`);
  capaBurbujas.attr('transform', `translate(${margen.izquierdo},${margen.superior})`);

  etiquetaX.attr('x', margen.izquierdo + interiorAncho / 2).attr('y', alto - 10);
  etiquetaY.attr(
    'transform',
    `translate(18,${margen.superior + interiorAlto / 2}) rotate(-90)`
  );

  if (datos.length === 0) {
    capaBurbujas.selectAll('*').remove();
    capaRejilla.selectAll('*').remove();
    capaEjeX.selectAll('*').remove();
    capaEjeY.selectAll('*').remove();
    return;
  }

  escalaX = d3
    .scaleBand()
    .domain(meses)
    .range([0, interiorAncho])
    .paddingInner(0.28)
    .paddingOuter(0.12);

  const maxIngresos = d3.max(datos, (d) => d.ingresos) || 1;
  const maxVentas = d3.max(datos, (d) => d.ventas) || 1;

  escalaY = d3
    .scaleLinear()
    .domain([0, maxIngresos * 1.12])
    .nice()
    .range([interiorAlto, 0]);

  // El radio máximo se limita según la separación real entre burbujas del
  // mismo mes, de modo que en pantallas estrechas no se solapen.
  const separacion = escalaX.bandwidth() * 0.72;
  const paso = separacion / Math.max(1, productos.length - 1);
  const radioMaximo = Math.min(44, Math.max(10, paso * 0.44), interiorAlto * 0.17);

  escalaR = d3.scaleSqrt().domain([0, maxVentas]).range([6, radioMaximo]);

  const transicion = animar
    ? d3.transition().duration(DURACION).ease(d3.easeCubicInOut)
    : d3.transition().duration(0);

  /* --- Rejilla horizontal --- */
  const marcasY = escalaY.ticks(5);
  capaRejilla
    .selectAll('line')
    .data(marcasY, (d) => d)
    .join('line')
    .attr('x1', 0)
    .attr('x2', interiorAncho)
    .transition(transicion)
    .attr('y1', (d) => escalaY(d))
    .attr('y2', (d) => escalaY(d));

  /* --- Ejes --- */
  capaEjeX
    .transition(transicion)
    .call(d3.axisBottom(escalaX).tickSizeOuter(0));

  capaEjeY
    .transition(transicion)
    .call(
      d3
        .axisLeft(escalaY)
        .ticks(5)
        .tickFormat((valor) => formatear(valor))
        .tickSizeOuter(0)
    );

  /* --- Burbujas --- */
  const grupos = capaBurbujas
    .selectAll('g.burbuja')
    .data(datos, (d) => `${d.producto}|${d.mes}`);

  const entrando = grupos
    .enter()
    .append('g')
    .attr('class', 'burbuja')
    .attr('tabindex', 0)
    .attr('transform', (d) => `translate(${posicionX(d)},${escalaY(0)})`);

  entrando
    .append('circle')
    .attr('r', 0)
    .attr('opacity', 0);

  entrando
    .append('text')
    .attr('class', 'valor-burbuja')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('opacity', 0);

  const todos = entrando.merge(grupos);

  todos.attr(
    'aria-label',
    (d) =>
      `${d.producto}, ${d.mes}: ${formatear(d.ventas)} ventas, ` +
      `${formatear(d.ingresos)} de ingresos, precio ${formatear(d.precio)}`
  );

  todos
    .transition(transicion)
    .attr('transform', (d) => `translate(${posicionX(d)},${escalaY(d.ingresos)})`);

  todos
    .select('circle')
    .attr('fill', (d) => colorDe(d.producto))
    .attr('stroke', (d) => (seleccion === d.producto ? '#0f172a' : '#ffffff'))
    .attr('stroke-width', (d) => (seleccion === d.producto ? 3 : 2))
    .transition(transicion)
    .attr('r', (d) => escalaR(d.ventas))
    .attr('opacity', (d) => (seleccion && seleccion !== d.producto ? 0.16 : 0.9));

  todos
    .select('text.valor-burbuja')
    .text((d) => formatear(d.ventas))
    .transition(transicion)
    .attr('opacity', (d) =>
      escalaR(d.ventas) >= (ancho < 560 ? 12 : 17) && (!seleccion || seleccion === d.producto)
        ? 1
        : 0
    );

  grupos.exit().transition(transicion).style('opacity', 0).remove();

  /* --- Eventos interactivos --- */
  todos
    .on('mouseenter', function (evento, d) {
      d3.select(this)
        .select('circle')
        .interrupt()
        .attr('r', escalaR(d.ventas) * 1.07)
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 3);
      mostrarTooltip(evento, d);
    })
    .on('mousemove', (evento) => moverTooltip(evento))
    .on('mouseleave', function (evento, d) {
      d3.select(this)
        .select('circle')
        .attr('r', escalaR(d.ventas))
        .attr('stroke', seleccion === d.producto ? '#0f172a' : '#ffffff')
        .attr('stroke-width', seleccion === d.producto ? 3 : 2);
      ocultarTooltip();
    })
    .on('focus', function (evento, d) {
      mostrarTooltip(evento, d, true);
    })
    .on('blur', () => ocultarTooltip())
    .on('click', (evento, d) => alternarSeleccion(d.producto))
    .on('keydown', (evento, d) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        alternarSeleccion(d.producto);
      }
    });
}

// ------------------- tooltip -------------------

function contenidoTooltip(dato) {
  return `
    <div class="tooltip__titulo">
      <span class="punto" style="background:${colorDe(dato.producto)}"></span>${dato.producto}
    </div>
    <div class="tooltip__fila"><span>Mes</span><strong>${dato.mes}</strong></div>
    <div class="tooltip__fila"><span>Ventas</span><strong>${formatear(dato.ventas)} u.</strong></div>
    <div class="tooltip__fila"><span>Ingresos</span><strong>${formatear(dato.ingresos)}</strong></div>
    <div class="tooltip__fila"><span>Precio</span><strong>${formatear(dato.precio)}</strong></div>
  `;
}

function mostrarTooltip(evento, dato, centrado = false) {
  if (!tooltip) return;
  tooltip.html(contenidoTooltip(dato)).style('opacity', 1);

  if (centrado) {
    // Navegación con teclado: se coloca sobre la burbuja enfocada.
    const caja = evento.currentTarget.getBoundingClientRect();
    const base = contenedor.getBoundingClientRect();
    colocarTooltip(caja.left - base.left + caja.width / 2, caja.top - base.top);
  } else {
    moverTooltip(evento);
  }
}

function moverTooltip(evento) {
  if (!tooltip) return;
  const base = contenedor.getBoundingClientRect();
  colocarTooltip(evento.clientX - base.left, evento.clientY - base.top);
}

function colocarTooltip(x, y) {
  const nodo = tooltip.node();
  const anchoTip = nodo.offsetWidth || 160;
  const altoTip = nodo.offsetHeight || 110;
  const limiteIzquierdo = anchoTip / 2 + 6;
  const limiteDerecho = contenedor.clientWidth - anchoTip / 2 - 6;
  const xFinal = Math.min(Math.max(x, limiteIzquierdo), Math.max(limiteIzquierdo, limiteDerecho));

  // Si no hay sitio por encima del puntero, el tooltip se coloca debajo.
  const cabeArriba = y - altoTip - 22 >= 0;

  tooltip
    .classed('tooltip--abajo', !cabeArriba)
    .style('left', `${xFinal}px`)
    .style('top', `${cabeArriba ? y - 6 : y + 6}px`);
}

function ocultarTooltip() {
  if (tooltip) tooltip.style('opacity', 0);
}

// ------------------- leyenda y detalle -------------------

function construirLeyenda() {
  if (!leyendaEl) return;

  leyendaEl.innerHTML = '';
  productos.forEach((producto) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'leyenda__item';
    boton.dataset.producto = producto;
    boton.innerHTML = `<span class="punto" style="background:${colorDe(producto)}"></span>${producto}`;
    boton.addEventListener('click', () => alternarSeleccion(producto));
    leyendaEl.appendChild(boton);
  });

  marcarLeyenda();
}

function marcarLeyenda() {
  if (!leyendaEl) return;
  leyendaEl.querySelectorAll('.leyenda__item').forEach((boton) => {
    const activo = boton.dataset.producto === seleccion;
    boton.classList.toggle('activo', activo);
    boton.setAttribute('aria-pressed', String(activo));
  });
}

function alternarSeleccion(producto) {
  seleccion = seleccion === producto ? null : producto;
  marcarLeyenda();
  render(true);
  actualizarDetalle();
}

function actualizarDetalle() {
  if (!detalleEl) return;

  if (!seleccion) {
    detalleEl.innerHTML =
      '<p class="detalle__pista">Pasa el cursor por una burbuja para ver el detalle y haz clic para fijar un producto.</p>';
    return;
  }

  const filas = datos.filter((d) => d.producto === seleccion);
  const ventas = filas.reduce((total, d) => total + d.ventas, 0);
  const ingresos = filas.reduce((total, d) => total + d.ingresos, 0);
  const precio = filas.length ? filas[filas.length - 1].precio : 0;

  let variacion = null;
  if (filas.length >= 2) {
    const primera = filas[0].ventas;
    const ultima = filas[filas.length - 1].ventas;
    if (primera > 0) variacion = ((ultima - primera) / primera) * 100;
  }

  const signo = variacion === null ? '' : variacion >= 0 ? '+' : '';
  const variacionTexto =
    variacion === null ? '—' : `${signo}${variacion.toFixed(1).replace('.', ',')} %`;

  detalleEl.innerHTML = `
    <div class="detalle__producto">
      <span class="punto" style="background:${colorDe(seleccion)}"></span>${seleccion}
    </div>
    <div class="detalle__rejilla">
      <div class="detalle__dato"><span>Ventas</span><strong>${formatear(ventas)} u.</strong></div>
      <div class="detalle__dato"><span>Ingresos</span><strong>${formatear(ingresos)}</strong></div>
      <div class="detalle__dato"><span>Precio</span><strong>${formatear(precio)}</strong></div>
      <div class="detalle__dato"><span>Variación</span><strong>${variacionTexto}</strong></div>
    </div>
  `;
}

// ------------------- función que usa app.js -------------------

// Le paso los datos nuevos y los dibujo con animación.
export function dibujarGraficoD3(nuevosDatos) {
  datos = nuevosDatos || [];
  meses = ordenarMeses([...new Set(datos.map((d) => d.mes))]);
  productos = [...new Set(datos.map((d) => d.producto))];

  if (seleccion && !productos.includes(seleccion)) {
    seleccion = null;
  }

  construirLeyenda();
  render(true);
  actualizarDetalle();
}
