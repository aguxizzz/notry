import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// ?showcase=1 — grabación para video 16:9: el visor es vertical (mobile),
// así que grabarlo tal cual en una ventana landscape solo aprovecha el
// ancho de la columna vertical y desperdicia el resto del frame. Rotando
// el contenido 90° se lo ve "acostado" ocupando toda la ventana landscape
// a resolución nativa; en edición (After Effects) se rota -90° y queda
// parado de nuevo, ahora con mucha más resolución que si se grababa recto.
const isShowcaseMode = new URLSearchParams(window.location.search).get('showcase') === '1';

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

createRoot(document.getElementById('root')).render(
  isShowcaseMode ? <div className="showcase-rotate">{app}</div> : app
);
