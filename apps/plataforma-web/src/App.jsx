import React from 'react';
import './App.css';

function App() {
  return (
    <div className="layout">
      {/* -- START SIDEBAR EXAMPLE -- */}
      <aside className="sidebar">
        <h2>Plataforma 360°</h2>
        <ul>
          <li>🏠 Inicio</li>
          <li>📸 Mis Recorridos</li>
          <li>⚙️ Configuración</li>
        </ul>
      </aside>

      {/* -- START MAIN CONTENT -- */}
      <main className="main-content">
        <header className="topbar">
          <h1>Dashboard Inmobiliario</h1>
          <button className="modern-btn">Perfil User</button>
        </header>

        {/* CONTENEDOR DONDE SE MONTARÁ EL VISOR */}
        <section className="visor-container">
          <p>Aquí embeberemos o importaremos `packages/visor-core`</p>
        </section>
      </main>
    </div>
  );
}

export default App;
