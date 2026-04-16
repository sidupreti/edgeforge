import React, { useState } from "react";
import CopilotChat from "./CopilotChat";

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

function PipelineBlock({ block, isActive, isPast, onClick }) {
  const ICONS = {
    raw:       <path d="M2 10c2-4 4-6 6-6s4 2 6 6-4 6-6 6-4-2-6-6z" stroke="currentColor" strokeWidth="1.3" fill="none"/>,
    filter:    <><path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>,
    normalize: <><rect x="3" y="7" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M7 7V5M10 7V3M13 7V5M7 13v2M10 13v4M13 13v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>,
    features:  <><path d="M4 6h12M4 10h8M4 14h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="15" cy="14" r="2" stroke="currentColor" strokeWidth="1.3" fill="none"/></>,
    model:     <><circle cx="10" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><circle cx="5"  cy="14" r="2"   stroke="currentColor" strokeWidth="1.3" fill="none"/><circle cx="15" cy="14" r="2"   stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M8 9l-2 3M12 9l2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>,
  };

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all
        min-w-[90px] select-none
        ${isActive
          ? "border-accent bg-accent/8 shadow-sm shadow-accent/20"
          : isPast
          ? "border-accent/30 bg-accent/3 text-gray-600 hover:border-accent/50"
          : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"}
      `}
      style={isActive ? { backgroundColor: "rgba(29,158,117,0.06)" } : isPast ? { backgroundColor: "rgba(29,158,117,0.02)" } : {}}
    >
      <svg
        viewBox="0 0 20 20"
        className={`w-5 h-5 ${isActive ? "text-accent" : isPast ? "text-accent/60" : "text-gray-300"}`}
      >
        {ICONS[block.id]}
      </svg>
      <div className="text-center">
        <p className={`text-xs font-bold tracking-wide ${isActive ? "text-accent" : isPast ? "text-gray-600" : "text-gray-400"}`}>
          {block.label}
        </p>
        <p className={`text-xs mt-0.5 ${isActive ? "text-accent/70" : "text-gray-300"}`}>
          {block.sublabel}
        </p>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PipelineScreen({ config, analyzeResult, separabilityNote, pipelineConfig, setPipelineConfig, projectId, chatHistory, setChatHistory, onApplyAction }) {
  const [activeBlock, setActiveBlock] = useState("filter");

  // Derive slices and per-slice setters from lifted state
  const filterCfg  = pipelineConfig.filter;
  const normCfg    = pipelineConfig.normalize;
  const features   = pipelineConfig.features;
  const model      = pipelineConfig.model;

  const setFilterCfg = (updater) =>
    setPipelineConfig((cfg) => ({ ...cfg, filter: typeof updater === "function" ? updater(cfg.filter) : updater }));
  const setNormCfg = (updater) =>
    setPipelineConfig((cfg) => ({ ...cfg, normalize: typeof updater === "function" ? updater(cfg.normalize) : updater }));
  const setFeatures = (updater) =>
    setPipelineConfig((cfg) => ({ ...cfg, features: typeof updater === "function" ? updater(cfg.features) : updater }));
  const setModel = (val) =>
    setPipelineConfig((cfg) => ({ ...cfg, model: val }));

  const activeIdx = BLOCKS.findIndex((b) => b.id === activeBlock);

  function applyRecommendedCutoff() {
    if (!analyzeResult) return;
    setFilterCfg((c) => ({ ...c, cutoff: Math.round(analyzeResult.cutoff_frequency.recommended_hz) }));
    setActiveBlock("filter");
  }

  function applyRecommendedWindow() {
    if (!analyzeResult) return;
    setNormCfg((c) => ({ ...c, window: analyzeResult.normalization_window.recommended_ms }));
    setActiveBlock("normalize");
  }

  function renderConfigPanel() {
    switch (activeBlock) {
      case "raw":       return <RawPanel config={config} />;
      case "filter":    return <FilterPanel cfg={filterCfg} setCfg={setFilterCfg} />;
      case "normalize": return <NormalizePanel cfg={normCfg} setCfg={setNormCfg} analyzeResult={analyzeResult} />;
      case "features":  return <FeaturesPanel features={features} setFeatures={setFeatures} />;
      case "model":     return <ModelPanel model={model} setModel={setModel} />;
      default:          return null;
    }
  }

  return (
    <div className="flex gap-6 min-h-0">

      {/* ── Left: chain + config ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">

        {/* Pipeline chain */}
        <div className="border border-gray-200 rounded-xl p-5 bg-white">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-5">Pipeline</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {BLOCKS.map((block, i) => (
              <React.Fragment key={block.id}>
                <PipelineBlock
                  block={block}
                  isActive={activeBlock === block.id}
                  isPast={i < activeIdx}
                  onClick={() => setActiveBlock(block.id)}
                />
                {i < BLOCKS.length - 1 && (
                  <ChevronArrow lit={i < activeIdx} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Config panel */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white flex-1">
          {/* Panel header */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">
              {BLOCKS.find((b) => b.id === activeBlock)?.label}
            </h2>
            <span className="text-xs text-gray-400">
              {BLOCKS.find((b) => b.id === activeBlock)?.sublabel}
            </span>
          </div>

          {renderConfigPanel()}
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
  );
}
