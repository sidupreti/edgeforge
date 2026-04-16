import React, { useRef, useEffect, useState } from "react";
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

// ── Main component ────────────────────────────────────────────────────────────

export default function CollectScreen({ config, projectId, onAnalysisReady, chatHistory, setChatHistory, onApplyAction }) {
  const activeAxes = getActiveAxes(config?.sensorType);

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

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-4 min-h-0">

        {/* Class manager */}
        <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-lg overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
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
            <div className="px-3 py-2 border-b border-gray-100 flex gap-2 flex-shrink-0">
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

          {/* Class list */}
          <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-50">
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

        {/* Copilot panel */}
        <div className="flex-shrink-0 border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-white">
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

          {/* Body */}
          <div className="bg-gray-50 p-3 space-y-3 overflow-y-auto">

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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
