import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// ForgeOpt backend (separate service from the sklearn sensor API on :8000).
const FORGEOPT_URL = process.env.REACT_APP_FORGEOPT_URL || "http://localhost:8100";
// Live interactive tool shows in local dev (for demos) or when explicitly enabled.
// On the public prod build it's off → visitors see the feature showcase + free-pilot CTA.
const LIVE = process.env.REACT_APP_OPTIMIZER_LIVE === "true" || process.env.NODE_ENV === "development";
const CONTACT_EMAIL = process.env.REACT_APP_CONTACT_EMAIL || "";

const INK = "#0a0a0a";
const SUB = "#6b6a63";
const MUTE = "#b0afa8";
const LINE = "#ebeae5";
const PANEL = "#f8f7f3";
const TEAL = "#1D9E75";
const AMBER = "#F59E0B";
const RED = "#EF4444";
const SYNE = "'Syne', sans-serif";
const MONO = "'DM Mono', monospace";

const fmtBytes = (b) => {
  if (b == null) return "—";
  const u = ["B", "KB", "MB", "GB"]; let i = 0, v = b;
  while (v >= 1024 && i < 3) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
};
const fmtCount = (n) => {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
};
const kb = (v) => {
  if (v >= 1048576) return `${(v / 1048576).toFixed(1).replace(/\.0$/, "")}G`;
  if (v >= 1024) return `${(v / 1024).toFixed(1).replace(/\.0$/, "")}M`;
  return `${v.toFixed(0)}K`;
};

const VERDICT = {
  PASS: { label: "PASS", color: TEAL, note: "Accuracy preserved — safe to ship" },
  WARN: { label: "WARN", color: AMBER, note: "Minor accuracy drop — review before shipping" },
  FAIL: { label: "FAIL", color: RED, note: "Accuracy regressed — needs QAT" },
};

function guardrailFrom(r) {
  const f = r.fidelity || {};
  if (f.accuracy_fp32 != null) {
    const d = f.accuracy_int8 - f.accuracy_fp32;
    return d >= -0.02 ? "PASS" : d >= -0.05 ? "WARN" : "FAIL";
  }
  const a = f.top1_agreement ?? 1;
  return a >= 0.95 ? "PASS" : a >= 0.8 ? "WARN" : "FAIL";
}

// A real, measured result shown as an illustrative example (no live backend needed).
const EXAMPLE_REPORT = {
  strategy: "PTQ W8A8",
  params: 3487821, macs: 300774272,
  fp32_bytes: 13946880, int8_bytes: 3777061,
  fidelity: { accuracy_fp32: 0.838, accuracy_int8: 0.833, n: 400 },
  cost: [
    { device: "STM32 Cortex-M4 (Disco)", klass: "MCU", free_cloud: "ST", fits: false, flash_kb: 3688, flash_budget_kb: 1024, ram_kb: 2458, ram_budget_kb: 256, latency_ms_est: 5012.9 },
    { device: "STM32 Cortex-M7 (Nucleo-H7)", klass: "MCU", free_cloud: "ST", fits: false, flash_kb: 3688, flash_budget_kb: 2048, ram_kb: 2458, ram_budget_kb: 512, latency_ms_est: 835.5 },
    { device: "STM32 N6 (Cortex-M55 + Ethos-U)", klass: "MCU+NPU", free_cloud: "ST", fits: false, flash_kb: 3688, flash_budget_kb: 4096, ram_kb: 2458, ram_budget_kb: 1024, latency_ms_est: 25.1 },
    { device: "Google Coral Edge TPU", klass: "Edge TPU", fits: true, flash_kb: 3688, flash_budget_kb: 8388608, ram_kb: 2458, ram_budget_kb: 8192, latency_ms_est: 1.9 },
    { device: "Raspberry Pi 5 (Cortex-A76)", klass: "Edge CPU", fits: true, flash_kb: 3688, flash_budget_kb: 33554432, ram_kb: 2458, ram_budget_kb: 4194304, latency_ms_est: 62.7 },
    { device: "Qualcomm Snapdragon", klass: "Mobile NPU", free_cloud: "QAI Hub", fits: true, flash_kb: 3688, flash_budget_kb: 33554432, ram_kb: 2458, ram_budget_kb: 4194304, latency_ms_est: 0.9 },
    { device: "NVIDIA Jetson Orin Nano", klass: "Edge GPU", fits: true, flash_kb: 3688, flash_budget_kb: 33554432, ram_kb: 2458, ram_budget_kb: 8388608, latency_ms_est: 1.5 },
  ],
};

