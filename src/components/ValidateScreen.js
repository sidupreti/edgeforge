import React, { useState, useEffect, useRef, useCallback } from "react";
import API_BASE_URL from "../config";
import CopilotChat from "./CopilotChat";

// ── Class colour palette ──────────────────────────────────────────────────────

const PALETTE = ["#1D9E75", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#3B82F6"];
const PALETTE_BG = [
  "rgba(29,158,117,0.10)",  "rgba(245,158,11,0.10)",
  "rgba(239,68,68,0.10)",   "rgba(139,92,246,0.10)",
  "rgba(236,72,153,0.10)",  "rgba(59,130,246,0.10)",
];

function useClassColors() {
  const [map, setMap]   = useState({});
  const nextIdx         = useRef(0);
  const register        = useCallback((label) => {
    setMap((prev) => {
      if (label in prev) return prev;
      const idx = nextIdx.current++;
      return { ...prev, [label]: idx };
    });
  }, []);
  const color  = (label) => PALETTE[   (map[label] ?? 0) % PALETTE.length];
  const bg     = (label) => PALETTE_BG[(map[label] ?? 0) % PALETTE_BG.length];
  return { register, color, bg };
}

// ── Signal canvas ─────────────────────────────────────────────────────────────

function EventCanvas({ event }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !event?.ax?.length) return;

    canvas.width  = canvas.offsetWidth  || 600;
    canvas.height = canvas.offsetHeight || 130;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = Math.round((g / 4) * H) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = "#334155";
    ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    const axes    = [event.ax, event.ay, event.az].filter((a) => a?.length > 1);
    const axColors = ["#1D9E75", "#3B82F6", "#F59E0B"];

    const allVals = axes.flat();
    const gMin = Math.min(...allVals);
    const gMax = Math.max(...allVals);
    const range = Math.max(gMax - gMin, 0.001);

    axes.forEach((buf, ai) => {
      ctx.strokeStyle = axColors[ai];
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      buf.forEach((v, i) => {
        const x = (i / (buf.length - 1)) * W;
        const y = H - 4 - ((v - gMin) / range) * (H - 8);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }, [event]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full block rounded-b-lg"
      style={{ height: "130px", background: "#0f172a" }}
    />
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, icon }) {
  return (
    <div className="flex-1 border border-gray-200 rounded-lg px-3 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" viewBox="0 0 16 16" fill="none">
          {icon}
        </svg>
        <p className="text-xs text-gray-400 uppercase tracking-widest leading-none">{label}</p>
      </div>
      <p className="text-lg font-bold text-gray-800 tabular-nums leading-none">
        {value ?? "—"}
        {value != null && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ confidence, color }) {
  const pct = Math.round((confidence ?? 0) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 uppercase tracking-widest">Confidence</span>
        <span className="font-bold tabular-nums" style={{ color }}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Log entry ─────────────────────────────────────────────────────────────────

function LogEntry({ entry, color, bg }) {
  const pct = Math.round((entry.confidence ?? 0) * 100);
  // Trim filename to a readable length for the badge
  const fileShort = entry.filename
    ? entry.filename.replace(/\.(csv|txt)$/i, "").slice(0, 12) + (entry.filename.length > 16 ? "…" : "")
    : null;
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-300 tabular-nums flex-shrink-0 w-14">
        {entry.timestamp}
      </span>
      {entry.source === "live" && (
        <span className="flex-shrink-0 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded tracking-wide">
          LIVE
        </span>
      )}
      {entry.source === "upload" && fileShort && (
        <span className="flex-shrink-0 text-[9px] text-gray-400 bg-gray-50 border border-gray-200 px-1 py-0.5 rounded tracking-wide max-w-[60px] truncate" title={entry.filename}>
          {fileShort}
        </span>
      )}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0"
        style={{ color, backgroundColor: bg }}
      >
        {entry.label}
      </span>
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0 w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ValidateScreen({ projectId, trainResults, pipelineConfig, onGoToTrain, chatHistory, setChatHistory, onApplyAction }) {
  const [localProjectId, setLocalProjectId] = useState(null);
  const [latest,          setLatest]         = useState(null);
  const [log,             setLog]            = useState([]);
  const [uploading,       setUploading]      = useState(false);
  const [uploadProgress,  setUploadProgress] = useState(null); // "2 / 5" string
  const [error,           setError]          = useState(null);
  const [debugOpen,       setDebugOpen]       = useState(false);
  const [lastResponse,    setLastResponse]    = useState(null);
  const fileInputRef = useRef(null);

  // ── Serial state ────────────────────────────────────────────────────────────
  const [serialConnected,  setSerialConnected]  = useState(false);
  const [serialClassifying, setSerialClassifying] = useState(false);
  const [serialError,      setSerialError]      = useState(null);
  const serialPortRef   = useRef(null);
  const serialReaderRef = useRef(null);
  const serialActiveRef = useRef(false);   // controls the read loop
  const lineBufferRef   = useRef([]);      // accumulated lines for current event
  const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const { register, color, bg } = useClassColors();

  // Auto-create demo project
  useEffect(() => {
    if (projectId || localProjectId) return;
    fetch(`${API_BASE_URL}/project/create`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "demo-project", sensor_type: "Accelerometer (IMU)",
        connection_type: "File Upload", trigger_type: "Automatic",
        trigger_config: {}, target_mcu: "Arduino Nano 33 BLE",
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.project_id) setLocalProjectId(d.project_id); })
      .catch(() => {});
  }, [projectId, localProjectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { serialActiveRef.current = false; };
  }, []);

  const effectiveProjectId = projectId ?? localProjectId;

  // ── Classify a parsed event (used by both live and could be reused) ─────────

  const classifyEvent = useCallback(async ({ ax, ay, az, duration_ms, source, filename }) => {
    if (!effectiveProjectId) return;
    try {
      const reqBody = {
        project_id: effectiveProjectId,
        event: { ax, ay, az, duration_ms, class_label: "" },
      };

      // Debug logging — visible in browser devtools console
      console.log("[classify] request →", {
        project_id:       effectiveProjectId,
        source,
        filename:         filename ?? null,
        samples:          ax.length,
        duration_ms,
        pipeline_used_by_backend: "(see _saved_pipeline on Railway — /classify ignores frontend config)",
        pipelineConfig_in_state:  pipelineConfig ?? "(not passed)",
      });

      const res = await fetch(`${API_BASE_URL}/classify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `API ${res.status}`);
      }
      const data = await res.json();
      console.log("[classify] response ←", {
        label:      data.label,
        confidence: (data.confidence * 100).toFixed(1) + "%",
        all_proba:  data.all_proba,
        metrics:    data.metrics,
      });
      setLastResponse({ label: data.label, confidence: data.confidence, all_proba: data.all_proba });
      register(data.label);
      const entry = {
        id:         `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        label:      data.label,
        confidence: data.confidence,
        metrics:    data.metrics,
        event:      { ax, ay, az },
        allProba:   data.all_proba ?? {},
        timestamp:  new Date().toLocaleTimeString(),
        source,
        filename,
      };
      setLatest(entry);
      setLog((prev) => [entry, ...prev].slice(0, 20));
      setError(null);
    } catch (err) {
      console.error("[classify] error:", err.message);
      setError(err.message);
    }
  }, [effectiveProjectId, register, pipelineConfig]);

  // ── Flush the line buffer as a complete event ────────────────────────────────

  const flushSerialEvent = useCallback(async () => {
    const lines = lineBufferRef.current;
    lineBufferRef.current = [];
    if (lines.length < 2) return;

    const rows = [];
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 2) continue;
      const nums = parts.map(Number);
      if (nums.some(isNaN)) continue;
      if (parts.length >= 4) {
        rows.push({ ts: nums[0], ax: nums[1], ay: nums[2], az: nums[3] });
      } else if (parts.length === 2) {
        rows.push({ ts: nums[0], ax: nums[1], ay: 0, az: 0 });
      } else if (parts.length === 3) {
        rows.push({ ts: nums[0], ax: nums[1], ay: nums[2], az: 0 });
      }
    }
    if (rows.length < 2) return;

    const ax = rows.map((r) => r.ax);
    const ay = rows.map((r) => r.ay);
    const az = rows.map((r) => r.az);
    const duration_ms = (rows[rows.length - 1].ts - rows[0].ts) / 1000;

    setSerialClassifying(true);
    await classifyEvent({ ax, ay, az, duration_ms: Math.max(duration_ms, 1), source: "live" });
    setSerialClassifying(false);
  }, [classifyEvent]);

  // ── Serial read loop ─────────────────────────────────────────────────────────

  async function runSerialLoop(port) {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable).catch(() => {});
    const reader = textDecoder.readable.getReader();
    serialReaderRef.current = reader;

    let partial = "";
    try {
      while (serialActiveRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        partial += value;
        const parts = partial.split("\n");
        partial = parts.pop();             // last fragment (may be incomplete)

        for (const rawLine of parts) {
          const line = rawLine.trim().replace(/\r$/, "");
          if (!line) continue;

          if (line === "---") {
            await flushSerialEvent();
          } else {
            lineBufferRef.current.push(line);
          }
        }
      }
    } catch {
      // Port closed or disconnected
    } finally {
      reader.releaseLock();
    }
  }

  // ── Connect / Disconnect ─────────────────────────────────────────────────────

  async function connectDevice() {
    if (!serialSupported) {
      setSerialError("Web Serial is not supported in this browser. Use Chrome or Edge.");
      return;
    }
    setSerialError(null);
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current   = port;
      serialActiveRef.current = true;
      lineBufferRef.current   = [];
      setSerialConnected(true);
      runSerialLoop(port).then(() => {
        // Loop exited — port closed
        setSerialConnected(false);
        serialActiveRef.current = false;
      });
    } catch (err) {
      if (err.name !== "NotFoundError") {
        setSerialError(err.message);
      }
    }
  }

  async function disconnectDevice() {
    serialActiveRef.current = false;
    try {
      serialReaderRef.current?.cancel();
    } catch {}
    try {
      await serialPortRef.current?.close();
    } catch {}
    serialPortRef.current   = null;
    serialReaderRef.current = null;
    lineBufferRef.current   = [];
    setSerialConnected(false);
    setSerialClassifying(false);
  }

  // ── Parse a CSV file into ax/ay/az arrays ────────────────────────────────────

  function parseCsv(text) {
    const lines = text
      .split("\n")
      .map((l) => l.trim().replace(/\r$/, ""))
      .filter(Boolean);
    if (lines.length < 2) return null;

    // Skip header row if first column is non-numeric
    const firstParts = lines[0].split(",");
    const hasHeader  = isNaN(parseFloat(firstParts[0]));
    const dataLines  = hasHeader ? lines.slice(1) : lines;
    if (dataLines.length < 2) return null;

    const rows = [];
    for (const line of dataLines) {
      const parts = line.split(",");
      const nums  = parts.map(Number);
      if (nums.some(isNaN)) continue;
      if (parts.length >= 4) {
        rows.push({ ts: nums[0], ax: nums[1], ay: nums[2], az: nums[3] });
      } else if (parts.length === 3) {
        rows.push({ ts: nums[0], ax: nums[1], ay: nums[2], az: 0 });
      } else if (parts.length === 2) {
        rows.push({ ts: nums[0], ax: nums[1], ay: 0, az: 0 });
      }
    }
    if (rows.length < 2) return null;

    const ax = rows.map((r) => r.ax);
    const ay = rows.map((r) => r.ay);
    const az = rows.map((r) => r.az);
    const duration_ms = Math.max((rows[rows.length - 1].ts - rows[0].ts) / 1000, 1);
    return { ax, ay, az, duration_ms };
  }

  // ── Upload test data ──────────────────────────────────────────────────────────

  async function uploadTestFiles(files) {
    if (!effectiveProjectId || uploading || !files?.length) return;
    setUploading(true);
    setError(null);
    setUploadProgress(null);

    const fileList = Array.from(files);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgress(`${i + 1} / ${fileList.length}`);

      // Read file text
      const text = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = ()  => resolve(null);
        reader.readAsText(file);
      });

      if (!text) {
        setError(`Could not read ${file.name}`);
        continue;
      }

      const parsed = parseCsv(text);
      if (!parsed) {
        setError(`Could not parse ${file.name} — expected timestamp,ax,ay,az`);
        continue;
      }

      const { ax, ay, az, duration_ms } = parsed;
      try {
        await classifyEvent({ ax, ay, az, duration_ms, source: "upload", filename: file.name });
      } catch (err) {
        setError(`${file.name}: ${err.message}`);
      }
    }

    setUploading(false);
    setUploadProgress(null);
  }

  // ── Summary stats ─────────────────────────────────────────────────────────────

  const totalClassified = log.length;
  const classCount = {};
  log.forEach((e) => { classCount[e.label] = (classCount[e.label] ?? 0) + 1; });
  const mostCommon = Object.entries(classCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const avgConf    = log.length
    ? Math.round((log.reduce((s, e) => s + e.confidence, 0) / log.length) * 100)
    : null;

  const ACCENT    = "#1D9E75";
  const ACCENT_BG = "rgba(29,158,117,0.07)";

  // ── No trained model gate ────────────────────────────────────────────────────
  if (!trainResults) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">No trained model found</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Complete data collection and training first before validating your model.
            </p>
          </div>
          <button
            onClick={onGoToTrain}
            className="px-5 py-2.5 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-dark transition-colors tracking-wide shadow-md shadow-accent/25"
          >
            Go to Training →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-full min-h-0">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 min-w-0">

        {/* Classification result hero */}
        <div
          className="border rounded-xl p-6 transition-all duration-500 flex-shrink-0"
          style={{
            borderColor: latest ? "rgba(29,158,117,0.30)" : "#e5e7eb",
            backgroundColor: latest ? ACCENT_BG : "transparent",
          }}
        >
          {/* LIVE indicator banner */}
          {serialConnected && (
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-accent/15">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                  LIVE — Serial Connected
                </span>
                {serialClassifying && (
                  <span className="flex gap-1 ml-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1 h-1 rounded-full bg-emerald-400 animate-bounce"
                        style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </span>
                )}
              </div>
              <button
                onClick={disconnectDevice}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}

          {latest ? (
            <div className="space-y-4">
              {/* Source tag */}
              {latest.source === "live" && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE GESTURE
                </span>
              )}
              {latest.source === "upload" && latest.filename && (
                <span className="text-[9px] font-semibold text-gray-400 tracking-wide truncate max-w-xs">
                  📎 {latest.filename}
                </span>
              )}

              {/* Label */}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Prediction</p>
                <p
                  className="text-5xl font-bold leading-none tracking-tight transition-all duration-300"
                  style={{ color: ACCENT }}
                >
                  {latest.label}
                </p>
              </div>

              {/* Confidence */}
              <ConfidenceBar confidence={latest.confidence} color={ACCENT} />

              {/* Per-class probabilities */}
              {Object.keys(latest.allProba).length > 1 && (
                <div className="space-y-1.5">
                  {Object.entries(latest.allProba)
                    .sort((a, b) => b[1] - a[1])
                    .map(([lbl, prob]) => (
                      <div key={lbl} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-gray-500 truncate">{lbl}</span>
                        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round(prob * 100)}%`,
                              backgroundColor: color(lbl),
                            }}
                          />
                        </div>
                        <span className="w-8 text-right tabular-nums text-gray-400">
                          {Math.round(prob * 100)}%
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 gap-2">
              <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">
                {serialConnected
                  ? "Waiting for gesture… (send --- separator after each event)"
                  : "Upload CSV files or connect a device to classify events"}
              </p>
            </div>
          )}
        </div>

        {/* Metric cards */}
        <div className="flex gap-3 flex-shrink-0">
          <MetricCard
            label="Peak Accel"
            value={latest?.metrics?.peak_acceleration != null
              ? latest.metrics.peak_acceleration.toFixed(3)
              : null}
            unit="g"
            icon={<path d="M8 2v12M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>}
          />
          <MetricCard
            label="Duration"
            value={latest?.metrics?.event_duration_ms != null
              ? Math.round(latest.metrics.event_duration_ms)
              : null}
            unit="ms"
            icon={<><rect x="1" y="5" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5V3M8 5V2M12 5V3M4 11v2M8 11v3M12 11v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></>}
          />
          <MetricCard
            label="Dom. Freq"
            value={latest?.metrics?.dominant_freq_hz != null
              ? latest.metrics.dominant_freq_hz.toFixed(1)
              : null}
            unit="Hz"
            icon={<path d="M1 8s2-5 4-5 3 8 5 8 3-5 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>}
          />
        </div>

        {/* Signal canvas */}
        <div className="border border-gray-700 rounded-xl overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700/60">
            <div className="flex items-center gap-4">
              {[["a_x", "#1D9E75"], ["a_y", "#3B82F6"], ["a_z", "#F59E0B"]].map(([lbl, c]) => (
                <div key={lbl} className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-0.5 rounded-full" style={{ backgroundColor: c }} />
                  <span className="text-xs" style={{ color: c }}>{lbl}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {serialConnected && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              )}
              <span className="text-xs text-gray-500">
                {latest?.event ? `${latest.event.ax?.length ?? 0} samples` : "no event"}
              </span>
            </div>
          </div>
          <EventCanvas event={latest?.event} />
        </div>

        {/* Error banners */}
        {(error || serialError) && (
          <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3 flex items-start gap-2 flex-shrink-0">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-red-600 leading-relaxed">{error ?? serialError}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 flex-shrink-0">
          {/* Connect Device */}
          {serialConnected ? (
            <button
              onClick={disconnectDevice}
              className="flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all border-2 border-emerald-400 text-emerald-600 hover:bg-emerald-50 flex items-center justify-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              LIVE — Disconnect
            </button>
          ) : (
            <button
              onClick={connectDevice}
              disabled={!serialSupported}
              title={serialSupported ? "Connect ESP32 via USB serial" : "Web Serial requires Chrome or Edge"}
              className={`flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all border-2 flex items-center justify-center gap-2 ${
                serialSupported
                  ? "border-gray-300 text-gray-600 hover:border-accent hover:text-accent hover:bg-accent/5"
                  : "border-gray-200 text-gray-300 cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              Connect Device
            </button>
          )}

          {/* Upload Test Data */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadTestFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all flex items-center justify-center gap-2 ${
              uploading
                ? "bg-accent/60 text-white cursor-wait"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-[0.98]"
            }`}
          >
            {uploading ? (
              <>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1 h-1 rounded-full bg-white/70 animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
                {uploadProgress ? `Classifying ${uploadProgress}…` : "Classifying…"}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Test Data
              </>
            )}
          </button>
        </div>

        {/* Hints */}
        <div className="flex items-center justify-between -mt-2 flex-shrink-0">
          <p className="text-[10px] text-gray-400">
            CSV format: <code className="text-accent text-[10px]">timestamp_us,ax,ay,az</code>
          </p>
          {!serialSupported && (
            <p className="text-[10px] text-gray-400">
              Live serial requires Chrome or Edge
            </p>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-4 min-h-0">

        {/* Classification log */}
        <div className="flex-1 flex flex-col border border-gray-200 rounded-xl overflow-hidden min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-xs uppercase tracking-widest text-gray-500">Log</h3>
            {log.length > 0 && (
              <span className="text-xs text-gray-300 tabular-nums">{log.length}</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-1">
            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-8">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-200" />
                <p className="text-xs text-gray-300 leading-relaxed">
                  Results appear here after each file or live gesture is classified.
                </p>
              </div>
            ) : (
              log.map((entry) => (
                <LogEntry
                  key={entry.id}
                  entry={entry}
                  color={color(entry.label)}
                  bg={bg(entry.label)}
                />
              ))
            )}
          </div>
        </div>

        {/* Copilot chat */}
        <div className="border border-gray-200 rounded-xl p-4 flex-shrink-0">
          <CopilotChat
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            projectId={effectiveProjectId}
            onApplyAction={onApplyAction}
            screen="validate"
          />
        </div>

        {/* Debug panel */}
        <div className="border border-gray-200 rounded-xl flex-shrink-0 overflow-hidden">
          <button
            onClick={() => setDebugOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
          >
            <span className="text-xs text-gray-400 uppercase tracking-widest">Debug</span>
            <svg
              className="w-3 h-3 text-gray-400 transition-transform"
              style={{ transform: debugOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none" viewBox="0 0 16 16" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 6l4 4 4-4" />
            </svg>
          </button>

          {debugOpen && (
            <div className="px-4 pb-3 space-y-2 border-t border-gray-100">
              {[
                ["project_id",   effectiveProjectId ?? "—"],
                ["cutoff_hz",    pipelineConfig?.filter?.cutoff ?? "—"],
                ["filter_order", pipelineConfig?.filter?.order  ?? "—"],
                ["window_ms",    pipelineConfig?.normalize?.window ?? "—"],
                ["interpolation",pipelineConfig?.normalize?.interpolation ?? "—"],
                ["model",        pipelineConfig?.model ?? "—"],
                ["best_model",   trainResults?.best_model_id ?? "—"],
                ["features",     Object.entries(pipelineConfig?.features ?? {})
                                  .filter(([, v]) => v)
                                  .map(([k]) => k)
                                  .join(", ") || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <span className="text-gray-400 flex-shrink-0 w-24 font-mono">{k}</span>
                  <span className="text-gray-600 font-mono break-all">{String(v)}</span>
                </div>
              ))}

              {lastResponse && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">Last response</p>
                  <div className="flex gap-2 text-xs">
                    <span className="text-gray-400 font-mono w-24">label</span>
                    <span className="text-accent font-mono font-bold">{lastResponse.label}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-gray-400 font-mono w-24">confidence</span>
                    <span className="text-gray-600 font-mono">{(lastResponse.confidence * 100).toFixed(1)}%</span>
                  </div>
                  {lastResponse.all_proba && (
                    <div className="space-y-0.5 mt-1">
                      {Object.entries(lastResponse.all_proba)
                        .sort((a, b) => b[1] - a[1])
                        .map(([lbl, p]) => (
                          <div key={lbl} className="flex gap-2 text-xs">
                            <span className="text-gray-400 font-mono w-24 truncate">{lbl}</span>
                            <span className="text-gray-600 font-mono">{(p * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="border border-gray-200 rounded-xl p-4 flex-shrink-0 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Summary</p>

          {[
            { label: "Total classified", value: totalClassified || "—" },
            { label: "Most common",      value: mostCommon },
            { label: "Avg confidence",   value: avgConf != null ? `${avgConf}%` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{label}</span>
              <span className="font-semibold text-gray-700 tabular-nums">{value}</span>
            </div>
          ))}

          {Object.keys(classCount).length > 1 && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              {Object.entries(classCount)
                .sort((a, b) => b[1] - a[1])
                .map(([lbl, cnt]) => (
                  <div key={lbl} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16 truncate">{lbl}</span>
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(cnt / totalClassified) * 100}%`,
                          backgroundColor: color(lbl),
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums w-4 text-right">{cnt}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
