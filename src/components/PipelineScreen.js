import React, { useState } from "react";

// ── Help tooltip ─────────────────────────────────────────────────────────────

function Help({ text }) {
  return (
    <span className="relative inline-flex items-center group ml-1 align-middle">
      <span className="w-3 h-3 rounded-full border border-gray-300 text-gray-400 text-[8px] leading-none flex items-center justify-center cursor-help select-none">?</span>
      <span
        className="pointer-events-none absolute left-1/2 bottom-full mb-1 -translate-x-1/2 w-44 bg-gray-900 text-white text-[10px] leading-snug rounded px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg normal-case tracking-normal"
        style={{ fontFamily: "'DM Mono', monospace", fontWeight: 400 }}
      >
        {text}
      </span>
    </span>
  );
}

// ── Block card component ─────────────────────────────────────────────────────

function BlockCard({ title, subtitle, items, onClick, clickLabel, color = "#0a0a0a", highlighted }) {
  return (
    <div
      className={`relative border-2 rounded-xl p-5 transition-all flex-1 min-w-[180px] ${
        highlighted ? "border-accent shadow-md shadow-accent/10" : "border-gray-200"
      } ${onClick ? "cursor-pointer hover:border-accent/40 hover:shadow-sm" : ""}`}
      onClick={onClick}
    >
      {/* Colored top bar */}
      <div className="absolute top-0 left-4 right-4 h-0.5 rounded-b" style={{ backgroundColor: color }} />

      <p className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-2 mt-1">{title}</p>
      {subtitle && (
        <p className="text-[10px] text-gray-400 mb-3">{subtitle}</p>
      )}
      {items && items.length > 0 && (
        <div className="space-y-1.5">
          {items.map(({ label, value, help }, i) => (
            <div key={i} className="flex justify-between text-[10px] items-center">
              <span className="text-gray-400 flex items-center">{label}{help && <Help text={help} />}</span>
              <span className="text-gray-700 font-semibold">{value}</span>
            </div>
          ))}
        </div>
      )}
      {clickLabel && (
        <p className="text-[10px] text-accent font-semibold mt-3 flex items-center gap-1">
          {clickLabel} →
        </p>
      )}
    </div>
  );
}

// ── Connector arrow ──────────────────────────────────────────────────────────

