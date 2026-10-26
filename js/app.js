// Este archivo lleva el control del dashboard:
// carga el JSON, lo valida, redibuja los dos gráficos y actualiza los KPIs.
// El botón "Actualizar" va alternando entre dos versiones del JSON para
// simular que llegan datos nuevos sin recargar la página.

import {
  cargarGoogleCharts,
  iniciarGraficoGoogle,
  dibujarGraficoGoogle
} from './google-chart.js';

import { iniciarGraficoD3, dibujarGraficoD3 } from './d3-chart.js';

const FUENTES = [
  { archivo: './data/ventas.json', etiqueta: 'Dataset v1 · original' },
  { archivo: './data/ventas-actualizado.json', etiqueta: 'Dataset v2 · actualizado' }
];

const INTERVALO_AUTO_MS = 10000;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const formatoEntero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const formatoDecimal = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const estado = {
  indice: 0,
  datos: [],
  cargando: false,
  temporizador: null,
  googleListo: false
};

const $ = (selector) => document.querySelector(selector);

// ------------------- utilidades de datos -------------------

function ordenarMeses(lista) {
  const conocidos = lista
    .filter((mes) => MESES.includes(mes))
    .sort((a, b) => MESES.indexOf(a) - MESES.indexOf(b));
  const otros = lista.filter((mes) => !MESES.includes(mes));
  return [...conocidos, ...otros];
}

// Convierto cada registro a número y compruebo que no falte nada.
function normalizar(crudo) {
  return crudo.map((fila, indice) => {
    const dato = {
      producto: String(fila?.producto ?? '').trim(),
      mes: String(fila?.mes ?? '').trim(),
      ventas: Number(fila?.ventas),
      ingresos: Number(fila?.ingresos),
      precio: Number(fila?.precio)
    };

    const numerosValidos = [dato.ventas, dato.ingresos, dato.precio].every(Number.isFinite);
    if (!dato.producto || !dato.mes || !numerosValidos) {
      throw new Error(
        `El registro ${indice + 1} del JSON no es válido: se esperaban producto, mes, ventas, ingresos y precio.`
      );
    }

    return dato;
  });
}

