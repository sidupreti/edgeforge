import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

/* ─── Inline styles ─────────────────────────────────────────────────────────
   We scope everything with a wrapper class (.sf-landing) to avoid collisions
   with the app's global Tailwind/index.css overrides.                        */
const CSS = `
  .sf-landing *, .sf-landing *::before, .sf-landing *::after {
    box-sizing: border-box; margin: 0; padding: 0;
  }

  :root {
    --sf-white: #ffffff;
    --sf-off-white: #f8f7f3;
    --sf-paper: #fbfaf6;
    --sf-black: #0a0a0a;
    --sf-near-black: #141414;
    --sf-gray-100: #ebeae5;
    --sf-gray-200: #d8d7d0;
    --sf-gray-300: #b0afa8;
    --sf-gray-400: #8a8982;
    --sf-gray-500: #6b6a63;
    --sf-font-display: 'Syne', sans-serif;
    --sf-font-body: 'DM Sans', sans-serif;
    --sf-font-mono: 'DM Mono', monospace;
  }

  .sf-landing {
    font-family: var(--sf-font-body);
    background: var(--sf-white);
    color: var(--sf-black);
    line-height: 1.6;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  .sf-landing ::selection { background: var(--sf-black); color: var(--sf-white); }

  /* ── Reveal ── */
  .sf-landing .reveal {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.9s cubic-bezier(0.16,1,0.3,1), transform 0.9s cubic-bezier(0.16,1,0.3,1);
  }
  .sf-landing .reveal.in { opacity: 1; transform: translateY(0); }

  /* ── NAV ── */
  .sf-landing .sf-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 40px;
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
    border-bottom: 1px solid transparent;
    transition: border-color 0.3s, padding 0.3s, background 0.3s;
  }
  .sf-landing .sf-nav.scrolled {
    border-bottom-color: var(--sf-gray-100);
    padding: 14px 40px;
  }

  .sf-landing .logo-wrap {
    display: flex; align-items: center; gap: 11px; text-decoration: none;
  }
  .sf-landing .logo-text {
    font-family: var(--sf-font-display); font-weight: 700; font-size: 19px;
    color: var(--sf-black); letter-spacing: -0.03em;
  }

  .sf-landing .nav-links { display: flex; align-items: center; gap: 36px; list-style: none; }
  .sf-landing .nav-links a {
    font-size: 14px; font-weight: 400; color: var(--sf-gray-500);
    text-decoration: none; transition: color 0.2s; position: relative;
  }
  .sf-landing .nav-links a:not(.nav-cta)::after {
    content: ''; position: absolute; left: 0; bottom: -4px;
    width: 0; height: 1px; background: var(--sf-black); transition: width 0.25s ease;
  }
  .sf-landing .nav-links a:not(.nav-cta):hover { color: var(--sf-black); }
  .sf-landing .nav-links a:not(.nav-cta):hover::after { width: 100%; }

  .sf-landing .nav-cta {
    font-family: var(--sf-font-display); font-size: 14px; font-weight: 600;
    background: var(--sf-black); color: var(--sf-white) !important;
    padding: 9px 20px; border-radius: 7px; text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s; display: inline-block;
  }
  .sf-landing .nav-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }

  /* ── HERO ── */
  .sf-landing .hero {
    position: relative; min-height: 100vh;
    display: flex; flex-direction: column; justify-content: center;
    padding: 100px 40px 60px; overflow: hidden;
  }
  .sf-landing #flow-canvas {
    position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0;
  }
  .sf-landing .hero-vignette {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
      radial-gradient(ellipse 90% 70% at 30% 40%, transparent 0%, rgba(255,255,255,0.35) 75%, #ffffff 100%),
      linear-gradient(to bottom, transparent 60%, #ffffff 100%);
  }
  .sf-landing .hero-content { position: relative; z-index: 2; max-width: 820px; }

  .sf-landing .hero-badge {
    display: inline-flex; align-items: center; gap: 9px;
    font-family: var(--sf-font-mono); font-size: 12px; color: var(--sf-gray-500);
    border: 1px solid var(--sf-gray-200); padding: 7px 15px; border-radius: 100px;
    margin-bottom: 32px; background: rgba(255,255,255,0.6); backdrop-filter: blur(6px);
  }
  .sf-landing .badge-dot {
    width: 6px; height: 6px; background: var(--sf-black); border-radius: 50%;
    animation: sf-pulse 2.2s ease-in-out infinite;
  }
  @keyframes sf-pulse {
    0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(10,10,10,0.3); }
    50% { opacity: 0.5; transform: scale(0.85); box-shadow: 0 0 0 5px rgba(10,10,10,0); }
  }

  .sf-landing h1 {
    font-family: var(--sf-font-display); font-size: clamp(46px,7vw,92px);
    font-weight: 800; line-height: 0.98; letter-spacing: -0.045em;
    color: var(--sf-black); margin-bottom: 26px;
  }
  .sf-landing h1 .outline {
    -webkit-text-stroke: 2px var(--sf-black); color: transparent;
    transition: color 0.4s, -webkit-text-stroke-color 0.4s;
  }
  .sf-landing h1:hover .outline { color: var(--sf-black); }

  .sf-landing .hero-sub {
    font-size: clamp(17px,2vw,20px); font-weight: 300; color: var(--sf-gray-500);
    max-width: 540px; line-height: 1.65; margin-bottom: 42px;
  }
  .sf-landing .hero-actions { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }

  .sf-landing .btn-primary {
    font-family: var(--sf-font-display); font-size: 15px; font-weight: 600;
    background: var(--sf-black); color: var(--sf-white);
    padding: 15px 30px; border-radius: 9px; text-decoration: none;
    display: inline-flex; align-items: center; gap: 9px;
    transition: transform 0.2s, box-shadow 0.2s; border: none; cursor: pointer;
  }
  .sf-landing .btn-primary svg { transition: transform 0.25s; }
  .sf-landing .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.22); }
  .sf-landing .btn-primary:hover svg { transform: translateX(4px); }

  .sf-landing .btn-ghost {
    font-size: 14px; color: var(--sf-gray-500); text-decoration: none;
    display: inline-flex; align-items: center; gap: 7px; transition: color 0.2s;
  }
  .sf-landing .btn-ghost:hover { color: var(--sf-black); }
  .sf-landing .btn-ghost svg { transition: transform 0.25s; }
  .sf-landing .btn-ghost:hover svg { transform: translateY(3px); }

  /* ── MARQUEE ── */
  .sf-landing .platforms {
    position: relative; z-index: 2; padding: 28px 0;
    background: var(--sf-black); overflow: hidden;
  }
  .sf-landing .marquee {
    display: flex; gap: 56px; width: max-content;
    animation: sf-scroll-x 28s linear infinite;
  }
  .sf-landing .platforms:hover .marquee { animation-play-state: paused; }
  @keyframes sf-scroll-x {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  .sf-landing .marquee-item {
    font-family: var(--sf-font-mono); font-size: 14px;
    color: rgba(255,255,255,0.55); white-space: nowrap;
    display: flex; align-items: center; gap: 56px;
  }
  .sf-landing .marquee-item::after {
    content: ''; width: 4px; height: 4px; border-radius: 50%;
    background: rgba(255,255,255,0.25);
  }

  /* ── SECTIONS ── */
  .sf-landing .section { padding: 120px 40px; max-width: 1160px; margin: 0 auto; }
  .sf-landing .section-label {
    font-family: var(--sf-font-mono); font-size: 11px; color: var(--sf-gray-300);
    letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 18px;
    display: flex; align-items: center; gap: 10px;
  }
  .sf-landing .section-label::before {
    content: ''; width: 24px; height: 1px; background: var(--sf-gray-300);
  }
  .sf-landing h2 {
    font-family: var(--sf-font-display); font-size: clamp(34px,4.5vw,54px);
    font-weight: 700; letter-spacing: -0.035em; line-height: 1.05;
    margin-bottom: 60px; color: var(--sf-black);
  }

  /* ── FEATURES GRID ── */
  .sf-landing .features-grid {
    display: grid; grid-template-columns: repeat(3,1fr);
    gap: 1px; background: var(--sf-gray-100);
    border: 1px solid var(--sf-gray-100); border-radius: 16px; overflow: hidden;
  }
  .sf-landing .feature-card {
    background: var(--sf-white); padding: 40px 34px;
    position: relative; transition: background 0.3s; overflow: hidden;
  }
  .sf-landing .feature-card::before {
    content: ''; position: absolute; top: 0; left: 0;
    width: 0; height: 2px; background: var(--sf-black); transition: width 0.4s ease;
  }
  .sf-landing .feature-card:hover { background: var(--sf-paper); }
  .sf-landing .feature-card:hover::before { width: 100%; }
  .sf-landing .feature-icon {
    width: 44px; height: 44px; background: var(--sf-black); border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 22px; transition: transform 0.3s;
  }
  .sf-landing .feature-card:hover .feature-icon { transform: scale(1.08) rotate(-3deg); }
  .sf-landing .feature-icon svg {
    width: 21px; height: 21px; stroke: white; fill: none;
    stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
  }
  .sf-landing .feature-title {
    font-family: var(--sf-font-display); font-size: 17px; font-weight: 600;
    margin-bottom: 11px; color: var(--sf-black); letter-spacing: -0.01em;
  }
  .sf-landing .feature-desc { font-size: 14px; color: var(--sf-gray-500); line-height: 1.65; font-weight: 300; }

  /* ── WORKFLOW ── */
  .sf-landing .workflow {
    background: var(--sf-black); color: var(--sf-white);
    position: relative; overflow: hidden;
  }
  .sf-landing .workflow::before {
    content: ''; position: absolute; inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent);
    -webkit-mask-image: radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent);
  }
  .sf-landing .workflow-inner {
    max-width: 1160px; margin: 0 auto; padding: 120px 40px; position: relative; z-index: 1;
  }
  .sf-landing .workflow h2 { color: var(--sf-white); }
  .sf-landing .workflow .section-label { color: rgba(255,255,255,0.35); }
  .sf-landing .workflow .section-label::before { background: rgba(255,255,255,0.3); }

  .sf-landing .steps {
    display: grid; grid-template-columns: repeat(6,1fr); gap: 0; position: relative;
  }
  .sf-landing .steps::before {
    content: ''; position: absolute; top: 22px; left: 22px; right: 22px; height: 1px;
    background: linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.08));
  }
  .sf-landing .step { padding-right: 18px; position: relative; }
  .sf-landing .step-num {
    width: 44px; height: 44px; border: 1px solid rgba(255,255,255,0.22); border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--sf-font-mono); font-size: 13px; color: var(--sf-white);
    margin-bottom: 22px; background: var(--sf-black); position: relative; z-index: 1;
    transition: background 0.3s, color 0.3s, transform 0.3s;
  }
  .sf-landing .step:hover .step-num { background: var(--sf-white); color: var(--sf-black); transform: scale(1.1); }
  .sf-landing .step-name {
    font-family: var(--sf-font-display); font-size: 14px; font-weight: 600;
    color: var(--sf-white); margin-bottom: 9px; letter-spacing: 0.01em;
  }
  .sf-landing .step-desc { font-size: 12.5px; color: rgba(255,255,255,0.45); line-height: 1.6; font-weight: 300; }

  /* ── DIFFERENTIATOR ── */
  .sf-landing .diff {
    display: grid; grid-template-columns: 1.05fr 1fr; gap: 72px; align-items: center;
  }
  .sf-landing .diff-text h2 { margin-bottom: 22px; }
  .sf-landing .diff-text p { font-size: 16px; font-weight: 300; color: var(--sf-gray-500); line-height: 1.75; margin-bottom: 16px; }
  .sf-landing .diff-text strong { color: var(--sf-black); font-weight: 500; }

  .sf-landing .diff-visual {
    background: var(--sf-near-black); border-radius: 14px; padding: 26px 28px;
    font-family: var(--sf-font-mono); font-size: 12.5px; line-height: 1.95;
    box-shadow: 0 24px 60px rgba(0,0,0,0.16); position: relative; overflow: hidden;
  }
  .sf-landing .win-dots { display: flex; gap: 7px; margin-bottom: 18px; }
  .sf-landing .win-dots span { width: 11px; height: 11px; border-radius: 50%; background: rgba(255,255,255,0.18); }
  .sf-landing .cl { display: block; white-space: pre; }
  .sf-landing .c-com { color: rgba(255,255,255,0.35); }
  .sf-landing .c-key { color: #c9b8ff; }
  .sf-landing .c-fn  { color: #ffffff; font-weight: 500; }
  .sf-landing .c-str { color: #9fe3c5; }
  .sf-landing .c-par { color: rgba(255,255,255,0.65); }
  .sf-landing .cursor-blink {
    display: inline-block; width: 7px; height: 15px; background: #fff;
    vertical-align: -2px; animation: sf-blink 1.1s step-end infinite;
  }
  @keyframes sf-blink { 50% { opacity: 0; } }

  /* ── CTA ── */
  .sf-landing .cta-section {
    position: relative; overflow: hidden; text-align: center;
    padding: 130px 40px; background: var(--sf-paper);
    border-top: 1px solid var(--sf-gray-100);
  }
  .sf-landing .cta-section::before {
    content: ''; position: absolute; inset: 0;
    background-image:
      linear-gradient(var(--sf-gray-100) 1px, transparent 1px),
      linear-gradient(90deg, var(--sf-gray-100) 1px, transparent 1px);
    background-size: 52px 52px; opacity: 0.6;
    mask-image: radial-gradient(ellipse 60% 70% at 50% 50%, black, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse 60% 70% at 50% 50%, black, transparent 75%);
  }
  .sf-landing .cta-inner { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; }
  .sf-landing .cta-section .section-label { justify-content: center; }
  .sf-landing .cta-section .section-label::before { display: none; }
  .sf-landing .cta-section h2 { margin-bottom: 16px; }
  .sf-landing .cta-section p { font-size: 16px; font-weight: 300; color: var(--sf-gray-500); margin-bottom: 40px; }

  /* ── FOOTER ── */
  .sf-landing footer {
    padding: 36px 40px; border-top: 1px solid var(--sf-gray-100);
    display: flex; align-items: center; justify-content: space-between;
    background: var(--sf-white);
  }
  .sf-landing .footer-left { display: flex; align-items: center; gap: 11px; }
  .sf-landing .footer-copy { font-family: var(--sf-font-mono); font-size: 11px; color: var(--sf-gray-300); }
  .sf-landing .footer-links { display: flex; gap: 26px; list-style: none; }
  .sf-landing .footer-links a { font-size: 13px; color: var(--sf-gray-400); text-decoration: none; transition: color 0.2s; }
  .sf-landing .footer-links a:hover { color: var(--sf-black); }

  @media (max-width: 900px) {
    .sf-landing .diff { grid-template-columns: 1fr; gap: 44px; }
    .sf-landing .features-grid { grid-template-columns: repeat(2,1fr); }
  }
  @media (max-width: 768px) {
    .sf-landing .sf-nav { padding: 14px 22px; }
    .sf-landing .nav-links { gap: 18px; }
    .sf-landing .nav-links a:not(.nav-cta) { display: none; }
    .sf-landing .hero { padding: 90px 22px 50px; }
    .sf-landing .section { padding: 80px 22px; }
    .sf-landing .workflow-inner { padding: 80px 22px; }
    .sf-landing .features-grid { grid-template-columns: 1fr; }
    .sf-landing .steps { grid-template-columns: repeat(2,1fr); gap: 36px 12px; }
    .sf-landing .steps::before { display: none; }
    .sf-landing .cta-section { padding: 90px 22px; }
    .sf-landing footer { flex-direction: column; gap: 18px; padding: 28px 22px; text-align: center; }
  }
`;

