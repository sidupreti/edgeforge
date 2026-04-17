import React, { useState, useEffect, useRef } from "react";
import CopilotChat from "./CopilotChat";
import API_BASE_URL from "../config";

// ── Constants ─────────────────────────────────────────────────────────────────

const BLOCKS = [
  { id: "raw",       label: "Raw Signal", sublabel: "Source" },
  { id: "filter",    label: "Filter",     sublabel: "Low-pass" },
  { id: "normalize", label: "Normalize",  sublabel: "Window" },
  { id: "features",  label: "Features",   sublabel: "Extract" },
  { id: "model",     label: "Model",      sublabel: "Classify" },
];

const TIME_FEATURES = [
  { id: "mean",         label: "Mean" },
  { id: "std_dev",      label: "Std Dev" },
  { id: "rms",          label: "RMS" },
  { id: "peak",         label: "Peak" },
  { id: "absolute_max", label: "Absolute Max" },
];

const FREQ_FEATURES = [
  { id: "fft_energy",    label: "FFT Energy" },
  { id: "dominant_freq", label: "Dominant Freq" },
  { id: "kurtosis",      label: "Kurtosis" },
];

const MODELS = [
  { id: "auto",   label: "Auto-select",    desc: "Recommended — benchmarks all classifiers and picks the best.", recommended: true },
  { id: "rf",     label: "Random Forest",  desc: "Good for tabular features, interpretable, fast inference." },
  { id: "svm",    label: "SVM",            desc: "Strong on small datasets, works well with handcrafted features." },
  { id: "nn",     label: "Neural Net",     desc: "Most flexible, requires more data and tuning." },
];

const ORDER_OPTIONS = [2, 4, 6, 8];
const INTERP_OPTIONS = ["cubic", "linear"];

// ── Primitive UI pieces ───────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">{children}</p>
  );
}

function SegmentedControl({ options, value, onChange, fmt = (v) => v }) {
  return (
    <div className="inline-flex border border-gray-200 rounded overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 text-xs transition-colors ${
            value === opt
              ? "bg-accent text-white"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          {fmt(opt)}
        </button>
      ))}
    </div>
  );
}

function Slider({ min, max, value, onChange, unit = "" }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
          style={{
            accentColor: "#1D9E75",
            background: `linear-gradient(to right, #1D9E75 ${pct}%, #e5e7eb ${pct}%)`,
            transition: "background 300ms ease",
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 tabular-nums">
        <span>{min}{unit}</span>
        <span className="text-accent font-bold">{value}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function Checkbox({ id, label, checked, onChange }) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2.5 py-1.5 cursor-pointer group"
    >
      <span
        className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          checked
            ? "bg-accent border-accent"
            : "border-gray-300 group-hover:border-gray-400"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l3 3 5-6" />
          </svg>
        )}
      </span>
      <input type="checkbox" id={id} checked={checked} onChange={onChange} className="sr-only" />
      <span className={`text-xs ${checked ? "text-gray-800" : "text-gray-500"}`}>{label}</span>
    </label>
  );
}

// ── Duration callout ─────────────────────────────────────────────────────────

