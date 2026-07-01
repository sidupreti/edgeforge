import React, { useState, useRef, useEffect, useCallback } from "react";
import API_BASE_URL from "../config";

// ── Constants ────────────────────────────────────────────────────────────────

const FILTER_TYPES = [
  { id: "high", label: "High-pass", desc: "Removes DC offset and slow drift" },
  { id: "low",  label: "Low-pass",  desc: "Removes high-frequency noise" },
  { id: "none", label: "None",      desc: "No filtering applied" },
];

const ORDER_OPTIONS = [2, 4, 6, 8];
const FFT_OPTIONS   = [128, 256, 512, 1024];

const PALETTE = ["#1D9E75", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#3B82F6", "#06B6D4", "#84CC16"];
const AXIS_COLORS = { a_x: "#1D9E75", a_y: "#3B82F6", a_z: "#F59E0B" };
const AXIS_LABELS = { a_x: "accX", a_y: "accY", a_z: "accZ" };

// ── Shared small UI ──────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">{children}</p>;
}

function NumberInput({ label, value, onChange, min, max, step = 1, unit = "" }) {
  return (
    <div>
      <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 border border-gray-200 rounded px-2.5 py-1.5 text-xs font-mono outline-none focus:border-accent transition-colors tabular-nums"
        />
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  );
}

function AxisLegend({ axes }) {
  return (
    <div className="flex gap-3 mt-1.5">
      {(axes || ["a_x", "a_y", "a_z"]).map((ax) => (
        <span key={ax} className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: AXIS_COLORS[ax] || "#999" }} />
          {AXIS_LABELS[ax] || ax}
        </span>
      ))}
    </div>
  );
}

// ── Multi-axis Signal Canvas ─────────────────────────────────────────────────

function MultiAxisPlot({ dataPerAxis, label, axes }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataPerAxis) return;
    const entries = Object.entries(dataPerAxis);
    if (entries.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 100;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(10,10,10,0.06)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = Math.round((g / 4) * H) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Global min/max across all axes
    const allVals = entries.flatMap(([, arr]) => arr);
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const range = Math.max(maxV - minV, 1e-6);

    entries.forEach(([col, data]) => {
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * W;
        const y = H - 4 - ((v - minV) / range) * (H - 8);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = AXIS_COLORS[col] || "#999";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [dataPerAxis, axes]);

  if (!dataPerAxis || Object.keys(dataPerAxis).length === 0) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">{label}</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "100px", border: "1px solid #ebeae5" }} />
      <AxisLegend axes={axes} />
    </div>
  );
}

// ── Filter Response Canvas ───────────────────────────────────────────────────

function FilterResponsePlot({ freqs, gains }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !freqs?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 100;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(10,10,10,0.06)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = Math.round((g / 4) * H) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const minG = Math.min(...gains);
    const maxG = Math.max(...gains);
    const range = Math.max(maxG - minG, 1);

    // -3 dB line
    const y3db = H - 8 - ((-3 - minG) / range) * (H - 16);
    ctx.beginPath(); ctx.moveTo(0, y3db); ctx.lineTo(W, y3db);
    ctx.strokeStyle = "rgba(239,68,68,0.3)"; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

    ctx.beginPath();
    freqs.forEach((f, i) => {
      const x = (i / (freqs.length - 1)) * W;
      const y = H - 8 - ((gains[i] - minG) / range) * (H - 16);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#1D9E75"; ctx.lineWidth = 2; ctx.stroke();
  }, [freqs, gains]);

  if (!freqs?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">Filter Response</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "100px", border: "1px solid #ebeae5" }} />
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>0 Hz</span>
        <span className="text-red-400">-3 dB</span>
        <span>{Math.round(freqs[freqs.length - 1])} Hz</span>
      </div>
    </div>
  );
}

// ── Feature Explorer (PCA scatter) ───────────────────────────────────────────

