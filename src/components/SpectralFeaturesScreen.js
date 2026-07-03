import React, { useState, useRef, useEffect, useCallback } from "react";
import API_BASE_URL from "../config";

// ── Constants ────────────────────────────────────────────────────────────────

const FILTER_TYPES = [
  { id: "high", label: "High-pass", desc: "Removes DC offset and slow drift" },
  { id: "low",  label: "Low-pass",  desc: "Removes high-frequency noise" },
  { id: "none", label: "None",      desc: "No filtering applied" },
];

const ORDER_OPTIONS = [2, 4, 6, 8];
const FFT_OPTIONS   = [16, 32, 64, 128, 256, 512];

const PALETTE = ["#1D9E75", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#3B82F6", "#06B6D4", "#84CC16"];
const AXIS_COLORS = { a_x: "#1D9E75", a_y: "#3B82F6", a_z: "#F59E0B" };
const AXIS_LABELS = { a_x: "accX", a_y: "accY", a_z: "accZ" };

// ── Shared helpers ───────────────────────────────────────────────────────────

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
          className="w-28 border border-gray-200 rounded px-2.5 py-1.5 text-xs font-mono outline-none focus:border-accent transition-colors tabular-nums" />
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  );
}

function AxisLegend({ axes }) {
  return (
    <div className="flex gap-3">
      {(axes || ["a_x", "a_y", "a_z"]).map((ax) => (
        <span key={ax} className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-3 h-[2px] rounded-sm" style={{ backgroundColor: AXIS_COLORS[ax] || "#999" }} />
          {AXIS_LABELS[ax] || ax}
        </span>
      ))}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    }} className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${
      copied ? "text-accent border-accent/30 bg-accent/5" : "text-gray-400 border-gray-200 hover:text-gray-600 hover:border-gray-300"
    }`}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Axis tick computation ────────────────────────────────────────────────────

function niceTicks(min, max, maxTicks = 5) {
  const range = max - min;
  if (range <= 0) return [min];
  const rough = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step;
  if (norm <= 1.5) step = mag;
  else if (norm <= 3.5) step = 2 * mag;
  else if (norm <= 7.5) step = 5 * mag;
  else step = 10 * mag;
  const ticks = [];
  const start = Math.ceil(min / step) * step;
  for (let t = start; t <= max + step * 0.01; t += step) {
    ticks.push(Math.round(t * 1e8) / 1e8);
  }
  return ticks;
}

function fmtTick(v) {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(1);
  if (Math.abs(v) >= 0.01) return v.toFixed(2);
  return v.toExponential(1);
}

// ── Chart drawing helper (shared across all chart types) ─────────────────────

function drawAxes(ctx, W, H, LM, BM, TM, RM, yMin, yMax, xMin, xMax, yLabel, xLabel, yTicks, xTicks) {
  const plotW = W - LM - RM;
  const plotH = H - TM - BM;

  // Grid + Y ticks
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "9px system-ui, sans-serif";
  for (const t of yTicks) {
    const y = TM + plotH - ((t - yMin) / Math.max(yMax - yMin, 1e-9)) * plotH;
    if (y < TM - 2 || y > H - BM + 2) continue;
    ctx.beginPath(); ctx.moveTo(LM, y); ctx.lineTo(W - RM, y);
    ctx.strokeStyle = "rgba(10,10,10,0.07)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(fmtTick(t), LM - 4, y);
  }

  // X ticks
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of xTicks) {
    const x = LM + ((t - xMin) / Math.max(xMax - xMin, 1e-9)) * plotW;
    if (x < LM - 2 || x > W - RM + 2) continue;
    ctx.beginPath(); ctx.moveTo(x, H - BM); ctx.lineTo(x, H - BM + 3);
    ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(fmtTick(t), x, H - BM + 4);
  }

  // Y axis label (rotated)
  ctx.save();
  ctx.translate(11, TM + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#9ca3af"; ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // X axis label
  ctx.fillStyle = "#9ca3af"; ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(xLabel, LM + plotW / 2, H - 10);

  return { plotW, plotH };
}

// ── Hero Raw Signal ──────────────────────────────────────────────────────────

function HeroRawSignal({ fullRaw, axes, windowStartMs, windowEndMs, durationMs }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fullRaw) return;
    const entries = Object.entries(fullRaw);
    if (entries.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const LM = 52, BM = 28, TM = 6, RM = 10;
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);

    const allVals = entries.flatMap(([, a]) => a);
    const yMin = Math.min(...allVals), yMax = Math.max(...allVals);
    const xMin = 0, xMax = durationMs;
    const yTicks = niceTicks(yMin, yMax, 5);
    const xTicks = niceTicks(xMin, xMax, 6);
    const { plotW, plotH } = drawAxes(ctx, W, H, LM, BM, TM, RM, yMin, yMax, xMin, xMax, "Acceleration (m/s\u00B2)", "Time (ms)", yTicks, xTicks);

    // Window highlight
    if (durationMs > 0) {
      const x1 = LM + (windowStartMs / durationMs) * plotW;
      const x2 = LM + (windowEndMs / durationMs) * plotW;
      ctx.fillStyle = "rgba(29,158,117,0.10)";
      ctx.fillRect(x1, TM, x2 - x1, plotH);
      ctx.strokeStyle = "rgba(29,158,117,0.4)"; ctx.lineWidth = 1.5;
      ctx.strokeRect(x1, TM, x2 - x1, plotH);
    }

    const range = Math.max(yMax - yMin, 1e-6);
    entries.forEach(([col, data]) => {
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = LM + (i / Math.max(data.length - 1, 1)) * plotW;
        const y = TM + plotH - ((v - yMin) / range) * plotH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = AXIS_COLORS[col] || "#999"; ctx.lineWidth = 1.2; ctx.stroke();
    });
  }, [fullRaw, axes, windowStartMs, windowEndMs, durationMs]);

  if (!fullRaw) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-gray-400 uppercase tracking-widest">Raw Data</p>
        <AxisLegend axes={axes} />
      </div>
      <canvas ref={canvasRef} className="w-full block rounded-lg" style={{ height: "220px", border: "1px solid #ebeae5" }} />
    </div>
  );
}

// ── Labeled Multi-axis Chart ─────────────────────────────────────────────────

function LabeledPlot({ dataPerAxis, title, yLabel, xLabel, axes, height = 180, xValues }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataPerAxis) return;
    const entries = Object.entries(dataPerAxis);
    if (entries.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const LM = 52, BM = 28, TM = 6, RM = 10;
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);

    const allVals = entries.flatMap(([, a]) => a);
    const yMin = Math.min(...allVals), yMax = Math.max(...allVals);
    const dataLen = entries[0][1].length;
    const xMin = xValues ? xValues[0] : 0;
    const xMax = xValues ? xValues[xValues.length - 1] : dataLen - 1;
    const yTicks = niceTicks(yMin, yMax, 4);
    const xTicks = niceTicks(xMin, xMax, 6);
    const { plotW, plotH } = drawAxes(ctx, W, H, LM, BM, TM, RM, yMin, yMax, xMin, xMax, yLabel, xLabel, yTicks, xTicks);

    const range = Math.max(yMax - yMin, 1e-6);
    entries.forEach(([col, data]) => {
      ctx.beginPath();
      data.forEach((v, i) => {
        const xVal = xValues ? xValues[i] : i;
        const x = LM + ((xVal - xMin) / Math.max(xMax - xMin, 1e-9)) * plotW;
        const y = TM + plotH - ((v - yMin) / range) * plotH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = AXIS_COLORS[col] || "#999"; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }, [dataPerAxis, axes, yLabel, xLabel, height, xValues]);

  if (!dataPerAxis || Object.keys(dataPerAxis).length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-400 uppercase tracking-widest">{title}</p>
        <AxisLegend axes={axes} />
      </div>
      <canvas ref={canvasRef} className="w-full block rounded-lg" style={{ height: `${height}px`, border: "1px solid #ebeae5" }} />
    </div>
  );
}

// ── Filter Response Chart ────────────────────────────────────────────────────

function FilterResponsePlot({ freqs, gains, height = 160 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !freqs?.length) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const LM = 42, BM = 28, TM = 6, RM = 10;
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);

    const yMin = Math.min(...gains), yMax = Math.max(...gains);
    const xMin = freqs[0], xMax = freqs[freqs.length - 1];
    const yTicks = niceTicks(yMin, yMax, 4);
    const xTicks = niceTicks(xMin, xMax, 6);
    const { plotW, plotH } = drawAxes(ctx, W, H, LM, BM, TM, RM, yMin, yMax, xMin, xMax, "dB", "Frequency (Hz)", yTicks, xTicks);

    // -3 dB line
    const yRange = Math.max(yMax - yMin, 1);
    const y3 = TM + plotH - ((-3 - yMin) / yRange) * plotH;
    if (y3 > TM && y3 < H - BM) {
      ctx.beginPath(); ctx.moveTo(LM, y3); ctx.lineTo(W - RM, y3);
      ctx.strokeStyle = "rgba(239,68,68,0.35)"; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(239,68,68,0.6)"; ctx.font = "8px system-ui"; ctx.textAlign = "left";
      ctx.fillText("-3 dB", LM + 4, y3 - 3);
    }

    // Gain curve
    ctx.beginPath();
    freqs.forEach((f, i) => {
      const x = LM + ((f - xMin) / Math.max(xMax - xMin, 1e-9)) * plotW;
      const y = TM + plotH - ((gains[i] - yMin) / yRange) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#1D9E75"; ctx.lineWidth = 2; ctx.stroke();
  }, [freqs, gains, height]);

  if (!freqs?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">Filter Response</p>
      <canvas ref={canvasRef} className="w-full block rounded-lg" style={{ height: `${height}px`, border: "1px solid #ebeae5" }} />
    </div>
  );
}

// ── Feature Explorer ─────────────────────────────────────────────────────────

function FeatureExplorer({ coords, labels }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !coords?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = 280;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(10,10,10,0.06)"; ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = Math.round((i / 8) * W) + 0.5, y = Math.round((i / 8) * H) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    const xs = coords.map(c => c[0]), ys = coords.map(c => c.length > 1 ? c[1] : 0);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xR = Math.max(xMax - xMin, 1e-6), yR = Math.max(yMax - yMin, 1e-6);
    const pad = 20;
    const uq = [...new Set(labels)].sort(); const cm = {};
    uq.forEach((l, i) => { cm[l] = PALETTE[i % PALETTE.length]; });
    coords.forEach((c, i) => {
      const px = pad + ((c[0] - xMin) / xR) * (W - 2 * pad);
      const py = H - pad - ((c.length > 1 ? c[1] : 0) - yMin) / yR * (H - 2 * pad);
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = cm[labels[i]] || "#999"; ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
    });
  }, [coords, labels]);

  if (!coords?.length) return null;
  const uq = [...new Set(labels)].sort(); const cm = {};
  uq.forEach((l, i) => { cm[l] = PALETTE[i % PALETTE.length]; });
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Feature Explorer</p>
      <canvas ref={canvasRef} className="w-full block rounded-lg" style={{ height: "280px", border: "1px solid #ebeae5" }} />
      <div className="flex gap-4 mt-2">
        {uq.map((l) => (
          <span key={l} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cm[l] }} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Feature Importance ───────────────────────────────────────────────────────

function FeatureImportance({ features }) {
  if (!features?.length) return null;
  const maxImp = Math.max(...features.map(f => f.importance));
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Feature Importance</p>
      <div className="space-y-1.5">
        {features.map(({ name, importance }, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono w-32 truncate flex-shrink-0" title={name}>{name}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(importance / maxImp) * 100}%` }} />
            </div>
            <span className="text-[10px] text-gray-400 tabular-nums w-10 text-right">{(importance * 100).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SpectralFeaturesScreen({ pipelineConfig, setPipelineConfig, projectId, onBack, savedResult, onResult }) {
  const [recordings, setRecordings] = useState([]);
  const [selectedDsId, setSelectedDsId] = useState(null);
  const [windowIndex, setWindowIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [result, setResult] = useState(savedResult || null);

  const cfg = pipelineConfig;
  const filterCfg = cfg.filter;
  const setFilter = (u) => setPipelineConfig((c) => ({ ...c, filter: { ...c.filter, ...u } }));
  const setParam = (k, v) => setPipelineConfig((c) => ({ ...c, [k]: v }));

  // Fetch recordings
  useEffect(() => {
    if (!projectId) return;
    fetch(`${API_BASE_URL}/project-index/${projectId}`)
      .then((r) => r.ok ? r.json() : { datasets: [] })
      .then((d) => {
        const ds = d.datasets || [];
        setRecordings(ds);
        if (ds.length > 0 && !selectedDsId) setSelectedDsId(ds[0].id);
      }).catch(() => {});
  }, [projectId, selectedDsId]);

  // Preview window
  const fetchPreview = useCallback(async () => {
    if (!selectedDsId) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/features/preview-window`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: selectedDsId, window_index: windowIndex,
          window_ms: cfg.window_ms, stride_ms: cfg.stride_ms,
          filter_type: filterCfg.filterType, cutoff_hz: filterCfg.cutoff,
          order: filterCfg.order, fft_length: cfg.fft_length, take_log: cfg.take_log,
          overlap_frames: cfg.overlap_frames, decimation: cfg.decimation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setPreview(data);
    } catch { setPreview(null); }
    finally { setPreviewLoading(false); }
  }, [selectedDsId, windowIndex, cfg.window_ms, cfg.stride_ms,
      filterCfg.filterType, filterCfg.cutoff, filterCfg.order, cfg.fft_length, cfg.take_log,
      cfg.overlap_frames, cfg.decimation]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);
  useEffect(() => { setWindowIndex(0); }, [selectedDsId]);

  // Generate features
  async function handleGenerate() {
    setGenerating(true); setGenError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId, window_ms: cfg.window_ms, stride_ms: cfg.stride_ms,
          zero_pad: cfg.zero_pad, filter_type: filterCfg.filterType,
          cutoff_hz: filterCfg.cutoff, order: filterCfg.order,
          fft_length: cfg.fft_length, take_log: cfg.take_log,
          overlap_frames: cfg.overlap_frames, decimation: cfg.decimation,
          normalize_features: cfg.normalize_features,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setResult(data);
      onResult?.(data);
    } catch (err) { setGenError(err.message); }
    finally { setGenerating(false); }
  }

  const recordingsByLabel = {};
  recordings.forEach((r) => { if (!recordingsByLabel[r.label]) recordingsByLabel[r.label] = []; recordingsByLabel[r.label].push(r); });
  const selectedRec = recordings.find((r) => r.id === selectedDsId);
  const nWindows = preview?.n_windows || 1;

  // Raw features: interleaved [x0,y0,z0,x1,y1,z1,...] (EI convention)
  const rawFeatStr = preview?.raw_interleaved
    ? preview.raw_interleaved.map((v) => v.toFixed(4)).join(", ")
    : "";
  const procFeatStr = preview?.processed_features
    ? preview.processed_features.map((v) => v.toFixed(4)).join(", ")
    : "";

  return (
    <div className="flex flex-col min-h-0 max-w-6xl mx-auto w-full">
      {/* ── 1. Header + selectors ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack}
          className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors">
          ← Go back
        </button>
        <h2 className="text-lg font-bold text-gray-800">Spectral Features</h2>
      </div>

      <div className="flex items-end gap-4 flex-wrap mb-4">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Recording</label>
          <select value={selectedDsId ?? ""} onChange={(e) => setSelectedDsId(Number(e.target.value))}
            className="border border-gray-200 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accent min-w-[240px]">
            {Object.entries(recordingsByLabel).map(([label, recs]) => (
              <optgroup key={label} label={label}>
                {recs.map((r) => (
                  <option key={r.id} value={r.id}>{r.source_filename} ({r.n_samples} samples)</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Window</label>
          <select value={windowIndex} onChange={(e) => setWindowIndex(Number(e.target.value))}
            className="border border-gray-200 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accent min-w-[120px]">
            {Array.from({ length: nWindows }, (_, i) => (
              <option key={i} value={i}>Window {i + 1}</option>
            ))}
          </select>
        </div>
        {selectedRec && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-bold text-white bg-accent px-2 py-0.5 rounded">{selectedRec.label}</span>
            {preview && <span className="text-[10px] text-gray-400 tabular-nums">{preview.window_start_ms}–{preview.window_end_ms} ms · {preview.fs} Hz</span>}
          </div>
        )}
        {previewLoading && <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
      </div>

      {/* ── 2. Hero raw signal ─────────────────────────────────────────── */}
      {preview?.full_raw && (
        <div className="mb-5">
          <HeroRawSignal fullRaw={preview.full_raw} axes={preview.axes}
            windowStartMs={preview.window_start_ms} windowEndMs={preview.window_end_ms}
            durationMs={preview.duration_ms} />
        </div>
      )}

      {/* ── 3. Raw + Processed features (copyable) ─────────────────────── */}
      {preview && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                Raw features <span className="text-gray-300 normal-case">({preview.raw_interleaved?.length || 0} values)</span>
              </p>
              <CopyButton text={rawFeatStr} />
            </div>
            <div className="max-h-16 overflow-y-auto">
              <p className="text-[9px] font-mono text-gray-500 leading-relaxed break-all">
                {rawFeatStr.slice(0, 800)}{rawFeatStr.length > 800 ? " …" : ""}
              </p>
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                Processed features <span className="text-gray-300 normal-case">({preview.processed_features?.length || 0} values)</span>
              </p>
              <CopyButton text={procFeatStr} />
            </div>
            <div className="max-h-16 overflow-y-auto">
              <p className="text-[9px] font-mono text-gray-500 leading-relaxed break-all">
                {procFeatStr.slice(0, 800)}{procFeatStr.length > 800 ? " …" : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Parameters (left) + DSP charts (right, stacked) ─────────── */}
      <div className="grid grid-cols-3 gap-5 mb-5">
        <div className="col-span-1 space-y-5">
          {/* Filter */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-widest">Filter</h3>
            <div>
              <SectionLabel>Type</SectionLabel>
              <div className="space-y-1.5">
                {FILTER_TYPES.map(({ id, label, desc }) => (
                  <label key={id} className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                    filterCfg.filterType === id ? "border-accent/40 bg-accent/5" : "border-gray-200 hover:border-gray-300"}`}>
                    <span className={`mt-0.5 w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      filterCfg.filterType === id ? "border-accent" : "border-gray-300"}`}>
                      {filterCfg.filterType === id && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </span>
                    <input type="radio" className="sr-only" value={id} checked={filterCfg.filterType === id}
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
                          filterCfg.order === o ? "bg-accent text-white" : "text-gray-500 hover:bg-gray-50"}`}>{o}</button>
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
                      cfg.fft_length === n ? "bg-accent text-white" : "text-gray-500 hover:bg-gray-50"}`}>{n}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.take_log}
                onChange={(e) => setParam("take_log", e.target.checked)} className="accent-accent" />
              <span className="text-xs text-gray-600">Take log of spectrum</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.overlap_frames}
                onChange={(e) => setParam("overlap_frames", e.target.checked)} className="accent-accent" />
              <span className="text-xs text-gray-600">Overlap frames (50%)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.normalize_features}
                onChange={(e) => setParam("normalize_features", e.target.checked)} className="accent-accent" />
              <span className="text-xs text-gray-600">Normalize features</span>
            </label>
            <NumberInput label="Input decimation" value={cfg.decimation}
              onChange={(v) => setParam("decimation", Math.max(1, v))} min={1} max={8} unit="×" />
          </div>
        </div>

        {/* DSP result charts — stacked vertically */}
        <div className="col-span-2 space-y-4">
          {preview && !previewLoading && (
            <>
              <div className="border border-gray-200 rounded-xl p-4">
                <FilterResponsePlot
                  freqs={preview.filter_response?.freqs_hz}
                  gains={preview.filter_response?.gain_db}
                  height={140}
                />
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <LabeledPlot dataPerAxis={preview.filtered} title="After-filter Signal"
                  yLabel="Value" xLabel="Sample #" axes={preview.axes} height={180} />
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <LabeledPlot dataPerAxis={preview.spectrum} title="Spectral Power"
                  yLabel="Energy" xLabel="Frequency (Hz)" axes={preview.axes} height={180}
                  xValues={preview.spectrum_freqs} />
              </div>
            </>
          )}
          {!preview && !previewLoading && recordings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-gray-400">Upload data on the <strong>Collect</strong> screen first.</p>
            </div>
          )}
          {previewLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Generate Features button ────────────────────────────────── */}
      <div className="mb-6">
        <button onClick={handleGenerate} disabled={generating || !projectId}
          className={`w-full max-w-xs mx-auto block py-3 rounded-xl text-sm font-bold tracking-wide transition-all ${
            generating || !projectId
              ? "bg-gray-100 text-gray-300 cursor-not-allowed"
              : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-[0.98]"}`}>
          {generating ? "Generating features…" : "Generate Features"}
        </button>
        {genError && <p className="text-xs text-red-500 mt-2 text-center">{genError}</p>}
      </div>

      {/* ── 6. Dataset-level results ───────────────────────────────────── */}
      {generating && (
        <div className="flex flex-col items-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500">Extracting features…</p>
        </div>
      )}
      {result && !generating && (
        <div className="space-y-5 pb-8">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Sample Rate", value: `${result.fs} Hz` },
              { label: "Train Windows", value: result.n_train_windows },
              { label: "Test Windows", value: result.n_test_windows },
              { label: "Features", value: result.n_features },
              { label: "Est. Model", value: `${result.est_model_size_kb || "?"} KB` },
            ].map(({ label, value }) => (
              <div key={label} className="border border-gray-200 rounded-lg px-3 py-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-lg font-bold text-gray-800 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
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
          <div className="grid grid-cols-2 gap-5">
            <div className="border border-gray-200 rounded-xl p-5">
              <FeatureExplorer coords={result.pca?.coords} labels={result.pca?.labels} />
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <FeatureImportance features={result.feature_importance} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