function DurationCallout({ analyzeResult }) {
  const nw     = analyzeResult?.normalization_window;
  const minMs  = nw?.min_ms  ?? null;
  const maxMs  = nw?.max_ms  ?? null;
  const hasData = minMs != null && maxMs != null;

  return (
    <div className="relative rounded-lg overflow-hidden border border-accent/25 mb-5">
      {/* Left accent bar */}
      <div className="absolute inset-y-0 left-0 w-1 bg-accent" />

      <div className="pl-5 pr-4 py-4" style={{ background: "linear-gradient(to right, rgba(29,158,117,0.06), transparent)" }}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="5" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 5V3.5M8 5V2M12 5V3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M4 11v1.5M8 11V14M12 11v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className="text-xs font-bold text-accent uppercase tracking-widest">
            Variable-duration normalization
          </span>
        </div>

        {/* Duration range badges + bar chart */}
        {hasData ? (
          <>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex items-center gap-1.5 bg-white border border-accent/20 rounded px-2.5 py-1 shadow-sm">
                <span className="text-xs text-gray-400">min</span>
                <span className="text-sm font-bold text-accent tabular-nums">{minMs} ms</span>
              </div>
              <svg className="w-5 h-3 text-gray-300 flex-shrink-0" viewBox="0 0 20 12" fill="none">
                <path d="M1 6h18M14 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div className="flex items-center gap-1.5 bg-white border border-accent/20 rounded px-2.5 py-1 shadow-sm">
                <span className="text-xs text-gray-400">max</span>
                <span className="text-sm font-bold text-accent tabular-nums">{maxMs} ms</span>
              </div>
            </div>

            {/* Relative-length bars */}
            <div className="space-y-1.5 mb-3">
              {[["min", minMs, "bg-accent/35"], ["max", maxMs, "bg-accent"]].map(([lbl, val, cls]) => (
                <div key={lbl} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-6 flex-shrink-0">{lbl}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${cls}`}
                      style={{ width: `${(val / maxMs) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums w-14 text-right">{val} ms</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 mb-3 italic">
            Complete data collection to see event duration ranges.
          </p>
        )}

        <p className="text-xs text-gray-600 leading-relaxed">
          A fixed window would{" "}
          <span className="font-semibold text-gray-800">discard the decay tail</span>{" "}
          on longer events. EdgeForge normalizes each event{" "}
          <span className="font-semibold text-gray-800">individually</span>{" "}
          to preserve signal shape.
        </p>
      </div>
    </div>
  );
}

// ── Config panels ─────────────────────────────────────────────────────────────

function RawPanel({ config }) {
  return (
    <div className="space-y-3">
      <SectionLabel>Source signal</SectionLabel>
      {[
        ["Sensor",      config?.sensorType     || "—"],
        ["Connection",  config?.connectionType || "—"],
        ["Trigger",     config?.triggerType    || "—"],
        ["Target MCU",  config?.targetMcu      || "—"],
      ].map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-xs">
          <span className="text-gray-400">{k}</span>
          <span className="text-gray-700 font-semibold">{v}</span>
        </div>
      ))}
      <p className="text-xs text-gray-300 pt-2 border-t border-gray-100">
        No processing applied at this stage.
      </p>
    </div>
  );
}

function FilterPanel({ cfg, setCfg }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Cutoff frequency</SectionLabel>
        <Slider min={5} max={200} value={cfg.cutoff} onChange={(v) => setCfg((c) => ({ ...c, cutoff: v }))} unit=" Hz" />
      </div>
      <div>
        <SectionLabel>Filter order</SectionLabel>
        <SegmentedControl
          options={ORDER_OPTIONS}
          value={cfg.order}
          onChange={(v) => setCfg((c) => ({ ...c, order: v }))}
          fmt={(v) => `${v}`}
        />
        <p className="text-xs text-gray-400 mt-2">
          Higher order → sharper rolloff, more phase distortion.
        </p>
      </div>
    </div>
  );
}

function NormalizePanel({ cfg, setCfg, analyzeResult }) {
  return (
    <div className="space-y-6">
      <DurationCallout analyzeResult={analyzeResult} />

      <div>
        <SectionLabel>Window length</SectionLabel>
        <Slider min={100} max={3000} value={cfg.window} onChange={(v) => setCfg((c) => ({ ...c, window: v }))} unit=" ms" />
      </div>

      <div>
        <SectionLabel>Interpolation</SectionLabel>
        <SegmentedControl
          options={INTERP_OPTIONS}
          value={cfg.interpolation}
          onChange={(v) => setCfg((c) => ({ ...c, interpolation: v }))}
        />
        <p className="text-xs text-gray-400 mt-2">
          Cubic preserves curvature through inflection points. Linear is faster.
        </p>
      </div>
    </div>
  );
}

function FeaturesPanel({ features, setFeatures }) {
  const toggle = (id) => setFeatures((f) => ({ ...f, [id]: !f[id] }));
  const totalSelected = Object.values(features).filter(Boolean).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Feature extraction</SectionLabel>
        <span className="text-xs text-gray-400 tabular-nums">{totalSelected} selected</span>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 pb-1.5 border-b border-gray-100">
            Time domain
          </p>
          {TIME_FEATURES.map(({ id, label }) => (
            <Checkbox key={id} id={id} label={label} checked={features[id]} onChange={() => toggle(id)} />
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 pb-1.5 border-b border-gray-100">
            Frequency domain
          </p>
          {FREQ_FEATURES.map(({ id, label }) => (
            <Checkbox key={id} id={id} label={label} checked={features[id]} onChange={() => toggle(id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModelPanel({ model, setModel }) {
  return (
    <div>
      <SectionLabel>Classifier</SectionLabel>
      <div className="space-y-2">
        {MODELS.map(({ id, label, desc, recommended }) => (
          <label
            key={id}
            className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              model === id
                ? "border-accent/40 bg-accent/5"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span
              className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                model === id ? "border-accent" : "border-gray-300"
              }`}
            >
              {model === id && <span className="w-1.5 h-1.5 rounded-full bg-accent block" />}
            </span>
            <input type="radio" className="sr-only" value={id} checked={model === id} onChange={() => setModel(id)} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${model === id ? "text-gray-800" : "text-gray-600"}`}>
                  {label}
                </span>
                {recommended && (
                  <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-semibold">
                    recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Signal visualizations ─────────────────────────────────────────────────────

function FilterViz({ analyzeResult, cutoffHz }) {
  const canvasRef  = useRef(null);
  const sampleRate = analyzeResult?.sample_rate?.declared_hz ?? 100;
  const nyquist    = sampleRate / 2;
  const energyPct  = analyzeResult?.cutoff_frequency?.energy_threshold_pct ?? 90;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 80;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const w = W;
    const h = H;
    const cutoffX = Math.min(w, (cutoffHz / nyquist) * w);

    // Synthetic 1/f³ power spectrum
    const specY = (f) => 1 / (1 + Math.pow(f / Math.max(cutoffHz * 0.7, 1), 3));

    // Green fill (signal region)
    ctx.beginPath();
    ctx.moveTo(0, h - 4);
    for (let x = 0; x <= cutoffX; x++) {
      const y = h - 4 - specY((x / w) * nyquist) * (h - 14);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(cutoffX, h - 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(29,158,117,0.18)";
    ctx.fill();

    // Red fill (noise region)
    ctx.beginPath();
    ctx.moveTo(cutoffX, h - 4);
    for (let x = Math.ceil(cutoffX); x <= w; x++) {
      const y = h - 4 - specY((x / w) * nyquist) * (h - 14);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h - 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(239,68,68,0.12)";
    ctx.fill();

    // Spectrum line
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const y = h - 4 - specY((x / w) * nyquist) * (h - 14);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#9CA3AF";
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Cutoff dashed line
    ctx.beginPath();
    ctx.moveTo(cutoffX, 4);
    ctx.lineTo(cutoffX, h - 4);
    ctx.strokeStyle = "rgba(29,158,117,0.8)";
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // X axis
    ctx.beginPath();
    ctx.moveTo(0, h - 4);
    ctx.lineTo(w, h - 4);
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth   = 1;
    ctx.stroke();
  }, [cutoffHz, nyquist]);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-widest">Frequency Spectrum</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "80px" }} />
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>0 Hz</span>
        <span className="text-accent font-bold tabular-nums">{cutoffHz} Hz cutoff</span>
        <span>{nyquist} Hz</span>
      </div>
      <div className="flex gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: "rgba(29,158,117,0.35)" }} />
          <span className="text-accent font-semibold">{energyPct}% signal</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: "rgba(239,68,68,0.3)" }} />
          <span className="text-red-400">{100 - energyPct}% filtered</span>
        </span>
      </div>
    </div>
  );
}

function NormalizeViz({ analyzeResult, windowMs }) {
  const canvasRef = useRef(null);
  const nw    = analyzeResult?.normalization_window;
  const minMs = nw?.min_ms  ?? 100;
  const maxMs = nw?.max_ms  ?? 2000;
  const meanMs = nw?.mean_ms ?? 800;
  const recMs  = nw?.recommended_ms ?? 1000;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 80;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const w = W;
    const h = H;
    const span = maxMs * 1.15 - minMs * 0.85;
    const toX  = (ms) => ((ms - minMs * 0.85) / span) * w;

    // Synthetic log-normal histogram
    const NUM = 18;
    const mu    = Math.log(meanMs);
    const sigma = 0.3;
    const heights = [];
    let maxH = 0;
    for (let i = 0; i < NUM; i++) {
      const ms = minMs * 0.85 + (i + 0.5) * span / NUM;
      const v  = Math.exp(-Math.pow(Math.log(Math.max(ms, 1)) - mu, 2) / (2 * sigma * sigma)) / Math.max(ms, 1);
      heights.push(v);
      if (v > maxH) maxH = v;
    }
    const barW = w / NUM - 1;
    for (let i = 0; i < NUM; i++) {
      const x  = i * (barW + 1);
      const bh = (heights[i] / maxH) * (h - 14);
      const ms = minMs * 0.85 + (i + 0.5) * span / NUM;
      ctx.fillStyle = ms <= windowMs ? "rgba(29,158,117,0.55)" : "rgba(156,163,175,0.3)";
      ctx.fillRect(x, h - 10 - bh, barW, bh);
    }

    // Window line
    const wx = toX(windowMs);
    if (wx >= 0 && wx <= w) {
      ctx.beginPath();
      ctx.moveTo(wx, 4);
      ctx.lineTo(wx, h - 10);
      ctx.strokeStyle = "#1D9E75";
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // Recommended line (if different)
    const rx = toX(recMs);
    if (Math.abs(rx - wx) > 6 && rx >= 0 && rx <= w) {
      ctx.beginPath();
      ctx.moveTo(rx, 4);
      ctx.lineTo(rx, h - 10);
      ctx.strokeStyle = "#9CA3AF";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X axis
    ctx.beginPath();
    ctx.moveTo(0, h - 10);
    ctx.lineTo(w, h - 10);
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth   = 1;
    ctx.stroke();
  }, [windowMs, minMs, maxMs, meanMs, recMs]);

  const p90 = nw?.p90_ms;
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-widest">Event Durations</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "80px" }} />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{minMs} ms</span>
        <span>{maxMs} ms</span>
      </div>
      <div className="space-y-1 text-[10px]">
        {[
          ["Shortest", `${minMs} ms`],
          ["Longest",  `${maxMs} ms`],
          p90 ? ["90th pct", `${p90} ms`] : null,
          ["Your window", `${windowMs} ms`, true],
        ].filter(Boolean).map(([label, val, accent]) => (
          <div key={label} className="flex justify-between">
            <span className={accent ? "text-accent" : "text-gray-400"}>{label}</span>
            <span className={`font-semibold tabular-nums ${accent ? "text-accent" : "text-gray-600"}`}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesViz() {
  const SCORES = [
    { id: "kurtosis",      label: "Kurtosis",    score: 0.88 },
    { id: "fft_energy",    label: "FFT Energy",  score: 0.82 },
    { id: "rms",           label: "RMS",         score: 0.74 },
    { id: "peak",          label: "Peak",        score: 0.71 },
    { id: "dominant_freq", label: "Dom. Freq",   score: 0.68 },
    { id: "std_dev",       label: "Std Dev",     score: 0.65 },
    { id: "absolute_max",  label: "Abs Max",     score: 0.60 },
    { id: "mean",          label: "Mean",        score: 0.42 },
  ];
  const col = (s) => s >= 0.75 ? "#1D9E75" : s >= 0.55 ? "#F59E0B" : "#EF4444";

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-widest">Separability (heuristic)</p>
      {SCORES.map(({ id, label, score }) => (
        <div key={id} className="space-y-0.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-600">{label}</span>
            <span className="font-bold tabular-nums" style={{ color: col(score) }}>
              {Math.round(score * 100)}%
            </span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${score * 100}%`, backgroundColor: col(score) }}
            />
          </div>
        </div>
      ))}
      <p className="text-[9px] text-gray-300 pt-0.5">Based on vibration signal domain knowledge.</p>
    </div>
  );
}

// ── AI Pipeline Designer panel ────────────────────────────────────────────────

function AiDesignerPanel({ design, config, onApplyStage, onApplyAll, onDismiss, animatingBlock }) {
  const appDesc  = config?.applicationDescription ?? "";
  const shortDesc = appDesc.length > 72 ? appDesc.slice(0, 72) + "…" : appDesc;

  const ALL_FEAT_IDS = ["mean", "std_dev", "rms", "peak", "absolute_max", "fft_energy", "dominant_freq", "kurtosis"];
  const stages = [
    {
      id:       "filter",
      name:     "Filter",
      setting:  design.filter?.skip
        ? "Skip — hardware filtered"
        : `${design.filter?.cutoff_hz} Hz · order ${design.filter?.order ?? 4}`,
      reasoning: design.filter?.skip ? design.filter?.skip_reason : design.filter?.reasoning,
    },
    {
      id:       "normalize",
      name:     "Normalize",
      setting:  `${design.normalize?.window_ms} ms · ${design.normalize?.interpolation ?? "cubic"}`,
      reasoning: design.normalize?.reasoning,
    },
    {
      id:       "features",
      name:     "Features",
      setting:  [
        ...(design.features?.time_domain      ?? []),
        ...(design.features?.frequency_domain ?? []),
      ].join(", "),
      reasoning: design.features?.reasoning,
    },
    {
      id:       "model",
      name:     "Model",
      setting:  (design.model?.type ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      reasoning: design.model?.reasoning,
    },
  ];

  return (
    <div
      className="rounded-xl border border-accent/30 overflow-hidden mb-5"
      style={{ background: "linear-gradient(135deg, rgba(29,158,117,0.04) 0%, transparent 55%)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-accent/15">
        <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-gray-800 uppercase tracking-widest">AI-Designed Pipeline</span>
          {shortDesc && (
            <span className="text-xs text-gray-400 font-normal normal-case tracking-normal ml-2">· {shortDesc}</span>
          )}
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
          Configure manually →
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Overall reasoning */}
        {design.reasoning && (
          <p className="text-xs text-gray-600 leading-relaxed border-l-2 border-accent/40 pl-3 italic">
            {design.reasoning}
          </p>
        )}

        {/* Stage cards */}
        <div className="grid grid-cols-4 gap-3">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`rounded-lg border p-3 transition-all duration-200 ${
                animatingBlock === stage.id
                  ? "border-accent bg-accent/10 shadow-md shadow-accent/20"
                  : "border-gray-200 bg-white"
              }`}
            >
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{stage.name}</p>
              <p className="text-sm font-bold text-gray-800 leading-snug mb-1.5">{stage.setting}</p>
              <p className="text-[11px] text-gray-500 leading-relaxed mb-3 min-h-[2.5rem]">{stage.reasoning}</p>
              <button
                onClick={() => onApplyStage(stage.id)}
                className="w-full text-[10px] border border-accent/40 text-accent rounded px-2 py-1 hover:bg-accent/5 transition-colors font-bold tracking-wide"
              >
                Apply ↗
              </button>
            </div>
          ))}
        </div>

        {/* Apply All */}
        <button
          onClick={onApplyAll}
          className="w-full py-2.5 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-dark transition-colors tracking-wider uppercase shadow-sm shadow-accent/25"
        >
          Apply All Settings →
        </button>
      </div>
    </div>
  );
}

