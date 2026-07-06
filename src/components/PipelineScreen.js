import React, { useState } from "react";

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
          {items.map(({ label, value }, i) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span className="text-gray-400">{label}</span>
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

  const classNames = (classes || []).map((c) => c.name);

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
              <span className="text-gray-400 w-16">Window</span>
              <input type="number" value={cfg.window_ms} min={100} max={10000}
                onChange={(e) => setParam("window_ms", Number(e.target.value))}
                className="w-16 border border-gray-200 rounded px-1.5 py-1 text-[10px] font-mono outline-none focus:border-accent tabular-nums"
              />
              <span className="text-gray-400">ms</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-gray-400 w-16">Stride</span>
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
              <span className="text-gray-600">Zero-pad</span>
            </label>
          </div>
        </div>

        <Connector />

        {/* Spectral Features → navigates to Level 2 */}
        <BlockCard
          title="Spectral Features"
          subtitle="Butterworth filter + FFT power"
          items={[
            { label: "Filter", value: filterLabel },
            { label: "FFT length", value: cfg.fft_length },
            { label: "Log", value: cfg.take_log ? "On" : "Off" },
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