/* ─── Logo SVG ─────────────────────────────────────────────────────────────── */
function LogoSvg({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-label="SensorFlow logo">
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill="#0a0a0a"/>
      <rect x="13" y="13" width="4" height="4" rx="0.6" fill="white"/>
      <rect x="19" y="13" width="4" height="4" rx="0.6" fill="white" opacity="0.75"/>
      <rect x="13" y="19" width="4" height="4" rx="0.6" fill="white" opacity="0.75"/>
      <rect x="19" y="19" width="4" height="4" rx="0.6" fill="white"/>
      <line x1="17" y1="15" x2="19" y2="15" stroke="white" strokeWidth="0.8"/>
      <line x1="15" y1="17" x2="15" y2="19" stroke="white" strokeWidth="0.8"/>
      <line x1="21" y1="17" x2="21" y2="19" stroke="white" strokeWidth="0.8"/>
      <line x1="17" y1="21" x2="19" y2="21" stroke="white" strokeWidth="0.8"/>
      <rect x="14" y="6" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="20" y="6" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="14" y="26" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="20" y="26" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="6" y="14" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="6" y="20" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="26" y="14" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="26" y="20" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
    </svg>
  );
}

/* ─── Marquee items ─────────────────────────────────────────────────────────── */
const MARQUEE_ITEMS = ["ESP32","STM32","nRF52840","Arduino Nano 33","Raspberry Pi Pico","Teensy 4.1","SAMD21","Any MCU"];

