// Entry of preview.html: mounts the real visor-deptos app, untouched. It reads ?edificio= and
// the API base on its own; with `npm run dev:local` it gets this app's VITE_API_BASE, so the
// preview hits the same back the editor is saving to.
import '../../visor-deptos/src/main.jsx';