const FEATURES = [
  { t: "Shrink 3–4×", d: "Quantization + structured pruning, so it fits your target." },
  { t: "Verified on your data", d: "Real before/after accuracy — never a silently-broken model." },
  { t: "Fits which chip?", d: "Exact flash + RAM check across devices — RAM is the usual blocker." },
  { t: "Any model, any chip", d: "YOLO, PyTorch, TensorFlow → ONNX. MCU, NPU, Pi, Jetson." },
];

export default function VisionOptimizer() {
  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: INK }}>
      <style>{`
        @keyframes sf-spin { to { transform: rotate(360deg); } }
        .vo-btn { transition: all .15s; cursor: pointer; }
        .vo-btn:disabled { opacity: .45; cursor: default; }
        .vo-primary:hover:not(:disabled) { background:#2a2a2a; }
        .vo-ghost:hover:not(:disabled) { border-color:#c9c8c1; background:${PANEL}; }
        .vo-cta:hover { background:#2a2a2a; }
      `}</style>

      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 28px", borderBottom: `1px solid ${LINE}` }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK }}>
          <LogoMark />
          <span style={{ fontFamily: SYNE, fontWeight: 700, letterSpacing: "-.02em", fontSize: 17 }}>SensorFlow</span>
          <span style={{ fontFamily: MONO, color: MUTE, fontSize: 11, letterSpacing: ".04em", marginTop: 2 }}>/ Vision Optimizer</span>
        </Link>
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <Link to="/app" style={{ color: SUB, textDecoration: "none", fontSize: 14 }}>Sensor → MCU</Link>
          <Link to="/contact" style={{ color: SUB, textDecoration: "none", fontSize: 14 }}>Contact</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "38px 24px 90px" }}>
        <div style={{ fontFamily: MONO, color: TEAL, fontSize: 11, letterSpacing: ".12em", marginBottom: 14 }}>
          ● VISION / CNN OPTIMIZATION
        </div>
        <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 30, lineHeight: 1.12, letterSpacing: "-.02em", margin: "0 0 14px" }}>
          Shrink your model.<br />
          <span style={{ color: MUTE }}>Deploy to any chip.</span>
        </h1>
        <p style={{ color: SUB, fontSize: 15, lineHeight: 1.55, margin: "0 0 30px", maxWidth: 540 }}>
          Bring a trained CNN in ONNX — from YOLO, PyTorch, or TensorFlow. It gets smaller and
          faster, the accuracy is measured on your data, and you're told honestly whether it still
          works — and which chips it actually fits.
        </p>

        {/* Interactive tool — shown in local dev / when enabled */}
        {LIVE && <LiveTool />}

        {/* Feature strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 34 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 15, marginBottom: 5 }}>{f.t}</div>
              <div style={{ color: SUB, fontSize: 13.5, lineHeight: 1.5 }}>{f.d}</div>
            </div>
          ))}
        </div>

        {/* Example result */}
        <div style={{ fontFamily: MONO, color: MUTE, fontSize: 11, letterSpacing: ".1em", marginBottom: 10 }}>
          EXAMPLE OUTPUT — MobileNetV2 (ImageNet), verified on 400 real images
        </div>
        <Report report={EXAMPLE_REPORT} example />

        {/* Free-pilot CTA */}
        <div style={{ marginTop: 40, border: `1px solid ${INK}`, borderRadius: 16, padding: "30px 28px",
          background: PANEL, textAlign: "center" }}>
          <h2 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 22, margin: "0 0 10px" }}>
            Get your model optimized — free
          </h2>
          <p style={{ color: SUB, fontSize: 15, lineHeight: 1.55, margin: "0 auto 22px", maxWidth: 520 }}>
            Send your trained model and target device. I'll optimize it, verify the accuracy on your
            data, and show you exactly what it can hit on your hardware — no charge for the first one.
          </p>
          {CONTACT_EMAIL ? (
            <a className="vo-cta" href={`mailto:${CONTACT_EMAIL}?subject=Free%20optimization%20pilot`}
              style={{ display: "inline-block", background: INK, color: "#fff", textDecoration: "none",
                padding: "13px 26px", borderRadius: 10, fontWeight: 600, fontSize: 15 }}>
              Start a free pilot →
            </a>
          ) : (
            <Link className="vo-cta" to="/contact"
              style={{ display: "inline-block", background: INK, color: "#fff", textDecoration: "none",
                padding: "13px 26px", borderRadius: 10, fontWeight: 600, fontSize: 15 }}>
              Start a free pilot →
            </Link>
          )}
        </div>

        <p style={{ color: MUTE, fontSize: 12, textAlign: "center", marginTop: 26 }}>
          Techniques: INT8/W8A16 quantization · structured pruning · QAT · cross-layer equalization ·
          mixed-precision. Numbers are measured on real data unless marked “estimate.”
        </p>
      </div>
    </div>
  );
}