/* ─── Main component ─────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const canvasRef = useRef(null);
  const navRef = useRef(null);

  /* Inject scoped CSS once */
  useEffect(() => {
    const id = "sf-landing-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    return () => {
      /* leave style on unmount — cheap and avoids flash on back navigation */
    };
  }, []);

  /* Nav scroll state */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handler = () => nav.classList.toggle("scrolled", window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  /* Reveal on scroll */
  useEffect(() => {
    const els = document.querySelectorAll(".sf-landing .reveal");
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* Marquee duplication for seamless loop */
  const marqueeRef = useRef(null);
  useEffect(() => {
    const mq = marqueeRef.current;
    if (!mq || mq.dataset.duped) return;
    mq.innerHTML += mq.innerHTML;
    mq.dataset.duped = "1";
  }, []);

  /* Hero flow-field canvas */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w, h, dpr, nodes = [], t = 0, animId;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
    }

    function initNodes() {
      const count = Math.min(64, Math.floor((w * h) / 16000));
      nodes = [];
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.6 + 0.8,
        });
      }
    }

    const LINK_DIST = 140;

    function draw() {
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = n.x - m.x, dy = n.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            const a = (1 - dist / LINK_DIST) * 0.16;
            ctx.strokeStyle = `rgba(10,10,10,${a})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10,10,10,0.42)";
        ctx.fill();
      }

      const waves = 3;
      for (let k = 0; k < waves; k++) {
        const baseY = h * (0.28 + k * 0.22);
        const phase = t * 0.012 + k * 2.1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const env = Math.exp(-Math.pow((x - ((t * 1.6 + k * 320) % (w + 300)) + 150) / 120, 2));
          const y = baseY + Math.sin(x * 0.03 + phase) * 14 * env;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(10,10,10,0.10)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      t += 1;
      if (!prefersReduced) animId = requestAnimationFrame(draw);
    }

    const onResize = () => resize();
    window.addEventListener("resize", onResize, { passive: true });
    resize();
    if (prefersReduced) { draw(); } else { animId = requestAnimationFrame(draw); }

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="sf-landing">
      {/* ── NAV ── */}
      <nav id="sf-nav" className="sf-nav" ref={navRef}>
        <Link to="/" className="logo-wrap">
          <LogoSvg size={34} />
          <span className="logo-text">SensorFlow</span>
        </Link>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#how-it-works">How it works</a></li>
          <li><a href="#pricing">Get started</a></li>
          {/* Staged rollout (Option B): shown in local dev + when explicitly enabled;
              hidden on the public prod build until the ForgeOpt backend is hosted (Option A).
              The /optimize route stays reachable by direct URL for demos. */}
          {(process.env.REACT_APP_SHOW_OPTIMIZER === "true" || process.env.NODE_ENV === "development") && (
            <li><Link to="/optimize" style={{ color: "#6b6a63", textDecoration: "none", fontSize: "14px" }}>Vision Optimizer</Link></li>
          )}
          <li><Link to="/contact" style={{ color: "#6b6a63", textDecoration: "none", fontSize: "14px" }}>Contact</Link></li>
          <li>
            <Link to="/app" className="nav-cta">Try free →</Link>
          </li>
        </ul>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <canvas id="flow-canvas" ref={canvasRef} />
        <div className="hero-vignette" />
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot" />
            Hardware-agnostic embedded ML
          </div>
          <h1>
            Train once.<br />
            Deploy to <span className="outline">any chip.</span>
          </h1>
          <p className="hero-sub">
            SensorFlow is the development platform for engineers building real-time sensor event
            classification — on whatever hardware you choose.
          </p>
          <div className="hero-actions">
            <Link to="/app" className="btn-primary">
              Try for free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <a href="#how-it-works" className="btn-ghost">
              See how it works
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 2v10M3 8l4 4 4-4" />
              </svg>
            </a>
          </div>
          {(process.env.REACT_APP_SHOW_OPTIMIZER === "true" || process.env.NODE_ENV === "development") && (
            <p style={{ marginTop: "18px", fontSize: "14px", color: "#6b6a63" }}>
              Have a computer-vision model instead?{" "}
              <Link to="/optimize" style={{ color: "#0a0a0a", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>
                Shrink it for the edge →
              </Link>
            </p>
          )}
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <div className="platforms">
        <div className="marquee" ref={marqueeRef}>
          {MARQUEE_ITEMS.map((item) => (
            <div className="marquee-item" key={item}>{item}</div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="section reveal" id="features">
        <div className="section-label">features</div>
        <h2>Everything you need,<br />nothing you don't.</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 20 20"><path d="M10 2L2 7v6l8 5 8-5V7L10 2z"/><path d="M10 12V7M7 9l3-2 3 2"/></svg>
            </div>
            <div className="feature-title">AI Pipeline Designer</div>
            <div className="feature-desc">Describe your classification task in plain English. SensorFlow generates a complete DSP + ML pipeline tuned for your hardware constraints.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1"/><rect x="11" y="11" width="6.5" height="6.5" rx="1"/></svg>
            </div>
            <div className="feature-title">Variable-Duration Normalization</div>
            <div className="feature-desc">Proprietary normalization preserves the true signal shape across events of different lengths — a detail fixed-window approaches lose.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 20 20"><rect x="3" y="3.5" width="14" height="9" rx="1"/><path d="M7 16.5h6M10 12.5v4"/><path d="M6.5 8l2 2 4-4"/></svg>
            </div>
            <div className="feature-title">Live Hardware Validation</div>
            <div className="feature-desc">Connect your device via Web Serial and classify events in real time, straight from the browser — no firmware flash required.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 20 20"><path d="M3 16l4-8 3.5 4 3-6 3.5 10"/></svg>
            </div>
            <div className="feature-title">C Header Export</div>
            <div className="feature-desc">One-click export of a ready-to-compile C header with chip-specific SRAM and flash estimates. Drop it into any embedded project.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.5v4.5l3 2"/></svg>
            </div>
            <div className="feature-title">Hardware-Agnostic</div>
            <div className="feature-desc">No SDK lock-in, no proprietary toolchain. Deploy the same trained model to ESP32, STM32, nRF, or whatever your supply chain allows.</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg viewBox="0 0 20 20"><path d="M3 6h14M3 10h14M3 14h9"/><circle cx="15" cy="14" r="2" fill="white" stroke="none"/></svg>
            </div>
            <div className="feature-title">Full Pipeline Control</div>
            <div className="feature-desc">Add, remove, skip, or customize every block — Butterworth filter, FFT, normalization, classifier — plus custom AI-generated DSP blocks.</div>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW ── */}
      <section className="workflow" id="how-it-works">
        <div className="workflow-inner reveal">
          <div className="section-label">workflow</div>
          <h2>From sensor to deployment<br />in six steps.</h2>
          <div className="steps">
            {[
              ["01","Setup","Define your project, device target, and sensor config."],
              ["02","Collect","Stream labeled sensor data or upload CSV recordings."],
              ["03","Pipeline","Configure DSP + ML blocks with AI assistance."],
              ["04","Train","Train in-browser with live accuracy metrics."],
              ["05","Validate","Live classification via Web Serial on real hardware."],
              ["06","Export","C header with resource estimates, ready to ship."],
            ].map(([num, name, desc]) => (
              <div className="step" key={num}>
                <div className="step-num">{num}</div>
                <div className="step-name">{name}</div>
                <div className="step-desc">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIFFERENTIATOR ── */}
      <section className="section reveal">
        <div className="diff">
          <div className="diff-text">
            <div className="section-label">why sensorflow</div>
            <h2>Agnostic by architecture.</h2>
            <p>The embedded ML world is full of platforms that quietly assume one chip vendor. The moment your design calls for something else, the tooling stops working with you.</p>
            <p>SensorFlow was built from the ground up to be <strong>hardware-agnostic by design</strong> — not as a feature bolted on later, but as a core constraint. Your model runs wherever your project runs.</p>
          </div>
          <div className="diff-visual">
            <div className="win-dots"><span /><span /><span /></div>
            <code className="cl"><span className="c-com"># normalize_event.py</span></code>
            <code className="cl"> </code>
            <code className="cl"><span className="c-key">def</span> <span className="c-fn">normalize_event</span><span className="c-par">(</span></code>
            <code className="cl">    <span className="c-par">df,</span></code>
            <code className="cl">    <span className="c-par">target_len</span>=<span className="c-par">100,</span></code>
            <code className="cl"><span className="c-par">):</span></code>
            <code className="cl"> </code>
            <code className="cl"><span className="c-com">    # shape-preserving resampling</span></code>
            <code className="cl"><span className="c-com">    # across variable-length</span></code>
            <code className="cl"><span className="c-com">    # sensor events</span><span className="cursor-blink" /></code>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section" id="pricing">
        <div className="cta-inner reveal">
          <div className="section-label">get started</div>
          <h2>Free to try.<br />No credit card.</h2>
          <p>Start building immediately. No setup, no commitment.</p>
          <Link to="/app" className="btn-primary" style={{ display: "inline-flex" }}>
            Try SensorFlow free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="footer-left">
          <LogoSvg size={24} />
          <span className="footer-copy">© 2026 SensorFlow · Cambridge, MA</span>
        </div>
        <ul className="footer-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#how-it-works">How it works</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><Link to="/app">Launch app</Link></li>
          <li><Link to="/contact">Contact</Link></li>
        </ul>
      </footer>
    </div>
  );
}
