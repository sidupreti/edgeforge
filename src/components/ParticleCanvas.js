import React, { useRef, useEffect } from "react";

const PARTICLE_COUNT = 60;
const CONNECTION_DIST = 120;
const MAX_SPEED = 0.3;
const ACCENT_RGB = "29,158,117";

export default function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let animId;
    let particles = [];

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function initParticles() {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x:  Math.random() * canvas.width,
        y:  Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * MAX_SPEED * 2,
        vy: (Math.random() - 0.5) * MAX_SPEED * 2,
        r:  Math.random() * 1.5 + 0.5,
      }));
    }

    function clampSpeed(p) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > MAX_SPEED) {
        p.vx = (p.vx / speed) * MAX_SPEED;
        p.vy = (p.vy / speed) * MAX_SPEED;
      }
    }

    // Cap at ~20fps — this is a decorative background, not interactive.
    // 60fps + O(n²) connections + backdrop-filter on every panel = GPU overload.
    let lastDraw = 0;

    function draw(timestamp) {
      animId = requestAnimationFrame(draw);

      // Skip frame if less than 50ms since last draw (~20fps cap)
      if (timestamp - lastDraw < 50) return;
      lastDraw = timestamp;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update positions (advance at reduced rate to keep visual speed consistent)
      for (const p of particles) {
        p.x += p.vx * 3; // compensate for ~3x fewer frames
        p.y += p.vy * 3;
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        clampSpeed(p);
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECTION_DIST) {
            const alpha = (1 - d / CONNECTION_DIST) * 0.08;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${ACCENT_RGB},${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.7;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw dots
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT_RGB},0.15)`;
        ctx.fill();
      }
    }

    resize();
    initParticles();
    animId = requestAnimationFrame(draw);

    function handleResize() { resize(); initParticles(); }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        background: "#080d1a",
      }}
    />
  );
}
