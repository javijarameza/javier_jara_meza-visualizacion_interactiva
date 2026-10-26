# Panel de ventas por producto

Actividad individual de la asignatura Visualizaciones interactivas.

El proyecto lee un archivo JSON con las ventas de enero y febrero de tres productos
(Smartphone A, Smartphone B y Tablet X) y lo muestra en un dashboard con dos gráficos:
uno de columnas hecho con Google Charts y otro de burbujas hecho con D3.

## Cómo verlo

Online: <https://javijarameza.github.io/javier_jara_meza-visualizacion_interactiva/>

En local:

```
node server.js
```

y abrir <http://localhost:3000>. No hay dependencias, así que no hace falta `npm install`.
El servidor solo sirve los archivos, porque `fetch()` no puede leer un JSON con `file://`.

## Archivos

- `index.html`: estructura del panel.
- `css/styles.css`: estilos y adaptación a móvil.
- `js/app.js`: carga el JSON, actualiza los KPIs y coordina los dos gráficos.
- `js/google-chart.js`: gráfico de columnas con Google Charts.
- `js/d3-chart.js`: gráfico de burbujas con D3.
- `data/ventas.json`: datos originales del enunciado.
- `data/ventas-actualizado.json`: segunda versión de los datos, que se carga al pulsar
  "Actualizar" para simular una actualización.
- `vendor/d3.v7.min.js`: la librería D3 descargada, para no depender del CDN.
- `INFORME.md`: memoria de la actividad.
- `informe/img/`: capturas usadas en la memoria.

## Actualización de los datos

El botón "Actualizar" vuelve a pedir el JSON al servidor alternando entre las dos
versiones y redibuja los dos gráficos sin recargar la página. También hay una casilla
para actualizar automáticamente cada 10 segundos.
