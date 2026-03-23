# Visor equirrectangular tipo Street View

Visor 360° que muestra una imagen equirrectangular y anotaciones (recuadros, polígonos, texto) definidas por coordenadas que entrega el backend.

## Cómo ejecutar

```bash
npm install
npm run dev
```

Se abrirá el navegador en `http://localhost:5173`. Si no hay backend, se usan los datos de `public/data/viewer.json`.

**Cargar datos desde una URL:** Puedes indicar un JSON remoto con el mismo formato con el parámetro `data` en la URL, por ejemplo: `http://localhost:5173?data=https://tu-servidor.com/api/viewer.json`. Esa URL debe devolver un JSON con `panoramaUrl`, opcionalmente `imageWidth`/`imageHeight`, y `annotations`. El servidor que sirve el JSON debe permitir CORS si está en otro origen.

**Imagen del panorama:** Coloca tu imagen equirrectangular dentro de la carpeta `public/`, por ejemplo `public/panorama.jpg`. En `public/data/viewer.json` la URL debe ser **relativa**: `"/panorama.jpg"`. No hace falta un tamaño en píxeles concreto; lo recomendable es que la imagen tenga **proporción 2:1** (el doble de ancho que de alto) para un 360° completo. Usar una imagen local evita errores de CORS ("The panorama cannot be loaded").

## Contrato del backend

Ver [docs/API.md](docs/API.md): el endpoint debe devolver `panoramaUrl`, opcionalmente `imageWidth`/`imageHeight`, y un array `annotations` con tipos `rectangle`, `polygon`, `polyline`, `circle`, `text`, `point` y coordenadas en píxeles o esféricas.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — build para producción
- `npm run preview` — previsualizar el build
