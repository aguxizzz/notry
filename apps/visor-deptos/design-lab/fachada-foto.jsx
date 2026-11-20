// Lab: Citrino II with a photo facade instead of the drawn mock-up. Mounts the
// real Viewer with a local snapshot of the building (no backend needed) plus the
// render cut into one band per floor and a blurred copy as the surroundings.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BuildingContext, fromApi } from '../src/building.js';
import { Viewer } from '../src/App.jsx';
import '../src/index.css';
// Snapshot of /public/buildings/<citrino> with `facade` and each floor's
// `facade_height` measured on the 1600x900 render (sum = ground - top of roof).
import snapshot from './fachada-foto/citrino.json';
import photo from './fachada-foto/citrino.jpg';
import backdrop from './fachada-foto/citrino-fondo.jpg';

const building = fromApi({
  ...snapshot,
  facade: { ...snapshot.facade, image: photo, backdrop },
});
document.title = `${building.name} · fachada con foto`;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BuildingContext.Provider value={building}>
      <Viewer />
    </BuildingContext.Provider>
  </StrictMode>
);
