import React, { useRef, useEffect, useState, useCallback } from "react";
import API_BASE_URL from "../config";
import CopilotChat from "./CopilotChat";

const COPILOT_THRESHOLD = 5;    // events before first analysis
const COPILOT_DEBOUNCE  = 1500; // ms to wait after last event before calling API

// ── Constants ────────────────────────────────────────────────────────────────

const AXIS_COLORS  = { ax: "#1D9E75", ay: "#3B82F6", az: "#F59E0B" };
const AXIS_LABELS  = { ax: "a_x",     ay: "a_y",     az: "a_z"     };
const SAMPLE_RATE  = 100;   // Hz — governs timing labels
const BUFFER_SIZE  = 500;   // rolling window (frames)
const CAPTURE_WIN  = 80;    // frames captured per event ≈ 800 ms
const TARGET_COUNT = 30;    // events per class before bar fills

const CLASS_PALETTE = [
  "#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActiveAxes(sensorType = "") {
  const s = sensorType.toLowerCase();
  if (s.includes("accelerometer") || s.includes("imu")) return ["ax", "ay", "az"];
  if (s.includes("microphone") || s.includes("pdm"))    return ["ax"];
  if (s.includes("proximity")  || s.includes("tof"))    return ["ax"];
  return ["ax", "ay"];
}

// ── Mini waveform thumbnail (SVG) ─────────────────────────────────────────────