function LiveTool() {
  const [sample, setSample] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [targetDrop, setTargetDrop] = useState(2);
  const [file, setFile] = useState(null);

  useEffect(() => {
    fetch(`${FORGEOPT_URL}/api/sample-info`).then((r) => r.json()).then(setSample).catch(() => {});
  }, []);

  async function run(useSample) {
    setBusy(true); setError(null); setReport(null);
    try {
      const fd = new FormData();
      fd.append("use_sample", useSample ? "true" : "false");
      fd.append("target_drop", String(targetDrop / 100));
      if (!useSample) {
        if (!file) { setError("Choose an .onnx model first."); setBusy(false); return; }
        fd.append("model", file);
      }
      const res = await fetch(`${FORGEOPT_URL}/api/optimize`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || res.statusText); }
      setReport(await res.json());
    } catch (e) {
      setError(String(e.message || e).includes("Failed to fetch")
        ? `Can't reach the optimizer service at ${FORGEOPT_URL}. Start it: uvicorn web.api.server:app --port 8100 (forgeopt repo).`
        : String(e.message || e));
    }
    setBusy(false);
  }

  return (
    <div style={{ marginBottom: 34 }}>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: 24, background: "#fff" }}>
        <h2 style={{ fontFamily: SYNE, fontSize: 18, margin: "0 0 18px" }}>Optimize a model</h2>
        <label style={{ display: "block", fontFamily: MONO, fontSize: 11, color: MUTE, letterSpacing: ".04em", marginBottom: 8 }}>MODEL</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px dashed ${LINE}`,
          borderRadius: 10, padding: "12px 14px", background: PANEL, marginBottom: 20 }}>
          <input type="file" accept=".onnx" onChange={(e) => setFile(e.target.files[0])} style={{ fontSize: 13, color: SUB }} />
          <span style={{ color: MUTE, fontSize: 13 }}>{file ? file.name : "Upload a CNN in ONNX format"}</span>
        </div>
        <label style={{ display: "block", fontFamily: MONO, fontSize: 11, color: MUTE, letterSpacing: ".04em", marginBottom: 8 }}>
          ACCURACY BUDGET — <b style={{ color: INK }}>{targetDrop.toFixed(1)} pts</b> max drop
        </label>
        <input type="range" min="0.5" max="10" step="0.5" value={targetDrop}
          onChange={(e) => setTargetDrop(parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: INK, marginBottom: 22 }} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="vo-btn vo-primary" disabled={busy} onClick={() => run(false)}
            style={{ background: INK, color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 600, fontSize: 14 }}>
            Optimize my model
          </button>
          <button className="vo-btn vo-ghost" disabled={busy} onClick={() => run(true)}
            style={{ background: "#fff", color: INK, border: `1px solid ${LINE}`, borderRadius: 10, padding: "11px 20px", fontWeight: 600, fontSize: 14 }}>
            {sample ? `Try the sample — ${sample.name}` : "Try the sample"}
          </button>
        </div>
        {busy && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: SUB, marginTop: 20, fontSize: 14 }}>
            <span style={{ width: 18, height: 18, border: `2px solid ${LINE}`, borderTopColor: INK,
              borderRadius: "50%", animation: "sf-spin .8s linear infinite", display: "inline-block" }} />
            Optimizing — quantizing, measuring real accuracy, checking device fit…
          </div>
        )}
        {error && <div style={{ marginTop: 16, color: RED, fontSize: 14 }}>⚠ {error}</div>}
      </div>
      {report && <div style={{ marginTop: 22 }}><Report report={report} /></div>}
    </div>
  );
}

function Report({ report, example }) {
  const f = report.fidelity || {};
  const v = VERDICT[guardrailFrom(report)];
  const sizeX = report.int8_bytes ? report.fp32_bytes / report.int8_bytes : null;
  const hasAcc = f.accuracy_fp32 != null;

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: 24, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12, letterSpacing: ".5px", padding: "5px 12px",
          borderRadius: 8, color: v.color, background: `${v.color}18`, border: `1px solid ${v.color}55` }}>{v.label}</span>
        <span style={{ fontSize: 14 }}>{v.note}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, color: MUTE, fontSize: 13 }}>strategy: {report.strategy}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 26 }}>
        <Card title="Model size" before={fmtBytes(report.fp32_bytes)} after={fmtBytes(report.int8_bytes)}
          delta={sizeX ? `${sizeX.toFixed(2)}× smaller` : ""} good />
        <Card title={hasAcc ? "Top-1 accuracy" : "FP32↔INT8 agreement"}
          before={hasAcc ? `${(f.accuracy_fp32 * 100).toFixed(1)}%` : "—"}
          after={hasAcc ? `${(f.accuracy_int8 * 100).toFixed(1)}%` : `${((f.top1_agreement ?? 0) * 100).toFixed(1)}%`}
          delta={hasAcc ? `${((f.accuracy_int8 - f.accuracy_fp32) * 100).toFixed(1)} pts${f.n ? `, n=${f.n}` : ""}` : "on real data"}
          good={hasAcc ? f.accuracy_int8 >= f.accuracy_fp32 - 0.02 : true} />
        <Card title="Parameters" before={fmtCount(report.params)} after={fmtCount(report.params)} delta="unchanged" />
        <Card title="Compute (MACs)" before={fmtCount(report.macs)} after={fmtCount(report.macs)} delta="est." />
      </div>

      <div style={{ marginBottom: example ? 0 : 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <h3 style={{ fontFamily: SYNE, fontSize: 15, margin: 0 }}>Where it runs</h3>
          <span style={{ color: MUTE, fontSize: 12 }}>fit = exact · <span style={{ color: RED }}>red</span> = the limit it exceeds (RAM = peak activation) · latency = estimate · ☁ = free cloud can measure real latency</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{["Device", "Class", "Fits?", "Flash", "RAM", "~Latency"].map((h, i) => (
              <th key={i} style={{ textAlign: "left", color: MUTE, fontWeight: 600, fontSize: 12,
                padding: "8px 10px", borderBottom: `1px solid ${LINE}`, fontFamily: i ? MONO : SYNE }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {report.cost.map((r, i) => (
              <tr key={i} style={{ color: r.fits ? INK : MUTE }}>
                <td style={{ padding: "9px 10px", borderBottom: `1px solid ${LINE}88` }}>{r.device}{r.free_cloud ? " ☁" : ""}</td>
                <td style={{ padding: "9px 10px", borderBottom: `1px solid ${LINE}88`, fontFamily: MONO }}>{r.klass}</td>
                <td style={{ padding: "9px 10px", borderBottom: `1px solid ${LINE}88` }}>
                  <span style={{ padding: "2px 9px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    color: r.fits ? TEAL : MUTE, background: r.fits ? `${TEAL}18` : "#eeede8" }}>{r.fits ? "yes" : "no"}</span>
                </td>
                <td style={{ padding: "9px 10px", borderBottom: `1px solid ${LINE}88`, fontFamily: MONO,
                  color: r.flash_kb > r.flash_budget_kb ? RED : undefined, fontWeight: r.flash_kb > r.flash_budget_kb ? 700 : undefined }}>{kb(r.flash_kb)}/{kb(r.flash_budget_kb)}</td>
                <td style={{ padding: "9px 10px", borderBottom: `1px solid ${LINE}88`, fontFamily: MONO,
                  color: r.ram_kb > r.ram_budget_kb ? RED : undefined, fontWeight: r.ram_kb > r.ram_budget_kb ? 700 : undefined }}>{kb(r.ram_kb)}/{kb(r.ram_budget_kb)}</td>
                <td style={{ padding: "9px 10px", borderBottom: `1px solid ${LINE}88`, fontFamily: MONO }}>{r.latency_ms_est != null ? `${r.latency_ms_est.toFixed(1)} ms` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!example && (
        <a href={`${FORGEOPT_URL}${report.download_url}`} download
          style={{ display: "inline-block", background: INK, color: "#fff", textDecoration: "none",
            padding: "11px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14 }}>
          ↓ Download optimized model (.onnx)
        </a>
      )}
    </div>
  );
}

function Card({ title, before, after, delta, good }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: MUTE, textTransform: "uppercase", letterSpacing: ".5px" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "12px 0 6px" }}>
        <span style={{ color: MUTE, fontSize: 15, textDecoration: "line-through", textDecorationColor: LINE }}>{before}</span>
        <span style={{ color: MUTE }}>→</span>
        <span style={{ fontFamily: SYNE, fontSize: 22, fontWeight: 800, color: good ? TEAL : INK }}>{after}</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: good ? TEAL : MUTE }}>{delta}</div>
    </div>
  );
}

function LogoMark() {
  return (
    <svg width={26} height={26} viewBox="0 0 36 36" fill="none" aria-hidden>
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill={INK} />
      <rect x="13" y="13" width="4" height="4" rx=".6" fill="#fff" />
      <rect x="19" y="13" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="13" y="19" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="19" y="19" width="4" height="4" rx=".6" fill="#fff" />
    </svg>
  );
}