// Leo el JSON del servidor. Le añado ?t= con la hora para que el navegador
// no me devuelva la versión que tiene en caché.
async function cargarDatos() {
  const fuente = FUENTES[estado.indice % FUENTES.length];
  const url = `${fuente.archivo}?t=${Date.now()}`;

  const respuesta = await fetch(url, { cache: 'no-store' });
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${fuente.archivo} (HTTP ${respuesta.status}).`);
  }

  const crudo = await respuesta.json();
  if (!Array.isArray(crudo) || crudo.length === 0) {
    throw new Error(`El archivo ${fuente.archivo} no contiene un array de datos válido.`);
  }

  return { fuente, datos: normalizar(crudo) };
}

// ------------------- indicadores -------------------

function calcularResumen(datos) {
  const meses = ordenarMeses([...new Set(datos.map((d) => d.mes))]);
  const totalVentas = datos.reduce((suma, d) => suma + d.ventas, 0);
  const totalIngresos = datos.reduce((suma, d) => suma + d.ingresos, 0);

  const ventasPorMes = new Map();
  datos.forEach((d) => {
    ventasPorMes.set(d.mes, (ventasPorMes.get(d.mes) || 0) + d.ventas);
  });

  const primerMes = meses[0];
  const ultimoMes = meses[meses.length - 1];
  const ventasPrimerMes = ventasPorMes.get(primerMes) || 0;
  const ventasUltimoMes = ventasPorMes.get(ultimoMes) || 0;

  const variacion =
    ventasPrimerMes > 0 && meses.length > 1
      ? ((ventasUltimoMes - ventasPrimerMes) / ventasPrimerMes) * 100
      : null;

  const ingresosPorProducto = new Map();
  datos.forEach((d) => {
    ingresosPorProducto.set(d.producto, (ingresosPorProducto.get(d.producto) || 0) + d.ingresos);
  });

  let lider = null;
  let ingresosLider = -Infinity;
  ingresosPorProducto.forEach((valor, producto) => {
    if (valor > ingresosLider) {
      ingresosLider = valor;
      lider = producto;
    }
  });

  return {
    meses,
    totalVentas,
    totalIngresos,
    variacion,
    primerMes,
    ultimoMes,
    lider,
    ingresosLider: ingresosLider === -Infinity ? 0 : ingresosLider
  };
}

function pintarResumen(datos) {
  const resumen = calcularResumen(datos);

  const kpiVentas = $('#kpi-ventas');
  const kpiIngresos = $('#kpi-ingresos');
  const kpiVariacion = $('#kpi-variacion');
  const kpiLider = $('#kpi-lider');

  if (kpiVentas) kpiVentas.textContent = formatoEntero.format(resumen.totalVentas);
  if (kpiIngresos) kpiIngresos.textContent = formatoEntero.format(resumen.totalIngresos);

  const notaVentas = $('#kpi-ventas-nota');
  if (notaVentas) {
    notaVentas.textContent = `unidades en ${resumen.meses.length} meses`;
  }

  const notaIngresos = $('#kpi-ingresos-nota');
  if (notaIngresos) {
    notaIngresos.textContent = `suma de ${resumen.meses.join(' y ').toLowerCase()}`;
  }

  if (kpiVariacion) {
    if (resumen.variacion === null) {
      kpiVariacion.textContent = '—';
      kpiVariacion.classList.remove('positivo', 'negativo');
    } else {
      const signo = resumen.variacion >= 0 ? '+' : '';
      kpiVariacion.textContent = `${signo}${formatoDecimal.format(resumen.variacion)} %`;
      kpiVariacion.classList.toggle('positivo', resumen.variacion >= 0);
      kpiVariacion.classList.toggle('negativo', resumen.variacion < 0);
    }
  }

  const notaVariacion = $('#kpi-variacion-nota');
  if (notaVariacion) {
    notaVariacion.textContent = `${resumen.ultimoMes} frente a ${resumen.primerMes}`;
  }

  if (kpiLider) kpiLider.textContent = resumen.lider || '—';

  const notaLider = $('#kpi-lider-nota');
  if (notaLider) {
    notaLider.textContent = `${formatoEntero.format(resumen.ingresosLider)} de ingresos acumulados`;
  }
}

// ------------------- mensajes y botón -------------------

function mostrarError(mensaje) {
  const banner = $('#banner-error');
  if (!banner) return;
  banner.textContent = `⚠ ${mensaje} Se mantiene la última visualización válida.`;
  banner.hidden = false;
}

function ocultarError() {
  const banner = $('#banner-error');
  if (banner) banner.hidden = true;
}

function ponerBotonCargando(cargando) {
  const boton = $('#btn-actualizar');
  if (!boton) return;
  boton.disabled = cargando;
  boton.classList.toggle('cargando', cargando);
  boton.setAttribute('aria-busy', String(cargando));
  const texto = boton.querySelector('span');
  if (texto) texto.textContent = cargando ? 'Cargando…' : 'Actualizar';
}

// ------------------- ciclo de actualización -------------------

function dibujarTodo(datos) {
  pintarResumen(datos);
  dibujarGraficoD3(datos);
  if (estado.googleListo) {
    dibujarGraficoGoogle(datos);
  }
}

async function actualizar() {
  if (estado.cargando) return;

  estado.cargando = true;
  ponerBotonCargando(true);
  ocultarError();

  try {
    const { fuente, datos } = await cargarDatos();
    estado.datos = datos;
    dibujarTodo(datos);

    const selloDataset = $('#sello-dataset');
    if (selloDataset) selloDataset.textContent = fuente.etiqueta;

    const selloTiempo = $('#sello-tiempo');
    if (selloTiempo) {
      const hora = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      selloTiempo.textContent = `Última actualización: ${hora}`;
    }

    estado.indice += 1;
  } catch (error) {
    console.error(error);
    mostrarError(error.message || 'No se pudieron cargar los datos.');
  } finally {
    estado.cargando = false;
    ponerBotonCargando(false);
  }
}

function configurarAutoActualizacion() {
  const casilla = $('#chk-auto');
  if (!casilla) return;

  casilla.addEventListener('change', () => {
    if (casilla.checked) {
      estado.temporizador = window.setInterval(actualizar, INTERVALO_AUTO_MS);
    } else {
      window.clearInterval(estado.temporizador);
      estado.temporizador = null;
    }
  });
}

// ------------------- arranque -------------------

async function iniciar() {
  const boton = $('#btn-actualizar');
  if (boton) boton.addEventListener('click', actualizar);
  configurarAutoActualizacion();

  const lienzoD3 = $('#d3-chart');
  if (lienzoD3) {
    iniciarGraficoD3(lienzoD3, {
      leyenda: $('#d3-legend'),
      detalle: $('#d3-detalle')
    });
  }

  try {
    await cargarGoogleCharts();
    const lienzoGoogle = $('#google-chart');
    if (lienzoGoogle) {
      iniciarGraficoGoogle(lienzoGoogle, $('#google-legend'));
      estado.googleListo = true;
    }
  } catch (error) {
    console.error(error);
    mostrarError(
      'Google Charts no está disponible, así que el gráfico de columnas no puede dibujarse.'
    );
    const estadoGoogle = $('#google-estado');
    if (estadoGoogle) estadoGoogle.textContent = 'Gráfico no disponible sin conexión al CDN.';
  }

  await actualizar();
}

iniciar();
