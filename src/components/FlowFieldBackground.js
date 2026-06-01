import React, { useRef, useEffect } from "react";

// Subtle light-theme flow-field background.
// White canvas, very faint dark nodes + connection lines + slow sine pulses.
// Respects prefers-reduced-motion. DPR capped at 2. ~20fps cap for performance.

const NODE_COUNT  = 38;
const LINK_DIST   = 130;
const MAX_SPEED   = 0.18;

export default function FlowFieldBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr, w, h;
    let nodes = [];
    let t = 0;
    let animId;
    let lastDraw = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w   = window.innerWidth;
      h   = window.innerHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
    }

    function initNodes() {
      nodes = [];
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x:  Math.random() * w,
          y:  Math.random() * h,
          vx: (Math.random() - 0.5) * MAX_SPEED * 2,
          vy: (Math.random() - 0.5) * MAX_SPEED * 2,
          r:  Math.random() * 1.4 + 0.7,
        });
      }
    }

    function clampSpeed(n) {
      const s = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (s > MAX_SPEED) { n.vx = (n.vx / s) * MAX_SPEED; n.vy = (n.vy / s) * MAX_SPEED; }
    }

    function drawFrame() {
      ctx.clearRect(0, 0, w, h);

      // Move nodes
      for (const n of nodes) {
        n.x += n.vx * 3;
        n.y += n.vy * 3;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        clampSpeed(n);
      }

      // Connection lines — very faint dark on white
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx   = nodes[i].x - nodes[j].x;
          const dy   = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.08;
            ctx.strokeStyle = `rgba(10,10,10,${alpha.toFixed(3)})`;
            ctx.lineWidth   = 0.6;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Nodes
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10,10,10,0.30)";
        ctx.fill();
      }

      // Traveling horizontal sine pulses (very subtle)
      for (let k = 0; k < 3; k++) {
        const baseY = h * (0.25 + k * 0.25);
        const phase = t * 0.010 + k * 2.1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const env = Math.exp(
            -Math.pow((x - ((t * 1.4 + k * 280) % (w + 240)) + 120) / 100, 2)
          );
          const y = baseY + Math.sin(x * 0.025 + phase) * 12 * env;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(10,10,10,0.06)";
        ctx.lineWidth   = 1.2;
        ctx.stroke();
      }

      t += 1;
    }

    function loop(timestamp) {
      animId = requestAnimationFrame(loop);
      if (timestamp - lastDraw < 50) return; // ~20fps
      lastDraw = timestamp;
      drawFrame();
    }

    const handleResize = () => { resize(); };
    window.addEventListener("resize", handleResize, { passive: true });

    resize();

    if (prefersReduced) {
      drawFrame(); // single static frame
    } else {
      animId = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      "fixed",
        inset:         0,
        width:         "100%",
        height:        "100%",
        zIndex:        0,
        pointerEvents: "none",
        background:    "#ffffff",
      }}
    />
  );
}