// ── Copilot sidebar ───────────────────────────────────────────────────────────

function RecommendationCard({ title, value, subtext, onApply, applyLabel = "Apply" }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <p className="text-xs text-gray-400 uppercase tracking-widest">{title}</p>
      <p className="text-xl font-bold text-gray-800 tabular-nums leading-none">{value}</p>
      {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
      <button
        onClick={onApply}
        className="w-full text-xs border border-accent/40 text-accent rounded px-3 py-1.5 hover:bg-accent/5 transition-colors font-semibold tracking-wide"
      >
        {applyLabel} ↗
      </button>
    </div>
  );
}

function CopilotSidebar({ analyzeResult, separabilityNote, onApplyCutoff, onApplyWindow, chatHistory, setChatHistory, projectId, onApplyAction, pipelineConfig }) {
  if (!analyzeResult) {
    return (
      <div className="h-full flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-gray-200 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          </div>
          <h3 className="text-xs uppercase tracking-widest text-gray-400">Copilot</h3>
        </div>
        <div className="flex flex-col items-center text-center px-2 py-4">
          <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center mb-3">
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Complete data collection to unlock signal-based recommendations.
          </p>
        </div>
        <div className="border-t border-gray-200 pt-4">
          <CopilotChat
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            projectId={projectId}
            onApplyAction={onApplyAction}
            screen="pipeline"
            pipelineConfig={pipelineConfig}
          />
        </div>
      </div>
    );
  }

  const cf = analyzeResult.cutoff_frequency;
  const nw = analyzeResult.normalization_window;

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <h3 className="text-xs uppercase tracking-widest text-gray-500 flex-1">Copilot</h3>
        <span className="text-xs text-gray-400 tabular-nums">{analyzeResult.event_count} events</span>
      </div>

      <div className="space-y-3">
        {/* Cutoff */}
        <RecommendationCard
          title="Cutoff frequency"
          value={`${cf.recommended_hz} Hz`}
          subtext={`90% energy · Nyquist ${analyzeResult.sample_rate.declared_hz / 2} Hz`}
          onApply={onApplyCutoff}
          applyLabel="Apply to Filter"
        />

        {/* Window */}
        <RecommendationCard
          title="Window length"
          value={`${nw.recommended_ms} ms`}
          subtext={`p90: ${nw.p90_ms} ms · mean: ${nw.mean_ms} ms`}
          onApply={onApplyWindow}
          applyLabel="Apply to Normalize"
        />

        {/* Separability */}
        {separabilityNote && (
          <div
            className={`rounded-lg border p-3 ${
              separabilityNote.ok
                ? "border-accent/25 bg-accent/5"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${separabilityNote.ok ? "text-accent" : "text-amber-700"}`}>
              Separability
            </p>
            <p className={`text-xs leading-relaxed ${separabilityNote.ok ? "text-gray-600" : "text-amber-700"}`}>
              {separabilityNote.ok ? "✓ " : "⚠ "}{separabilityNote.text}
            </p>
          </div>
        )}

        {/* Per-axis breakdown */}
        {Object.keys(cf.axis_cutoffs_hz ?? {}).length > 0 && (
          <div className="border border-gray-100 rounded-lg p-3">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Axis cutoffs</p>
            <div className="space-y-1.5">
              {Object.entries(cf.axis_cutoffs_hz).map(([axis, hz]) => {
                const colors = { ax: "#1D9E75", ay: "#3B82F6", az: "#F59E0B" };
                const labels = { ax: "a_x", ay: "a_y", az: "a_z" };
                const pct = Math.min(100, (hz / (analyzeResult.sample_rate.declared_hz / 2)) * 100);
                return (
                  <div key={axis} className="flex items-center gap-2">
                    <span className="text-xs w-7 flex-shrink-0" style={{ color: colors[axis] }}>
                      {labels[axis] ?? axis}
                    </span>
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: colors[axis] }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums w-12 text-right">{hz} Hz</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Chat */}
        <div className="border-t border-gray-200 pt-4 mt-2">
          <CopilotChat
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            projectId={projectId}
            onApplyAction={onApplyAction}
            screen="pipeline"
            pipelineConfig={pipelineConfig}
          />
        </div>
      </div>
    </div>
  );
}

// ── Pipeline chain ────────────────────────────────────────────────────────────

function ChevronArrow({ lit }) {
  return (
    <svg
      className={`w-5 h-5 flex-shrink-0 transition-colors ${lit ? "text-accent/50" : "text-gray-200"}`}
      viewBox="0 0 20 20"
      fill="none"
    >
      <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PipelineBlock({ block, isActive, isPast, onClick, isFlashing, isAnimating, isAiBadged }) {
  const ICONS = {
    raw:       <path d="M2 10c2-4 4-6 6-6s4 2 6 6-4 6-6 6-4-2-6-6z" stroke="currentColor" strokeWidth="1.3" fill="none"/>,
    filter:    <><path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>,
    normalize: <><rect x="3" y="7" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M7 7V5M10 7V3M13 7V5M7 13v2M10 13v4M13 13v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>,
    features:  <><path d="M4 6h12M4 10h8M4 14h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="15" cy="14" r="2" stroke="currentColor" strokeWidth="1.3" fill="none"/></>,
    model:     <><circle cx="10" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><circle cx="5"  cy="14" r="2"   stroke="currentColor" strokeWidth="1.3" fill="none"/><circle cx="15" cy="14" r="2"   stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M8 9l-2 3M12 9l2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>,
  };

  const highlighted = isFlashing || isAnimating;
  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all duration-200
        min-w-[90px] select-none
        ${highlighted
          ? "border-accent bg-accent/15 shadow-lg shadow-accent/30"
          : isActive
          ? "border-accent bg-accent/8 shadow-sm shadow-accent/20"
          : isPast
          ? "border-accent/30 bg-accent/3 text-gray-600 hover:border-accent/50"
          : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"}
      `}
      style={
        highlighted
          ? { backgroundColor: "rgba(29,158,117,0.12)" }
          : isActive
          ? { backgroundColor: "rgba(29,158,117,0.06)" }
          : isPast
          ? { backgroundColor: "rgba(29,158,117,0.02)" }
          : {}
      }
    >
      {/* Persistent AI badge */}
      {isAiBadged && !highlighted && (
        <span className="absolute top-1.5 right-1.5 text-[8px] font-bold bg-accent text-white px-1 py-0.5 rounded-sm leading-none tracking-wide">
          AI
        </span>
      )}
      <svg
        viewBox="0 0 20 20"
        className={`w-5 h-5 ${highlighted || isActive ? "text-accent" : isPast ? "text-accent/60" : "text-gray-300"}`}
      >
        {ICONS[block.id]}
      </svg>
      <div className="text-center">
        <p className={`text-xs font-bold tracking-wide ${highlighted || isActive ? "text-accent" : isPast ? "text-gray-600" : "text-gray-400"}`}>
          {block.label}
        </p>
        <p className={`text-xs mt-0.5 ${highlighted || isActive ? "text-accent/70" : "text-gray-300"}`}>
          {block.sublabel}
        </p>
        {/* "AI applied" text — animates in when flashing, collapses otherwise */}
        <p
          className="text-[9px] font-bold text-accent uppercase tracking-widest overflow-hidden leading-none transition-all duration-300"
          style={{
            maxHeight: isFlashing ? "12px" : "0px",
            opacity:   isFlashing ? 1 : 0,
            marginTop: isFlashing ? "4px" : "0px",
          }}
        >
          AI applied
        </p>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PipelineScreen({
  config, analyzeResult, separabilityNote,
  pipelineConfig, setPipelineConfig,
  projectId, chatHistory, setChatHistory, onApplyAction,
  pendingFlash, onFlashConsumed,
  aiPipelineDesign, setAiPipelineDesign,
  aiConfiguredBlocks, setAiConfiguredBlocks,
  onGoToSetup,
}) {
  const [activeBlock,    setActiveBlock]    = useState("filter");
  const [flashingBlock,  setFlashingBlock]  = useState(null);
  const [animatingBlock, setAnimatingBlock] = useState(null);
  const [isDesigning,    setIsDesigning]    = useState(false);
  const [designError,    setDesignError]    = useState(null);
  const [dismissed,      setDismissed]      = useState(false);

  // Consume pendingFlash from App: navigate to the block, flash it for 600ms
  useEffect(() => {
    if (!pendingFlash) return;
    setActiveBlock(pendingFlash);
    setFlashingBlock(pendingFlash);
    onFlashConsumed?.();
    const t = setTimeout(() => setFlashingBlock(null), 600);
    return () => clearTimeout(t);
  }, [pendingFlash]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive slices from lifted state
  const filterCfg = pipelineConfig.filter;
  const normCfg   = pipelineConfig.normalize;
  const features  = pipelineConfig.features;
  const model     = pipelineConfig.model;

  // Base setters (used by AI apply — do NOT clear badge)
  const setFilterCfg = (updater) =>
    setPipelineConfig((cfg) => ({ ...cfg, filter: typeof updater === "function" ? updater(cfg.filter) : updater }));
  const setNormCfg = (updater) =>
    setPipelineConfig((cfg) => ({ ...cfg, normalize: typeof updater === "function" ? updater(cfg.normalize) : updater }));
  const setFeatures = (updater) =>
    setPipelineConfig((cfg) => ({ ...cfg, features: typeof updater === "function" ? updater(cfg.features) : updater }));
  const setModel = (val) =>
    setPipelineConfig((cfg) => ({ ...cfg, model: val }));

  // Manual setters — also clear the AI badge on that block
  const setFilterCfgManual = (updater) => {
    setFilterCfg(updater);
    setAiConfiguredBlocks?.((b) => ({ ...b, filter: false }));
  };
  const setNormCfgManual = (updater) => {
    setNormCfg(updater);
    setAiConfiguredBlocks?.((b) => ({ ...b, normalize: false }));
  };
  const setFeaturesManual = (updater) => {
    setFeatures(updater);
    setAiConfiguredBlocks?.((b) => ({ ...b, features: false }));
  };
  const setModelManual = (val) => {
    setModel(val);
    setAiConfiguredBlocks?.((b) => ({ ...b, model: false }));
  };

  const activeIdx = BLOCKS.findIndex((b) => b.id === activeBlock);

  function applyRecommendedCutoff() {
    if (!analyzeResult) return;
    setFilterCfgManual((c) => ({ ...c, cutoff: Math.round(analyzeResult.cutoff_frequency.recommended_hz) }));
    setActiveBlock("filter");
  }

  function applyRecommendedWindow() {
    if (!analyzeResult) return;
    setNormCfgManual((c) => ({ ...c, window: analyzeResult.normalization_window.recommended_ms }));
    setActiveBlock("normalize");
  }

  // ── AI Pipeline Designer ─────────────────────────────────────────────────────

  async function handleDesign() {
    setIsDesigning(true);
    setDesignError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/pipeline/design`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id:              projectId ?? "demo-project",
          application_description: config?.applicationDescription ?? "",
          hardware_preprocessing:  config?.hardwarePreprocessing  ?? { type: "none" },
          signal_analysis: analyzeResult ? {
            sample_rate_hz:        analyzeResult.sample_rate?.declared_hz,
            recommended_cutoff_hz: analyzeResult.cutoff_frequency?.recommended_hz,
            recommended_window_ms: analyzeResult.normalization_window?.recommended_ms,
            event_count:           analyzeResult.event_count,
          } : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `API ${res.status}`);
      }
      const data = await res.json();
      setAiPipelineDesign?.(data);
      setDismissed(false);
    } catch (err) {
      setDesignError(err.message);
    } finally {
      setIsDesigning(false);
    }
  }

  function applyStage(stageId) {
    const d = aiPipelineDesign;
    if (!d) return;
    const ALL_IDS = ["mean", "std_dev", "rms", "peak", "absolute_max", "fft_energy", "dominant_freq", "kurtosis"];
    if (stageId === "filter") {
      if (!d.filter?.skip) {
        setFilterCfg((c) => ({ ...c, cutoff: Math.round(d.filter.cutoff_hz), order: d.filter.order ?? c.order }));
      }
      setAiConfiguredBlocks?.((b) => ({ ...b, filter: true }));
    } else if (stageId === "normalize") {
      setNormCfg((c) => ({ ...c, window: d.normalize.window_ms, interpolation: d.normalize.interpolation ?? c.interpolation }));
      setAiConfiguredBlocks?.((b) => ({ ...b, normalize: true }));
    } else if (stageId === "features") {
      const aiFeats = [...(d.features?.time_domain ?? []), ...(d.features?.frequency_domain ?? [])];
      const newF = {};
      ALL_IDS.forEach((id) => { newF[id] = aiFeats.includes(id); });
      setFeatures(newF);
      setAiConfiguredBlocks?.((b) => ({ ...b, features: true }));
    } else if (stageId === "model") {
      setModel(d.model.type);
      setAiConfiguredBlocks?.((b) => ({ ...b, model: true }));
    }
  }

  async function handleApplyAll() {
    const stages = ["filter", "normalize", "features", "model"];
    for (const stage of stages) {
      setAnimatingBlock(stage);
      setActiveBlock(stage);
      applyStage(stage);
      await new Promise((r) => setTimeout(r, 200));
    }
    setAnimatingBlock(null);
    setActiveBlock("filter");
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  const hasAppDesc = !!(config?.applicationDescription?.trim());

  // Show the designer panel when: design exists and not dismissed, OR currently loading/error
  const showDesignerPanel = !dismissed && (aiPipelineDesign || isDesigning || designError);

  function renderConfigPanel() {
    switch (activeBlock) {
      case "raw":       return <RawPanel config={config} />;
      case "filter":    return <FilterPanel cfg={filterCfg} setCfg={setFilterCfgManual} />;
      case "normalize": return <NormalizePanel cfg={normCfg} setCfg={setNormCfgManual} analyzeResult={analyzeResult} />;
      case "features":  return <FeaturesPanel features={features} setFeatures={setFeaturesManual} />;
      case "model":     return <ModelPanel model={model} setModel={setModelManual} />;
      default:          return null;
    }
  }

  function renderViz() {
    if (!analyzeResult) return null;
    if (activeBlock === "filter") {
      return <FilterViz analyzeResult={analyzeResult} cutoffHz={filterCfg.cutoff} />;
    }
    if (activeBlock === "normalize") {
      return <NormalizeViz analyzeResult={analyzeResult} windowMs={normCfg.window} />;
    }
    if (activeBlock === "features") {
      return <FeaturesViz analyzeResult={analyzeResult} />;
    }
    return null;
  }

  const viz = renderViz();

  return (
    <div className="flex flex-col gap-5 min-h-0">

      {/* ── AI Designer panel (full width, top) ─────────────────────────────── */}
      {showDesignerPanel && aiPipelineDesign && (
        <AiDesignerPanel
          design={aiPipelineDesign}
          config={config}
          onApplyStage={applyStage}
          onApplyAll={handleApplyAll}
          onDismiss={() => setDismissed(true)}
          animatingBlock={animatingBlock}
        />
      )}

      {/* Loading state */}
      {isDesigning && (
        <div className="border border-accent/25 rounded-xl px-5 py-4 flex items-center gap-3"
             style={{ background: "rgba(29,158,117,0.04)" }}>
          <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
          </div>
          <p className="text-xs text-gray-600">Analyzing your application and signal data…</p>
        </div>
      )}

      {/* Error state */}
      {designError && !isDesigning && (
        <div className="border border-red-200 bg-red-50 rounded-xl px-5 py-3 flex items-center justify-between">
          <p className="text-xs text-red-600">{designError}</p>
          <button onClick={handleDesign} className="text-xs text-red-500 underline ml-4">Retry</button>
        </div>
      )}

      {/* ── Main layout: left (chain + config) + right (sidebar) ────────────── */}
      <div className="flex gap-6 min-h-0 flex-1">

        {/* ── Left: chain + config ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">

          {/* Pipeline chain */}
          <div className="border border-gray-200 rounded-xl p-5 bg-white flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest">Pipeline</p>

              {/* Design / Redesign button */}
              {!isDesigning && (
                hasAppDesc ? (
                  <button
                    onClick={handleDesign}
                    className="flex items-center gap-1.5 text-xs font-bold text-accent border border-accent/30 px-3 py-1 rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    {aiPipelineDesign && !dismissed ? "Redesign with AI" : "Design Pipeline with AI"}
                  </button>
                ) : (
                  <button
                    onClick={onGoToSetup}
                    className="text-[10px] text-gray-400 hover:text-accent transition-colors"
                  >
                    Add application context on Setup to enable AI design →
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {BLOCKS.map((block, i) => (
                <React.Fragment key={block.id}>
                  <PipelineBlock
                    block={block}
                    isActive={activeBlock === block.id}
                    isPast={i < activeIdx}
                    onClick={() => setActiveBlock(block.id)}
                    isFlashing={flashingBlock === block.id}
                    isAnimating={animatingBlock === block.id}
                    isAiBadged={!!(aiConfiguredBlocks?.[block.id])}
                  />
                  {i < BLOCKS.length - 1 && <ChevronArrow lit={i < activeIdx} />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Config panel */}
          <div className="border border-gray-200 rounded-xl p-6 bg-white flex-1">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">
                {BLOCKS.find((b) => b.id === activeBlock)?.label}
              </h2>
              <span className="text-xs text-gray-400">
                {BLOCKS.find((b) => b.id === activeBlock)?.sublabel}
              </span>
            </div>

            {/* Two-column: controls left, viz right */}
            <div className="flex gap-6">
              <div className="flex-1 min-w-0">
                {renderConfigPanel()}
              </div>
              {viz && (
                <div className="w-48 flex-shrink-0 border-l border-gray-100 pl-5">
                  {viz}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: copilot sidebar ─────────────────────────────────────────── */}
        <div className="w-60 flex-shrink-0">
          <div className="border border-gray-200 rounded-xl p-4 bg-white h-full">
            <CopilotSidebar
              analyzeResult={analyzeResult}
              separabilityNote={separabilityNote}
              onApplyCutoff={applyRecommendedCutoff}
              onApplyWindow={applyRecommendedWindow}
              chatHistory={chatHistory}
              setChatHistory={setChatHistory}
              projectId={projectId}
              onApplyAction={onApplyAction}
              pipelineConfig={pipelineConfig}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
