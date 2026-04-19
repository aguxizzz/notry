import { useEffect, useRef } from 'react';

const POINT_COUNT = 1500;
const RADIUS = 0.45; // fraction of smallest screen dimension

function buildSphere() {
  const pts = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    // Fibonacci sphere — evenly distributed points
    const phi = Math.acos(1 - 2 * (i + 0.5) / POINT_COUNT);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    pts.push([
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    ]);
  }
  return pts;
}

export default function LoginBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pts = buildSphere();
    let angleY = 0;
    const tiltX = 0.35;
    let raf;

    // Read sphere dot color from CSS token
    const rawColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-sphere-dot')
      .trim() || 'rgba(197, 160, 89, 1)';
    // Strip the alpha from the token so we can recompute it per-dot
    const baseColor = rawColor.replace(/[\d.]+\)$/, '');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const cx = W * 0.93;
      const cy = H * 0.17;
      const r = Math.min(W, H) * RADIUS;

      ctx.clearRect(0, 0, W, H);
      angleY += 0.0020;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(tiltX);
      const sinX = Math.sin(tiltX);

      const projected = pts.map(([x, y, z]) => {
        // Rotate around Y axis
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        // Rotate around X axis (fixed tilt)
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        const depth = (z2 + 1) / 2; // 0 = back, 1 = front
        return {
          sx: cx + x1 * r,
          sy: cy + y2 * r,
          depth,
          z2,
        };
      });

      // Paint back-to-front so front dots are on top
      projected.sort((a, b) => a.z2 - b.z2);

      projected.forEach(({ sx, sy, depth }) => {
        const dotR = 0.8 + depth * 1.8;
        const alpha = 0.08 + depth * 0.52;
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = `${baseColor}${alpha.toFixed(2)})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
