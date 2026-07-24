import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";

// The real forgeopt engine (whitebox NSGA optimizer) runs as its own service — it needs
// torch/onnx, so it can't run on Vercel. Point this at that host in prod; defaults to local dev.
//   local:  uvicorn webapp.server:app --port 8099   (from the forgeopt repo)
const FORGEOPT_URL = process.env.REACT_APP_FORGEOPT_URL || "http://localhost:8099";
// Show the live embedded tool in dev, or in prod when the backend is wired up + enabled.
const LIVE = process.env.REACT_APP_OPTIMIZER_LIVE === "true" || process.env.NODE_ENV === "development";
const CONTACT_EMAIL = process.env.REACT_APP_CONTACT_EMAIL || "";

const INK = "#0a0a0a";
const SUB = "#4b4a44";
const MUTE = "#8a897f";
const LINE = "#ebeae5";
const PANEL = "#f8f7f3";
const TEAL = "#1D9E75";
const SYNE = "'Syne', sans-serif";
const MONO = "'DM Mono', monospace";
const BAR_H = 58;

function LogoMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-label="SensorForge logo">
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill={INK} />
      <rect x="13" y="13" width="4" height="4" rx=".6" fill="#fff" />
      <rect x="19" y="13" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="13" y="19" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="19" y="19" width="4" height="4" rx=".6" fill="#fff" />
    </svg>
  );
}

function TopBar() {
  return (
    <nav style={{ height: BAR_H, boxSizing: "border-box", display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 24px", borderBottom: `1px solid ${LINE}`, background: "#fff" }}>
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK }}>
        <LogoMark />
        <span style={{ fontFamily: SYNE, fontWeight: 700, letterSpacing: "-.02em", fontSize: 17 }}>SensorForge</span>
        <span style={{ fontFamily: MONO, color: MUTE, fontSize: 11, letterSpacing: ".04em", marginTop: 2 }}>/ Optimizer</span>
      </Link>
      <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
        <a href={FORGEOPT_URL} target="_blank" rel="noreferrer"
          style={{ color: SUB, textDecoration: "none", fontSize: 13, fontFamily: MONO }}>Open full screen ↗</a>
        <Link to="/app" style={{ color: SUB, textDecoration: "none", fontSize: 14 }}>Sensor → MCU</Link>
        <Link to="/contact" style={{ color: SUB, textDecoration: "none", fontSize: 14 }}>Contact</Link>
      </div>
    </nav>
  );
}

// Reachability ping: no-cors resolves if the service answers at all, rejects if it's down.
// (The embedded tool talks to its own same-origin API, so no CORS config is needed here.)
function useReachable(enabled) {
  const [state, setState] = useState(enabled ? "checking" : "off"); // checking | up | down | off
  const check = useCallback(() => {
    if (!enabled) { setState("off"); return; }
    setState("checking");
    fetch(FORGEOPT_URL, { mode: "no-cors" })
      .then(() => setState("up"))
      .catch(() => setState("down"));
  }, [enabled]);
  useEffect(() => { check(); }, [check]);
  return [state, check];
}

const PilotCTA = () => (
  <div style={{ marginTop: 30, border: `1px solid ${INK}`, borderRadius: 16, padding: "26px 24px",
    background: PANEL, textAlign: "center", maxWidth: 520 }}>
    <h2 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 20, margin: "0 0 8px" }}>Get your model optimized — free</h2>
    <p style={{ color: SUB, fontSize: 14.5, lineHeight: 1.55, margin: "0 auto 20px", maxWidth: 440 }}>
      Send your trained model and target device. We optimize it, verify the accuracy on your data, and show
      exactly what it hits on your hardware — first one’s on us.
    </p>
    {CONTACT_EMAIL ? (
      <a href={`mailto:${CONTACT_EMAIL}?subject=Free%20optimization%20pilot`}
        style={{ display: "inline-block", background: INK, color: "#fff", textDecoration: "none",
          padding: "12px 24px", borderRadius: 10, fontWeight: 600, fontSize: 15 }}>Start a free pilot →</a>
    ) : (
      <Link to="/contact" style={{ display: "inline-block", background: INK, color: "#fff", textDecoration: "none",
        padding: "12px 24px", borderRadius: 10, fontWeight: 600, fontSize: 15 }}>Start a free pilot →</Link>
    )}
  </div>
);