function Connector() {
  return (
    <div className="flex items-center justify-center flex-shrink-0 px-1">
      <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
        <path d="M0 6h20M16 2l4 4-4 4" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function PipelineScreen({
  pipelineConfig,
  setPipelineConfig,
  projectId,
  classes,
  featureResult,
  onOpenSpectral,
  onGoToTrain,
  onBack,
}) {
  const [saved, setSaved] = useState(false);
  const cfg = pipelineConfig;
  const filterCfg = cfg.filter;

  const filterLabel = filterCfg.filterType === "none"
    ? "None"
    : `${filterCfg.filterType === "high" ? "High-pass" : "Low-pass"} ${filterCfg.cutoff} Hz`;

  // Prefer classes from App state; fall back to feature result's derived labels
  const classNames = (classes || []).length > 0
    ? (classes || []).map((c) => c.name)
    : (featureResult?.class_labels || []);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Helpers for windowing config edits right on the Time series card
  const setParam = (key, val) =>
    setPipelineConfig((c) => ({ ...c, [key]: val }));

  return (
    <div className="flex flex-col min-h-0 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Create Impulse</h2>
          <p className="text-xs text-gray-400 mt-1">
            Define how your data flows through processing and learning blocks.
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
      </div>

      {/* ── Block chain ─────────────────────────────────────────────────── */}
      <div className="flex items-stretch gap-0 mb-8">
        {/* Time series data */}
        <div className="flex-1 min-w-[180px] border-2 border-gray-200 rounded-xl p-5 relative">
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-b bg-blue-400" />
          <p className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-2 mt-1">
            Time Series Data
          </p>
          <p className="text-[10px] text-gray-400 mb-3">Input channels &amp; windowing</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-gray-400 w-16">Channels</span>
              <div className="flex gap-1.5 flex-wrap">
                {(() => {
                  // Derive channel names from feature result or show placeholder
                  const names = featureResult?.feature_list
                    ? [...new Set(featureResult.feature_list.map(n => n.split("-")[0]))]
                    : [];
                  return names.length > 0
                    ? names.map((ch) => (
                        <span key={ch} className="bg-gray-100 text-gray-600 font-semibold px-1.5 py-0.5 rounded">{ch}</span>
                      ))
                    : <span className="text-gray-300 italic">generate features to detect</span>;
                })()}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-400 w-16 flex items-center">Window<Help text="Length of each analysis window (ms). Longer windows capture slower motions but yield fewer training examples. Range 100–10000." /></span>
              <input type="number" value={cfg.window_ms} min={100} max={10000}
                onChange={(e) => setParam("window_ms", Number(e.target.value))}
                className="w-16 border border-gray-200 rounded px-1.5 py-1 text-[10px] font-mono outline-none focus:border-accent tabular-nums"
              />
              <span className="text-gray-400">ms</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-400 w-16 flex items-center">Stride<Help text="How far the window advances between examples (ms). Smaller stride = more overlapping windows = more training data. Range 50–10000." /></span>
              <input type="number" value={cfg.stride_ms} min={50} max={10000}
                onChange={(e) => setParam("stride_ms", Number(e.target.value))}
                className="w-16 border border-gray-200 rounded px-1.5 py-1 text-[10px] font-mono outline-none focus:border-accent tabular-nums"
              />
              <span className="text-gray-400">ms</span>
            </div>
            <label className="flex items-center gap-2 text-[10px] cursor-pointer">
              <input type="checkbox" checked={cfg.zero_pad}
                onChange={(e) => setParam("zero_pad", e.target.checked)}
                className="accent-accent w-3 h-3" />
              <span className="text-gray-600 flex items-center">Zero-pad<Help text="Pad short recordings with zeros so every window is full-length, instead of dropping the leftover tail." /></span>
            </label>
          </div>
        </div>

        <Connector />

        {/* Spectral Features → navigates to Level 2 */}
        <BlockCard
          title="Spectral Features"
          subtitle="Butterworth filter + FFT power"
          items={[
            { label: "Filter", value: filterLabel, help: "Butterworth filter applied before the FFT. High-pass removes gravity/drift; low-pass removes high-frequency noise. Configure the cutoff inside." },
            { label: "FFT length", value: cfg.fft_length, help: "FFT points per frame. Higher = finer frequency resolution but more features (larger model)." },
            { label: "Log", value: cfg.take_log ? "On" : "Off", help: "Take the log of the power spectrum — compresses dynamic range so quiet frequencies still matter." },
          ]}
          onClick={onOpenSpectral}
          clickLabel="Configure"
          color="#1D9E75"
          highlighted
        />

        <Connector />

        {/* Classification → navigates to Train screen */}
        <BlockCard
          title="Classification"
          subtitle="Neural Network (Dense 20→10)"
          items={[
            { label: "Input", value: featureResult?.n_features ? `${featureResult.n_features} features` : "–" },
            { label: "Output", value: `${classNames.length} classes` },
          ]}
          onClick={onGoToTrain}
          clickLabel="Train"
          color="#F59E0B"
        />

        <Connector />

        {/* Output features — read-only */}
        <div className="flex-1 min-w-[180px] border-2 border-gray-200 rounded-xl p-5 relative">
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-b bg-purple-400" />
          <p className="text-xs font-bold text-gray-800 uppercase tracking-widest mb-2 mt-1">
            Output Features
          </p>
          <p className="text-[10px] text-gray-400 mb-3">Classification labels</p>
          <div className="space-y-1.5">
            {classNames.length > 0 ? (
              classNames.map((c) => (
                <span key={c} className="inline-block text-[10px] bg-gray-100 text-gray-700 font-semibold px-2 py-0.5 rounded mr-1.5 mb-1">
                  {c}
                </span>
              ))
            ) : (
              <p className="text-[10px] text-gray-300 italic">No classes defined</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Parallel anomaly-detection branch (mirrors the impulse view) ──── */}
      <div className="flex flex-col items-center mb-8 -mt-4">
        <svg width="16" height="22" viewBox="0 0 16 22" fill="none" className="mb-1">
          <path d="M8 0v15M3.5 11l4.5 4 4.5-4" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="w-full max-w-sm border-2 border-dashed border-gray-200 rounded-xl p-4 relative">
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-b" style={{ backgroundColor: "#A78BFA" }} />
          <div className="flex items-center justify-between mb-1 mt-1">
            <p className="text-xs font-bold text-gray-800 uppercase tracking-widest flex items-center">
              Anomaly Detection
              <Help text="Unsupervised K-means over the same spectral features. Flags windows that don't resemble any trained class — useful for catching novel or faulty motions." />
            </p>
            <span className="text-[8px] uppercase tracking-wider text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Optional</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-3">K-means · parallel branch from Spectral Features</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-400">Input</span>
              <span className="text-gray-700 font-semibold">Spectral features</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-400">Output</span>
              <span className="text-gray-700 font-semibold">1 (anomaly score)</span>
            </div>
          </div>
          <button
            onClick={onGoToTrain}
            className="text-[10px] text-accent font-semibold mt-3 hover:underline"
          >
            Enable on the Train step →
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
            saved
              ? "bg-accent/10 text-accent border border-accent/30"
              : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25"
          }`}
        >
          {saved ? "✓ Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