function WaveformThumb({ data, color = "#1D9E75", w = 64, h = 28 }) {
  if (!data?.length) {
    return <div style={{ width: w, height: h }} className="bg-gray-800 rounded" />;
  }
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 0.001;
  const pts   = data
    .map((v, i) => {
      const x = ((i / (data.length - 1)) * w).toFixed(1);
      const y = (h - 2 - ((v - min) / range) * (h - 4)).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      className="flex-shrink-0 rounded overflow-hidden"
      style={{ background: "#0f172a" }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── CSV parser (browser-side, for preview) ────────────────────────────────────

const UPLOAD_COL_MAP = {
  t: "timestamp", time: "timestamp", ts: "timestamp", time_us: "timestamp",
  x: "a_x", ax: "a_x", accel_x: "a_x", acc_x: "a_x",
  y: "a_y", ay: "a_y", accel_y: "a_y", acc_y: "a_y",
  z: "a_z", az: "a_z", accel_z: "a_z", acc_z: "a_z",
};

function parseCSVText(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length < 2) return null;
  const sep     = lines[0].includes("\t") ? "\t" : ",";
  const rawHdrs = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const hdrs    = rawHdrs.map((h) => UPLOAD_COL_MAP[h] ?? h);

  const tsIdx = hdrs.indexOf("timestamp");
  const axIdx = hdrs.indexOf("a_x");
  const ayIdx = hdrs.indexOf("a_y");
  const azIdx = hdrs.indexOf("a_z");
  if (axIdx === -1) return null;

  const ax = [], ay = [], az = [], ts = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map((p) => p.trim());
    const xv = parseFloat(parts[axIdx]);
    if (isNaN(xv)) continue;
    ax.push(xv);
    ay.push(ayIdx >= 0 ? (parseFloat(parts[ayIdx]) || 0) : 0);
    az.push(azIdx >= 0 ? (parseFloat(parts[azIdx]) || 0) : 0);
    ts.push(tsIdx >= 0 ? (parseFloat(parts[tsIdx]) || 10000) : 10000);
  }
  if (ax.length < 2) return null;

  // Convert absolute timestamps to diffs if needed
  const tArr = ts[0] > 1e9 ? ts.map((v, i) => (i === 0 ? ts[1] - ts[0] : ts[i] - ts[i - 1])) : ts;
  const durationMs = tArr.reduce((s, v) => s + Math.abs(v), 0) / 1000;

  return { ax, ay, az, rowCount: ax.length, durationMs: Math.round(durationMs) };
}

function detectClassFromFilename(filename, classes, fallbackClassId) {
  const lower = filename.toLowerCase().replace(/[_\-\s.]/g, " ");
  for (const cls of classes) {
    if (lower.includes(cls.name.toLowerCase())) return cls.id;
  }
  // Fall back to active class, then first class
  return fallbackClassId ?? classes[0]?.id ?? null;
}

// ── File upload mode ──────────────────────────────────────────────────────────

function FileUploadMode({
  classes, activeClassId, events, setEvents, onAnalysisReady,
  projectId, analyzeResult, separabilityNote,
  copilot, setCopilot,
}) {
  const [fileEntries,  setFileEntries]  = useState([]); // {file, name, parsed, classId, error}
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState(null);
  const [dragOver,     setDragOver]     = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((newFiles) => {
    const entries = Array.from(newFiles).map((f) => ({
      file: f, name: f.name, parsed: null,
      classId: detectClassFromFilename(f.name, classes, activeClassId),
      error: null, reading: true,
    }));

    // Read file contents async
    entries.forEach((entry) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = parseCSVText(e.target.result);
        setFileEntries((prev) => {
          const updated = [...prev];
          const realIdx = prev.findIndex((p) => p.file === entry.file);
          if (realIdx >= 0) {
            updated[realIdx] = {
              ...updated[realIdx],
              parsed:  result,
              error:   result ? null : "Could not parse — expected timestamp,a_x,a_y,a_z columns",
              reading: false,
            };
          }
          return updated;
        });
      };
      reader.readAsText(entry.file);
    });

    setFileEntries((prev) => [...prev, ...entries]);
  }, [classes, activeClassId]);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function handleDragOver(e) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave()  { setDragOver(false); }

  function removeEntry(idx) {
    setFileEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function setEntryClass(idx, classId) {
    setFileEntries((prev) => prev.map((e, i) => i === idx ? { ...e, classId } : e));
  }

  const goodEntries = fileEntries.filter((e) => e.parsed && !e.error);

  async function addToDataset() {
    if (!goodEntries.length || uploading) return;
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("project_id", projectId ?? "demo-project");
    for (const entry of goodEntries) {
      formData.append("files", entry.file);
      const cls = classes.find((c) => c.id === entry.classId);
      formData.append("labels", cls?.name ?? entry.classId);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/upload-events`, {
        method: "POST",
        body:   formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail?.message ?? body.detail ?? `Server error ${res.status}`);
      }
      const data = await res.json();

      // Add returned events into the events list
      const newEvents = data.events.map((ev) => {
        const cls   = classes.find((c) => c.name === ev.class_label) ?? classes[0];
        return {
          id:         ev.id,
          classId:    cls?.id    ?? "cls-event",
          className:  ev.class_label,
          classColor: cls?.color ?? "#1D9E75",
          waveform:   ev.waveform_az ?? [],
          waveColor:  AXIS_COLORS.az,
          duration:   ev.duration_ms,
          timestamp:  new Date().toLocaleTimeString(),
          snapshot:   { ax: [], ay: [], az: ev.waveform_az ?? [] },
          filename:   ev.filename,
        };
      });
      setEvents((prev) => [...newEvents, ...prev]);

      // Trigger analysis update
      if (data.analysis) {
        onAnalysisReady?.(data.analysis, null);
        setCopilot({ status: "ready", data: data.analysis, error: null });
      }

      // Clear processed files (keep files with errors)
      setFileEntries((prev) => prev.filter((e) => !e.parsed || e.error));
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">

      {/* ── Drop zone ──────────────────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !fileEntries.length && inputRef.current?.click()}
        className={`
          flex-shrink-0 flex flex-col items-center justify-center gap-3
          rounded-lg border-2 border-dashed cursor-pointer transition-all
          ${dragOver
            ? "border-accent bg-accent/5"
            : "border-gray-600 bg-gray-900 hover:border-gray-500"
          }
        `}
        style={{ minHeight: "140px" }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
        />
        <svg className={`w-8 h-8 ${dragOver ? "text-accent" : "text-gray-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <div className="text-center">
          <p className={`text-sm font-semibold ${dragOver ? "text-accent" : "text-gray-400"}`}>
            {dragOver ? "Drop to upload" : "Drop sensor data files here"}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">CSV or TXT — columns: timestamp, a_x, a_y, a_z</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-3 py-1 transition-colors"
          >
            Browse files
          </button>
          <a
            href="/sample-data/metal_tap.csv"
            download
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-accent hover:text-accent-dark transition-colors"
          >
            Download sample data →
          </a>
        </div>
      </div>

      {/* ── File cards ─────────────────────────────────────────────────────── */}
      {fileEntries.length > 0 && (
        <div className="flex flex-col gap-2 flex-shrink-0">
          {fileEntries.map((entry, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                entry.error ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
              }`}
            >
              {/* Waveform preview */}
              {entry.parsed ? (
                <WaveformThumb data={entry.parsed.az} color={AXIS_COLORS.az} w={64} h={28} />
              ) : entry.reading ? (
                <div className="w-16 h-7 bg-gray-100 rounded animate-pulse flex-shrink-0" />
              ) : (
                <div className="w-16 h-7 bg-red-100 rounded flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs text-red-400">!</span>
                </div>
              )}

              {/* File info — class label prominent, filename secondary */}
              <div className="flex-1 min-w-0">
                {(() => {
                  const assignedCls = classes.find((c) => c.id === entry.classId);
                  return assignedCls && !entry.error ? (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: assignedCls.color }}
                      />
                      <span className="text-xs font-bold" style={{ color: assignedCls.color }}>
                        {assignedCls.name}
                      </span>
                    </div>
                  ) : null;
                })()}
                <p className="text-xs text-gray-400 truncate">{entry.name}</p>
                {entry.error ? (
                  <p className="text-xs text-red-500 mt-0.5">{entry.error}</p>
                ) : entry.parsed ? (
                  <p className="text-[10px] text-gray-300 mt-0.5 tabular-nums">
                    {entry.parsed.rowCount} rows · {entry.parsed.durationMs} ms
                  </p>
                ) : null}
              </div>

              {/* Class dropdown */}
              {!entry.error && (
                <select
                  value={entry.classId ?? ""}
                  onChange={(e) => setEntryClass(idx, e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600
                             focus:outline-none focus:border-accent bg-white flex-shrink-0"
                  style={{ maxWidth: "88px" }}
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              )}

              {/* Remove button */}
              <button
                onClick={() => removeEntry(idx)}
                className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-base leading-none px-1"
              >
                ×
              </button>
            </div>
          ))}

          {/* Add to dataset button + error */}
          <div className="flex items-center gap-3">
            {uploadError && (
              <p className="text-xs text-red-500 flex-1">{uploadError}</p>
            )}
            <button
              onClick={addToDataset}
              disabled={!goodEntries.length || uploading}
              className={`ml-auto flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold transition-all ${
                !goodEntries.length
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                  : uploading
                  ? "bg-accent/60 text-white cursor-wait"
                  : "bg-accent text-white hover:bg-accent-dark"
              }`}
            >
              {uploading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Processing files…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 3v10M3 8l5-5 5 5" />
                  </svg>
                  Add {goodEntries.length} file{goodEntries.length !== 1 ? "s" : ""} to dataset
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Analysis banner ─────────────────────────────────────────────────── */}
      {analyzeResult && (
        <div className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-accent/25 text-xs"
             style={{ background: "rgba(29,158,117,0.05)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
          <span className="text-accent font-semibold">Signal analyzed</span>
          <span className="text-gray-500">— AI pipeline design ready on the next screen →</span>
        </div>
      )}

      {/* ── Event list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-0.5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 border border-dashed border-gray-200 rounded gap-1">
            <span className="text-gray-300 text-xs">No events yet</span>
            <span className="text-gray-200 text-xs">Upload CSV files to add events</span>
          </div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded hover:border-gray-200 group transition-colors"
            >
              <WaveformThumb data={ev.waveform} color={ev.waveColor} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ color: ev.classColor, backgroundColor: `${ev.classColor}1a` }}
                  >
                    {ev.className}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">{ev.duration} ms</span>
                </div>
                {ev.filename && (
                  <p className="text-[10px] text-gray-300 mt-0.5 truncate">{ev.filename}</p>
                )}
              </div>
              <button
                onClick={() => setEvents((prev) => prev.filter((e) => e.id !== ev.id))}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-base leading-none px-1"
                title="Delete"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CollectScreen({ config, projectId, analyzeResult, onAnalysisReady, chatHistory, setChatHistory, onApplyAction }) {
  const activeAxes   = getActiveAxes(config?.sensorType);
  const isFileUpload = (config?.connectionType ?? "").toLowerCase().includes("file");

  // Canvas
  const canvasRef = useRef(null);
  const animRef   = useRef(null);

  // Refs kept in sync with state — read inside animation loop without deps
  const isRecordingRef   = useRef(true);
  const activeClassIdRef = useRef("cls-event");
  const classesRef       = useRef(null);
  const addEventRef      = useRef(null);   // always points to latest callback

  // State
  const [isRecording,   setIsRecording]   = useState(true);
  const [events,        setEvents]        = useState([]);
  const [classes,       setClasses]       = useState([
    { id: "cls-idle",  name: "idle",  color: CLASS_PALETTE[1] },
    { id: "cls-event", name: "event", color: CLASS_PALETTE[0] },
  ]);
  const [activeClassId, setActiveClassId] = useState("cls-event");
  const [newClassName,  setNewClassName]  = useState("");
  const [showAddClass,  setShowAddClass]  = useState(false);
  const [timeSinceLast, setTimeSinceLast] = useState(null);
  const lastEventTimeRef = useRef(null);

  const [copilot, setCopilot] = useState({ status: "idle", data: null, error: null });
  const separabilityNoteRef  = useRef(null); // updated each render so async effect reads latest

  // Keep refs in sync each render
  isRecordingRef.current   = isRecording;
  activeClassIdRef.current = activeClassId;
  classesRef.current       = classes;

  // The addEvent callback — rebuilt each render but exposed via stable ref
  addEventRef.current = (snapshot, durationMs) => {
    const classId  = activeClassIdRef.current;
    const cls      = classesRef.current.find((c) => c.id === classId);
    const firstAx  = activeAxes[0] ?? "ax";
    setEvents((prev) => [
      {
        id:          `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        classId,
        className:   cls?.name  ?? classId,
        classColor:  cls?.color ?? "#1D9E75",
        waveform:    snapshot[firstAx] ?? [],
        waveColor:   AXIS_COLORS[firstAx] ?? "#1D9E75",
        duration:    durationMs,
        timestamp:   new Date().toLocaleTimeString(),
        snapshot,                                       // full per-axis arrays for API
      },
      ...prev,
    ]);
    lastEventTimeRef.current = Date.now();
    setTimeSinceLast(0);
  };

  // Tick the "time since last event" counter
  useEffect(() => {
    const iv = setInterval(() => {
      if (lastEventTimeRef.current !== null) {
        setTimeSinceLast(
          Math.floor((Date.now() - lastEventTimeRef.current) / 1000)
        );
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Copilot analysis — debounced, fires when ≥ COPILOT_THRESHOLD events ─────
  useEffect(() => {
    if (events.length < COPILOT_THRESHOLD) {
      // Drop back to idle if events were deleted below the threshold
      setCopilot((c) => (c.status !== "idle" ? { status: "idle", data: null, error: null } : c));
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setCopilot({ status: "loading", data: null, error: null });
      try {
        const payload = {
          project_id: projectId ?? undefined,
          sample_rate_hz: SAMPLE_RATE,
          events: events.map((ev) => ({
            ax:          ev.snapshot?.ax ?? [],
            ay:          ev.snapshot?.ay ?? [],
            az:          ev.snapshot?.az ?? [],
            duration_ms: ev.duration,
            class_label: ev.className,
          })),
        };
        const res = await fetch(`${API_BASE_URL}/analyze-signal`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? `API ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setCopilot({ status: "ready", data, error: null });
        onAnalysisReady?.(data, separabilityNoteRef.current);
      } catch (err) {
        if (cancelled) return;
        setCopilot({ status: "error", data: null, error: err.message });
      }
    }, COPILOT_DEBOUNCE);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isFileUpload) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set pixel resolution after layout
    const init = () => {
      canvas.width  = canvas.offsetWidth  || 700;
      canvas.height = canvas.offsetHeight || 180;
      startLoop(canvas);
    };
    const raf0 = requestAnimationFrame(init);
    return () => {
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startLoop(canvas) {
    const ctx = canvas.getContext("2d");
    const W   = canvas.width;
    const H   = canvas.height;

    // Simulation state — plain variables, not React state
    const buffers = { ax: [], ay: [], az: [] };
    let frame          = 0;
    let burstActive    = false;
    let burstStrength  = 0;
    let burstFrames    = 0;
    let nextBurstAt    = performance.now() + 2800 + Math.random() * 400; // 2.8–3.2 s, wall-clock
    let capturing      = false;
    let captureFrames  = 0;
    const capBuf       = { ax: [], ay: [], az: [] };

    // Generate one sample for a given axis
    function sample(f, axis) {
      const t = f / SAMPLE_RATE;
      let base;
      switch (axis) {
        case "ax": base =  0.35 * Math.sin(2 * Math.PI * 2.1 * t);               break;
        case "ay": base =  0.28 * Math.sin(2 * Math.PI * 3.3 * t + 1.0);         break;
        case "az": base =  0.22 * Math.sin(2 * Math.PI * 1.7 * t + 2.1) + 0.08; break;
        default:   base =  0.30 * Math.sin(2 * Math.PI * 2.0 * t);
      }
      const noise  = (Math.random() - 0.5) * 0.04;
      const bScale = axis === "ax" ? 1.0 : axis === "ay" ? 0.72 : 0.50;
      const burst  = burstActive
        ? burstStrength * bScale * (Math.random() - 0.5) * 1.8
        : 0;
      return base + noise + burst;
    }

    function tick() {
      frame++;
      const now = performance.now();

      // ── Burst lifecycle ──
      if (burstActive) {
        burstFrames--;
        burstStrength *= 0.88;
        if (burstFrames <= 0) {
          burstActive   = false;
          burstStrength = 0;
          nextBurstAt   = now + 2800 + Math.random() * 400;
        }
      } else {
        if (now >= nextBurstAt) {
          burstActive   = true;
          burstStrength = 0.80 + Math.random() * 0.55;
          burstFrames   = 18 + Math.floor(Math.random() * 14);

          if (isRecordingRef.current) {
            capturing     = true;
            captureFrames = CAPTURE_WIN;
            capBuf.ax     = [];
            capBuf.ay     = [];
            capBuf.az     = [];
          }
        }
      }

      // ── Sample all axes ──
      ["ax", "ay", "az"].forEach((axis) => {
        const v = sample(frame, axis);
        buffers[axis].push(v);
        if (buffers[axis].length > BUFFER_SIZE) buffers[axis].shift();
        if (capturing) capBuf[axis].push(v);
      });

      // ── End capture ──
      if (capturing) {
        captureFrames--;
        if (captureFrames <= 0) {
          capturing = false;
          const snapshot   = { ax: [...capBuf.ax], ay: [...capBuf.ay], az: [...capBuf.az] };
          const durationMs = Math.round((CAPTURE_WIN / SAMPLE_RATE) * 1000);
          addEventRef.current(snapshot, durationMs);
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);

      // Horizontal grid
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth   = 1;
      ctx.setLineDash([]);
      for (let g = 0; g <= 4; g++) {
        const y = Math.round((g / 4) * H) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Centre line (dashed)
      ctx.strokeStyle = "#334155";
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Capture highlight band
      if (capturing) {
        const progress = 1 - captureFrames / CAPTURE_WIN;
        const bandW    = progress * W;
        ctx.fillStyle  = "rgba(29,158,117,0.07)";
        ctx.fillRect(W - bandW, 0, bandW, H);
        // Leading edge
        ctx.strokeStyle = "rgba(29,158,117,0.35)";
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(W - bandW, 0);
        ctx.lineTo(W - bandW, H);
        ctx.stroke();
      }

      // Signals
      activeAxes.forEach((axis) => {
        const buf = buffers[axis];
        if (buf.length < 2) return;

        const color = AXIS_COLORS[axis];
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;

        if (burstActive && burstStrength > 0.35) {
          ctx.shadowColor = color;
          ctx.shadowBlur  = 5;
        }

        ctx.beginPath();
        buf.forEach((v, i) => {
          const x = (i / (BUFFER_SIZE - 1)) * W;
          const y = H / 2 - v * (H * 0.36);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // Burst flash overlay
      if (burstActive && burstStrength > 0.25) {
        ctx.fillStyle = `rgba(29,158,117,${(burstStrength * 0.055).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
  }

  // ── Class management ────────────────────────────────────────────────────────

  function addNewClass() {
    const name = newClassName.trim();
    if (!name) return;
    const id    = `cls-${Date.now()}`;
    const color = CLASS_PALETTE[classes.length % CLASS_PALETTE.length];
    const next  = [...classes, { id, name, color }];
    setClasses(next);
    setActiveClassId(id);
    setNewClassName("");
    setShowAddClass(false);
  }

  function deleteEvent(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  const activeClass  = classes.find((c) => c.id === activeClassId);
  const totalEvents  = events.length;

  // ── Separability note (derived client-side from class distribution) ──────────
  const separabilityNote = (() => {
    const withData = classes
      .map((cls) => ({ ...cls, count: events.filter((e) => e.classId === cls.id).length }))
      .filter((c) => c.count > 0);
    if (withData.length === 0) return null;
    if (withData.length === 1)
      return { ok: false, text: `Only class "${withData[0].name}" has data. Add a second class for binary classification.` };
    const counts  = withData.map((c) => c.count);
    const minC    = Math.min(...counts);
    const maxC    = Math.max(...counts);
    const ratio   = maxC / Math.max(minC, 1);
    if (ratio >= 3) {
      const poor = withData.find((c) => c.count === minC);
      const rich = withData.find((c) => c.count === maxC);
      return { ok: false, text: `Imbalanced: "${rich.name}" (${maxC}) vs "${poor.name}" (${minC}). Collect more "${poor.name}" samples.` };
    }
    return { ok: true, text: `${withData.length} classes, balanced (${withData.map((c) => `${c.name} ${c.count}`).join(" · ")}). Good for training.` };
  })();
  separabilityNoteRef.current = separabilityNote;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 h-full">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      {isFileUpload ? (
        <FileUploadMode
          classes={classes}
          activeClassId={activeClassId}
          events={events}
          setEvents={setEvents}
          onAnalysisReady={onAnalysisReady}
          projectId={projectId}
          analyzeResult={analyzeResult}
          separabilityNote={separabilityNote}
          copilot={copilot}
          setCopilot={setCopilot}
        />
      ) : (
      <div className="flex-1 flex flex-col min-h-0 gap-3">

        {/* Signal canvas card */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 flex-shrink-0 overflow-hidden">

          {/* Canvas header bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60">
            {/* Axis legend */}
            <div className="flex items-center gap-5">
              {activeAxes.map((axis) => (
                <div key={axis} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-5 h-0.5 rounded-full"
                    style={{ backgroundColor: AXIS_COLORS[axis] }}
                  />
                  <span className="text-xs" style={{ color: AXIS_COLORS[axis] }}>
                    {AXIS_LABELS[axis]}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500 tabular-nums">
                {SAMPLE_RATE} Hz
              </span>
              {/* REC badge */}
              {isRecording && (
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-400 tracking-widest">
                    REC
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            className="w-full block"
            style={{ height: "180px" }}
          />
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-5 flex-shrink-0 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">events</span>
            <span className="text-gray-200 font-bold tabular-nums">{totalEvents}</span>
          </div>
          <div className="w-px h-3 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">class</span>
            <span
              className="font-semibold"
              style={{ color: activeClass?.color ?? "#1D9E75" }}
            >
              {activeClass?.name ?? "—"}
            </span>
          </div>
          <div className="w-px h-3 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">last event</span>
            <span className="text-gray-500 tabular-nums">
              {timeSinceLast === null
                ? "—"
                : timeSinceLast === 0
                ? "just now"
                : `${timeSinceLast}s ago`}
            </span>
          </div>

          {/* Record toggle */}
          <button
            onClick={() => setIsRecording((r) => !r)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded border text-xs transition-colors ${
              isRecording
                ? "border-red-400/40 text-red-400 hover:bg-red-50"
                : "border-accent/40 text-accent hover:bg-accent/5"
            }`}
          >
            {isRecording ? "⏹ Stop" : "⏺ Record"}
          </button>
        </div>

        {/* AI pipeline design ready banner */}
        {analyzeResult && (
          <div className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-accent/25 text-xs"
               style={{ background: "rgba(29,158,117,0.05)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
            <span className="text-accent font-semibold">Signal analyzed</span>
            <span className="text-gray-500">— AI pipeline design ready on the next screen →</span>
          </div>
        )}

        {/* Event list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-0.5">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 border border-dashed border-gray-200 rounded gap-1">
              <span className="text-gray-300 text-xs">Waiting for impact bursts…</span>
              <span className="text-gray-200 text-xs">Events will appear here automatically</span>
            </div>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded hover:border-gray-200 group transition-colors"
              >
                <WaveformThumb data={ev.waveform} color={ev.waveColor} />

                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      color:           ev.classColor,
                      backgroundColor: `${ev.classColor}1a`,
                    }}
                  >
                    {ev.className}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {ev.duration} ms
                  </span>
                  <span className="text-xs text-gray-300">{ev.timestamp}</span>
                </div>

                <button
                  onClick={() => deleteEvent(ev.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-base leading-none px-1"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      )}

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-4 min-h-0 overflow-hidden">

        {/* ── Classes panel — always visible at top, natural height ─────────── */}
        <div className="flex-shrink-0 border border-gray-200 rounded-lg overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs uppercase tracking-widest text-gray-500">Classes</h3>
            <button
              onClick={() => setShowAddClass((v) => !v)}
              className="text-xs text-accent hover:text-accent-dark font-semibold transition-colors"
            >
              + Add
            </button>
          </div>

          {/* Inline add input */}
          {showAddClass && (
            <div className="px-3 py-2 border-b border-gray-100 flex gap-2">
              <input
                autoFocus
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  addNewClass();
                  if (e.key === "Escape") setShowAddClass(false);
                }}
                placeholder="class name…"
                className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1
                           focus:outline-none focus:border-accent"
              />
              <button
                onClick={addNewClass}
                className="text-xs bg-accent text-white px-2 py-1 rounded hover:bg-accent-dark"
              >
                Add
              </button>
            </div>
          )}

          {/* Class list — scrollable if many classes, capped so panel doesn't grow unbounded */}
          <div className="divide-y divide-gray-50 overflow-y-auto" style={{ maxHeight: "220px" }}>
            {classes.map((cls) => {
              const count  = events.filter((e) => e.classId === cls.id).length;
              const pct    = Math.min(100, (count / TARGET_COUNT) * 100);
              const active = cls.id === activeClassId;
              return (
                <button
                  key={cls.id}
                  onClick={() => setActiveClassId(cls.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    active ? "bg-accent/5" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cls.color }}
                      />
                      <span
                        className={`text-xs font-semibold truncate ${
                          active ? "text-gray-800" : "text-gray-500"
                        }`}
                      >
                        {cls.name}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums flex-shrink-0 ml-1">
                      {count}/{TARGET_COUNT}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: cls.color }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Copilot panel — fills remaining space, scrolls internally ─────── */}
        <div className="flex-1 min-h-0 border border-gray-200 rounded-lg overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-white">
            <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <div
                className={`w-1.5 h-1.5 rounded-full bg-accent ${
                  copilot.status === "loading" ? "animate-ping" : "animate-pulse"
                }`}
              />
            </div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 flex-1">Copilot</h3>
            {copilot.status === "ready" && (
              <span className="text-xs text-accent tabular-nums">
                {copilot.data.event_count} events
              </span>
            )}
            {copilot.status === "loading" && (
              <span className="text-xs text-gray-400">…</span>
            )}
          </div>

          {/* Body — this is the scrollable region */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 p-3 space-y-3">

            {/* ── idle ── */}
            {copilot.status === "idle" && (
              <div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Capture{" "}
                  <span className="text-gray-600 font-semibold">
                    {COPILOT_THRESHOLD - events.length} more event
                    {COPILOT_THRESHOLD - events.length !== 1 ? "s" : ""}
                  </span>{" "}
                  to unlock signal analysis.
                </p>
                {/* Mini progress bar toward threshold */}
                <div className="mt-2 w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/60 rounded-full transition-all duration-500"
                    style={{ width: `${(events.length / COPILOT_THRESHOLD) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── loading ── */}
            {copilot.status === "loading" && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-400">Analyzing {events.length} events…</span>
              </div>
            )}

            {/* ── error ── */}
            {copilot.status === "error" && (
              <div>
                <p className="text-xs text-red-500 leading-relaxed">{copilot.error}</p>
                <button
                  onClick={() => setCopilot({ status: "idle", data: null, error: null })}
                  className="mt-2 text-xs text-accent hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* ── ready ── */}
            {copilot.status === "ready" && (() => {
              const { cutoff_frequency: cf, normalization_window: nw, sample_rate: sr } = copilot.data;
              return (
                <>
                  {/* Sample rate */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Sample rate</p>
                    <p className="text-sm font-bold text-gray-800 tabular-nums">
                      {sr.measured_hz} Hz
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">declared {sr.declared_hz} Hz</p>
                  </div>

                  <div className="w-full h-px bg-gray-200" />

                  {/* Cutoff frequency */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Low-pass cutoff</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-sm font-bold text-gray-800 tabular-nums">
                        {cf.recommended_hz} Hz
                      </p>
                      <span className="text-xs text-gray-400">rec.</span>
                    </div>
                    {/* Per-axis breakdown */}
                    {Object.keys(cf.axis_cutoffs_hz).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                        {Object.entries(cf.axis_cutoffs_hz).map(([axis, hz]) => (
                          <span key={axis} className="text-xs tabular-nums" style={{ color: AXIS_COLORS[axis] ?? "#6b7280" }}>
                            {AXIS_LABELS[axis] ?? axis} {hz}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Energy bar */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${cf.energy_threshold_pct}%`,
                            backgroundColor: "#1D9E75",
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                        {cf.energy_threshold_pct}% energy
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-px bg-gray-200" />

                  {/* Normalization window */}
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Window</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-sm font-bold text-gray-800 tabular-nums">
                        {nw.recommended_ms} ms
                      </p>
                      <span className="text-xs text-gray-400">rec.</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                      mean {nw.mean_ms} · p90 {nw.p90_ms} ms
                    </p>
                  </div>

                  {/* Separability */}
                  {separabilityNote && (
                    <>
                      <div className="w-full h-px bg-gray-200" />
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Separability</p>
                        <p className={`text-xs leading-relaxed ${separabilityNote.ok ? "text-accent" : "text-amber-600"}`}>
                          {separabilityNote.ok ? "✓ " : "⚠ "}{separabilityNote.text}
                        </p>
                      </div>
                    </>
                  )}
                </>
              );
            })()}

            {/* ── Copilot chat ── */}
            <div className="border-t border-gray-200 pt-3">
              <CopilotChat
                chatHistory={chatHistory}
                setChatHistory={setChatHistory}
                projectId={projectId}
                onApplyAction={onApplyAction}
                screen="collect"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