function FeatureExplorer({ coords, labels }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !coords?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 280;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(10,10,10,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = Math.round((i / 8) * W) + 0.5;
      const y = Math.round((i / 8) * H) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c.length > 1 ? c[1] : 0);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = Math.max(xMax - xMin, 1e-6);
    const yRange = Math.max(yMax - yMin, 1e-6);
    const pad = 20;

    const uniqueLabels = [...new Set(labels)];
    const colorMap = {};
    uniqueLabels.forEach((l, i) => { colorMap[l] = PALETTE[i % PALETTE.length]; });

    coords.forEach((c, i) => {
      const px = pad + ((c[0] - xMin) / xRange) * (W - 2 * pad);
      const py = H - pad - ((c.length > 1 ? c[1] : 0) - yMin) / yRange * (H - 2 * pad);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = colorMap[labels[i]] || "#999";
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }, [coords, labels]);

  if (!coords?.length) return null;
  const uniqueLabels = [...new Set(labels)];
  const colorMap = {};
  uniqueLabels.forEach((l, i) => { colorMap[l] = PALETTE[i % PALETTE.length]; });

  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Feature Explorer</p>
      <canvas ref={canvasRef} className="w-full block rounded-lg" style={{ height: "280px", border: "1px solid #ebeae5" }} />
      <div className="flex gap-4 mt-2">
        {uniqueLabels.map((l) => (
          <span key={l} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorMap[l] }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Feature Importance bars ──────────────────────────────────────────────────

function FeatureImportance({ features }) {
  if (!features?.length) return null;
  const maxImp = Math.max(...features.map(f => f.importance));

  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Feature Importance</p>
      <div className="space-y-1.5">
        {features.map(({ name, importance }, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono w-32 truncate flex-shrink-0" title={name}>
              {name}
            </span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(importance / maxImp) * 100}%` }} />
            </div>
            <span className="text-[10px] text-gray-400 tabular-nums w-10 text-right">
              {(importance * 100).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SpectralFeaturesScreen({
  pipelineConfig,
  setPipelineConfig,
  projectId,
  onBack,
}) {
  // ── Recording / window selector state ────────────────────────────────────
  const [recordings, setRecordings] = useState([]);
  const [selectedDsId, setSelectedDsId] = useState(null);
  const [windowIndex, setWindowIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── Generate features state ──────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState(null);
  const [result, setResult]         = useState(null);

  const cfg = pipelineConfig;
  const filterCfg = cfg.filter;

  const setFilter = (update) =>
    setPipelineConfig((c) => ({ ...c, filter: { ...c.filter, ...update } }));
  const setParam = (key, val) =>
    setPipelineConfig((c) => ({ ...c, [key]: val }));

  // ── Fetch recordings on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    fetch(`${API_BASE_URL}/project-index/${projectId}`)
      .then((r) => r.ok ? r.json() : { datasets: [] })
      .then((d) => {
        const ds = d.datasets || [];
        setRecordings(ds);
        if (ds.length > 0 && !selectedDsId) {
          setSelectedDsId(ds[0].id);
        }
      })
      .catch(() => {});
  }, [projectId, selectedDsId]);

  // ── Preview window when recording or params change ───────────────────────
  const fetchPreview = useCallback(async () => {
    if (!selectedDsId) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/features/preview-window`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id:   selectedDsId,
          window_index: windowIndex,
          window_ms:    cfg.window_ms,
          stride_ms:    cfg.stride_ms,
          filter_type:  filterCfg.filterType,
          cutoff_hz:    filterCfg.cutoff,
          order:        filterCfg.order,
          fft_length:   cfg.fft_length,
          take_log:     cfg.take_log,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedDsId, windowIndex, cfg.window_ms, cfg.stride_ms,
      filterCfg.filterType, filterCfg.cutoff, filterCfg.order,
      cfg.fft_length, cfg.take_log]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  // Reset window index when recording changes
  useEffect(() => { setWindowIndex(0); }, [selectedDsId]);

  // ── Generate Features ────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id:  projectId,
          window_ms:   cfg.window_ms,
          stride_ms:   cfg.stride_ms,
          zero_pad:    cfg.zero_pad,
          filter_type: filterCfg.filterType,
          cutoff_hz:   filterCfg.cutoff,
          order:       filterCfg.order,
          fft_length:  cfg.fft_length,
          take_log:    cfg.take_log,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setResult(data);
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Group recordings by label for the dropdown ───────────────────────────
  const recordingsByLabel = {};
  recordings.forEach((r) => {
    if (!recordingsByLabel[r.label]) recordingsByLabel[r.label] = [];
    recordingsByLabel[r.label].push(r);
  });

  const selectedRec = recordings.find((r) => r.id === selectedDsId);
  const nWindows = preview?.n_windows || 1;

  return (
    <div className="flex flex-col min-h-0 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            ← Impulse
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Spectral Features</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Configure filter + FFT parameters, preview per-window DSP, then generate the feature set.
            </p>
          </div>
        </div>
      </div>

      {/* ── Top: Sample / Window selector ──────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Recording dropdown */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Recording</label>
            <select
              value={selectedDsId ?? ""}
              onChange={(e) => setSelectedDsId(Number(e.target.value))}
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accent min-w-[220px]"
            >
              {Object.entries(recordingsByLabel).map(([label, recs]) => (
                <optgroup key={label} label={label}>
                  {recs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.source_filename} ({r.n_samples} samples)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Window dropdown */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Window</label>
            <select
              value={windowIndex}
              onChange={(e) => setWindowIndex(Number(e.target.value))}
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accent min-w-[120px]"
            >
              {Array.from({ length: nWindows }, (_, i) => (
                <option key={i} value={i}>Window {i + 1}</option>
              ))}
            </select>
          </div>

          {/* Label badge + raw feature summary */}
          {selectedRec && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest">Label</span>
              <span className="text-xs font-bold text-white bg-accent px-2 py-0.5 rounded">
                {selectedRec.label}
              </span>
              {preview && (
                <span className="text-[10px] text-gray-400">
                  {preview.window_start_ms}–{preview.window_end_ms} ms
                  {preview.fs && <> · {preview.fs} Hz</>}
                </span>
              )}
            </div>
          )}

          {previewLoading && (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin ml-2" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* ── Left column: Parameters ──────────────────────────────────────── */}
        <div className="col-span-1 space-y-5">
          {/* Filter */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-widest">Filter</h3>
            <div>
              <SectionLabel>Type</SectionLabel>
              <div className="space-y-1.5">
                {FILTER_TYPES.map(({ id, label, desc }) => (
                  <label key={id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                      filterCfg.filterType === id ? "border-accent/40 bg-accent/5" : "border-gray-200 hover:border-gray-300"
                    }`}>
                    <span className={`mt-0.5 w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      filterCfg.filterType === id ? "border-accent" : "border-gray-300"
                    }`}>
                      {filterCfg.filterType === id && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </span>
                    <input type="radio" className="sr-only" value={id}
                      checked={filterCfg.filterType === id}
                      onChange={() => setFilter({ filterType: id })} />
                    <div>
                      <span className={`text-xs font-semibold ${filterCfg.filterType === id ? "text-gray-800" : "text-gray-600"}`}>{label}</span>
                      <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            {filterCfg.filterType !== "none" && (
              <>
                <NumberInput label="Cutoff frequency" value={filterCfg.cutoff}
                  onChange={(v) => setFilter({ cutoff: v })} min={0.1} max={500} step={0.1} unit="Hz" />
                <div>
                  <SectionLabel>Order</SectionLabel>
                  <div className="inline-flex border border-gray-200 rounded overflow-hidden">
                    {ORDER_OPTIONS.map((o) => (
                      <button key={o} onClick={() => setFilter({ order: o })}
                        className={`px-3 py-1.5 text-xs transition-colors ${
                          filterCfg.order === o ? "bg-accent text-white" : "text-gray-500 hover:bg-gray-50"
                        }`}>{o}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Spectral Analysis */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-widest">Spectral Analysis</h3>
            <div>
              <SectionLabel>FFT length</SectionLabel>
              <div className="inline-flex border border-gray-200 rounded overflow-hidden">
                {FFT_OPTIONS.map((n) => (
                  <button key={n} onClick={() => setParam("fft_length", n)}
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      cfg.fft_length === n ? "bg-accent text-white" : "text-gray-500 hover:bg-gray-50"
                    }`}>{n}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.take_log}
                onChange={(e) => setParam("take_log", e.target.checked)} className="accent-accent" />
              <span className="text-xs text-gray-600">Take log of spectrum</span>
            </label>
          </div>

          {/* Generate button */}
          <button onClick={handleGenerate} disabled={generating || !projectId}
            className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all ${
              generating || !projectId
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-[0.98]"
            }`}>
            {generating ? "Generating features…" : "Generate Features"}
          </button>
          {genError && <p className="text-xs text-red-500 mt-1">{genError}</p>}
        </div>

        {/* ── Right columns: DSP preview + results ─────────────────────────── */}
        <div className="col-span-2 space-y-5">
          {/* Per-window DSP preview */}
          {preview && !previewLoading && (
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                <FilterResponsePlot
                  freqs={preview.filter_response?.freqs_hz}
                  gains={preview.filter_response?.gain_db}
                />
                <MultiAxisPlot
                  dataPerAxis={preview.filtered}
                  label="After-filter Signal"
                  axes={preview.axes}
                />
              </div>
              <div className="border border-gray-200 rounded-xl p-4 space-y-4">
                <MultiAxisPlot
                  dataPerAxis={preview.raw}
                  label="Raw Signal"
                  axes={preview.axes}
                />
                <MultiAxisPlot
                  dataPerAxis={preview.spectrum}
                  label="Spectral Power (log)"
                  axes={preview.axes}
                />
              </div>
            </div>
          )}

          {/* No preview yet */}
          {!preview && !previewLoading && recordings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">
                Upload data on the <strong>Collect</strong> screen to see per-window DSP preview.
              </p>
            </div>
          )}

          {/* Loading spinner for preview */}
          {previewLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ── Generate features results ────────────────────────────────── */}
          {generating && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-500">Extracting features across all recordings…</p>
            </div>
          )}

          {result && !generating && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Sample Rate", value: `${result.fs} Hz` },
                  { label: "Train Windows", value: result.n_train_windows },
                  { label: "Test Windows", value: result.n_test_windows },
                  { label: "Features", value: result.n_features },
                ].map(({ label, value }) => (
                  <div key={label} className="border border-gray-200 rounded-lg px-3 py-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                    <p className="text-lg font-bold text-gray-800 tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* Window counts per class */}
              {result.window_counts && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Windows per Class</p>
                  <div className="space-y-2">
                    {Object.entries(result.window_counts).map(([label, counts], i) => (
                      <div key={label} className="flex items-center gap-3 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                        <span className="font-semibold text-gray-700 w-20">{label}</span>
                        <span className="text-gray-500">train: {counts.train}</span>
                        <span className="text-gray-400">test: {counts.test}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature Explorer + Importance */}
              <div className="grid grid-cols-2 gap-5">
                <div className="border border-gray-200 rounded-xl p-5">
                  <FeatureExplorer coords={result.pca?.coords} labels={result.pca?.labels} />
                </div>
                <div className="border border-gray-200 rounded-xl p-5">
                  <FeatureImportance features={result.feature_importance} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