function CenterPanel({ children }) {
  return (
    <div style={{ height: `calc(100vh - ${BAR_H}px)`, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "32px 24px", background: "#fff", textAlign: "center" }}>
      {children}
    </div>
  );
}

export default function VisionOptimizer() {
  const [state, recheck] = useReachable(LIVE);

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: INK }}>
      <style>{`@keyframes ef-spin { to { transform: rotate(360deg); } }`}</style>
      <TopBar />

      {/* LIVE + backend reachable → the real forgeopt whitebox tool, full height */}
      {state === "up" && (
        <iframe
          title="SensorForge Optimizer"
          src={FORGEOPT_URL}
          style={{ display: "block", width: "100%", height: `calc(100vh - ${BAR_H}px)`, border: "none" }}
        />
      )}

      {state === "checking" && (
        <CenterPanel>
          <span style={{ width: 26, height: 26, border: `3px solid ${LINE}`, borderTopColor: INK,
            borderRadius: "50%", animation: "ef-spin .8s linear infinite", display: "inline-block" }} />
          <div style={{ color: SUB, marginTop: 16, fontSize: 14 }}>Connecting to the optimizer…</div>
        </CenterPanel>
      )}

      {/* LIVE but backend down (e.g., forgot to start it locally) → clear instructions */}
      {state === "down" && (
        <CenterPanel>
          <div style={{ fontFamily: MONO, color: TEAL, fontSize: 11, letterSpacing: ".12em", marginBottom: 12 }}>● OPTIMIZER OFFLINE</div>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 24, margin: "0 0 10px" }}>The optimizer backend isn’t running</h1>
          <p style={{ color: SUB, fontSize: 15, lineHeight: 1.6, maxWidth: 500, margin: "0 0 18px" }}>
            The SensorForge optimizer runs as a service (it needs PyTorch/ONNX). Start it, then reconnect:
          </p>
          <code style={{ display: "block", fontFamily: MONO, fontSize: 13, background: PANEL, color: INK,
            border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
            uvicorn webapp.server:app --port 8099
          </code>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={recheck} style={{ background: INK, color: "#fff", border: "none", borderRadius: 10,
              padding: "11px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Reconnect</button>
            <a href={FORGEOPT_URL} target="_blank" rel="noreferrer" style={{ background: "#fff", color: INK,
              border: `1px solid ${LINE}`, borderRadius: 10, padding: "11px 22px", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
              Open directly ↗
            </a>
          </div>
          <div style={{ marginTop: 8 }}><PilotCTA /></div>
        </CenterPanel>
      )}

      {/* Not LIVE (prod build without the backend wired up) → concise intro + pilot CTA */}
      {state === "off" && (
        <CenterPanel>
          <div style={{ fontFamily: MONO, color: TEAL, fontSize: 11, letterSpacing: ".12em", marginBottom: 12 }}>● CNN / VISION OPTIMIZATION</div>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 28, lineHeight: 1.15, margin: "0 0 12px", maxWidth: 560 }}>
            Shrink your model. <span style={{ color: MUTE }}>Deploy to any chip.</span>
          </h1>
          <p style={{ color: SUB, fontSize: 15, lineHeight: 1.6, maxWidth: 540, margin: "0 0 6px" }}>
            Bring a trained CNN in ONNX — from YOLO, PyTorch, or TensorFlow. SensorForge makes it smaller and
            faster, measures the accuracy on your data, and tells you honestly which chips it fits.
          </p>
          <PilotCTA />
        </CenterPanel>
      )}
    </div>
  );
}
