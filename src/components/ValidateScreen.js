import React, { useState, useEffect, useRef, useCallback } from "react";
import API_BASE_URL from "../config";

// ── Class colour palette (first class = green, second = amber, third = red, …) ─

const PALETTE = ["#1D9E75", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#3B82F6"];
const PALETTE_BG = [
  "rgba(29,158,117,0.10)",  "rgba(245,158,11,0.10)",
  "rgba(239,68,68,0.10)",   "rgba(139,92,246,0.10)",
  "rgba(236,72,153,0.10)",  "rgba(59,130,246,0.10)",
];

function useClassColors() {
  const [map, setMap]   = useState({});       // label → index
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

// ── Signal canvas (multi-axis waveform of last event) ─────────────────────────

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

    // Grid
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

    // Compute global range for consistent scaling
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
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-300 tabular-nums flex-shrink-0 w-14">
        {entry.timestamp}
      </span>
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

export default function ValidateScreen({ projectId }) {
  const [localProjectId, setLocalProjectId] = useState(null);
  const [latest,     setLatest]     = useState(null);
  const [log,        setLog]        = useState([]);
  const [simulating, setSimulating] = useState(false);
  const [error,      setError]      = useState(null);
  const { register, color, bg } = useClassColors();

  // Auto-create demo project if projectId missing (same idempotent slug as TrainScreen)
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

  const effectiveProjectId = projectId ?? localProjectId;

  async function simulate() {
    if (!effectiveProjectId || simulating) return;
    setSimulating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/classify/simulate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ project_id: effectiveProjectId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `API ${res.status}`);
      }
      const data = await res.json();
      register(data.label);
      const entry = {
        id:         `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        label:      data.label,
        confidence: data.confidence,
        metrics:    data.metrics,
        event:      data.event,
        allProba:   data.all_proba ?? {},
        timestamp:  new Date().toLocaleTimeString(),
      };
      setLatest(entry);
      setLog((prev) => [entry, ...prev].slice(0, 10));
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  }

  // ── Summary stats ──
  const totalClassified = log.length;
  const classCount = {};
  log.forEach((e) => { classCount[e.label] = (classCount[e.label] ?? 0) + 1; });
  const mostCommon = Object.entries(classCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const avgConf    = log.length
    ? Math.round((log.reduce((s, e) => s + e.confidence, 0) / log.length) * 100)
    : null;

  const ACCENT       = "#1D9E75";
  const ACCENT_BG    = "rgba(29,158,117,0.07)";

  const canSimulate = Boolean(effectiveProjectId);

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
          {latest ? (
            <div className="space-y-4">
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

              {/* Per-class probabilities (if multiple) */}
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
              <p className="text-sm text-gray-400">Hit Simulate to classify an event</p>
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
            <span className="text-xs text-gray-500">
              {latest?.event ? `${latest.event.ax?.length ?? 0} samples` : "no event"}
            </span>
          </div>
          <EventCanvas event={latest?.event} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3 flex items-start gap-2 flex-shrink-0">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-red-600 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Simulate button */}
        <button
          onClick={simulate}
          disabled={!canSimulate || simulating}
          className={`w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all flex-shrink-0 ${
            !canSimulate
              ? "bg-gray-100 text-gray-300 cursor-not-allowed"
              : simulating
              ? "bg-accent/60 text-white cursor-wait"
              : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-[0.98]"
          }`}
        >
          {simulating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1 h-1 rounded-full bg-white/70 animate-bounce"
                    style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              Classifying…
            </span>
          ) : (
            "⚡ Simulate Event"
          )}
        </button>
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
                  Results will appear here after each simulation.
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

          {/* Class distribution mini bars */}
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
