# Contrato del backend – Visor equirrectangular

El frontend espera un endpoint que devuelva la URL del panorama y la lista de anotaciones con coordenadas.

## Endpoint sugerido

- **GET** `/api/viewer/current` (o equivalente por panorama, ej. `GET /api/panoramas/:id/view`)

Respuesta: JSON con la estructura siguiente.

## Estructura del payload

| Campo          | Tipo   | Descripción |
|----------------|--------|-------------|
| `panoramaUrl`  | string | URL absoluta o relativa de la imagen equirrectangular (ratio 2:1 recomendado, 360°×180°). |
| `imageWidth`   | number | Ancho en píxeles de la imagen (referencia para coordenadas en píxeles). |
| `imageHeight`  | number | Alto en píxeles de la imagen. |
| `annotations`  | array  | Lista de anotaciones (ver abajo). |

## Anotaciones

Cada elemento de `annotations` tiene:

| Campo     | Tipo   | Obligatorio | Descripción |
|-----------|--------|-------------|-------------|
| `id`      | string | Sí          | Identificador único. |
| `type`    | string | Sí          | `rectangle` \| `polygon` \| `polyline` \| `circle` \| `text` \| `point`. |
| `position`| object | Según tipo  | `{ textureX, textureY }` para puntos/rect/circle/text. |
| `size`    | object | Para rect/text | `{ width, height }`. |
| `polygonPixels` | array | Para polygon | `[[x,y], ...]` vértices en píxeles de la imagen. |
| `polylinePixels`| array | Para polyline | `[[x,y], ...]` puntos en píxeles. |
| `html`    | string | Para text   | Contenido HTML del texto (ej. `"<span>Lote 1</span>"`). |
| `tooltip` | string | No          | Texto del tooltip al pasar el ratón. |
| `style` / `svgStyle` | object | No | Estilos (stroke, fill, strokeWidth, etc.). |

**Convención de coordenadas en píxeles:** origen (0,0) = esquina superior izquierda de la imagen; eje X = ancho (360°), eje Y = alto (180°). Las coordenadas deben referirse a `imageWidth` × `imageHeight`.

## Ejemplo de respuesta

```json
{
  "panoramaUrl": "/api/panoramas/abc123/image.jpg",
  "imageWidth": 4096,
  "imageHeight": 2048,
  "annotations": [
    {
      "id": "zone-1",
      "type": "rectangle",
      "position": { "textureX": 100, "textureY": 200 },
      "size": { "width": 80, "height": 60 },
      "style": { "stroke": "#f00", "strokeWidth": 2 },
      "tooltip": "Zona A"
    },
    {
      "id": "zone-2",
      "type": "polygon",
      "polygonPixels": [[200, 300], [400, 300], [400, 500], [200, 500]],
      "svgStyle": { "fill": "rgba(0,0,255,0.2)", "stroke": "#00f" },
      "tooltip": "Zona B"
    },
    {
      "id": "label-1",
      "type": "text",
      "position": { "textureX": 500, "textureY": 400 },
      "html": "<span>Lote 1</span>",
      "size": { "width": 120, "height": 30 }
    }
  ]
}
```

## Alternativa: coordenadas esféricas

Si el backend envía **yaw/pitch** (grados o radianes) en lugar de píxeles:

- Para puntos: `position: { yaw, pitch }`.
- Para polígonos/líneas: `polygon: [[yaw, pitch], ...]` o `polyline: [[yaw, pitch], ...]`.

No mezclar píxeles y esféricas en el mismo payload; el frontend asume un solo sistema por respuesta.
