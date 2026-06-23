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
    return <div style={{ width: w, height: h }} className="bg-gray-100 rounded" />;
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
      style={{ background: "#f8f7f3", border: "1px solid #ebeae5" }}
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

// ── CSV parser (browser-side, for preview waveform only) ─────────────────────

const UPLOAD_COL_MAP = {
  t: "timestamp", time: "timestamp", ts: "timestamp", time_us: "timestamp",
  timestamp_us: "timestamp",   // native SensorFlow format
  time_ms: "timestamp", time_s: "timestamp", sample_time: "timestamp", elapsed: "timestamp",
  x: "a_x", ax: "a_x", accel_x: "a_x", acc_x: "a_x", "x-axis": "a_x",
  y: "a_y", ay: "a_y", accel_y: "a_y", acc_y: "a_y", "y-axis": "a_y",
  z: "a_z", az: "a_z", accel_z: "a_z", acc_z: "a_z", "z-axis": "a_z",
  activity: "activity", user: "user",
};

const WISDM_ACTIVITY_MAP = {
  A: "Walking", B: "Jogging", C: "Stairs",
  D: "Sitting", E: "Standing", F: "LyingDown",
};

function parseCSVText(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length < 2) return null;

  // Detect separator
  const first = lines[0];
  const sep = first.includes("\t") ? "\t"
    : first.includes(";")          ? ";"
    : ",";

  const splitLine = (l) => l.split(sep).map((p) => p.trim().replace(/;$/, ""));

  // Detect if first row is all-numeric (headerless)
  const firstVals = splitLine(first);
  const firstIsNumeric = firstVals.every((v) => v === "" || !isNaN(parseFloat(v)));
  const nCols = firstVals.length;

  let rawHdrs, dataStart;
  if (firstIsNumeric) {
    // UCI HAR: space-separated, >20 columns — not compatible
    if (sep === "," && nCols > 20 && firstVals.filter(Boolean).every((v) => !isNaN(v))) {
      return { error: "pre-processed feature file" };
    }
    // Headerless: synthesize column names
    if (nCols >= 4)      rawHdrs = ["timestamp", "a_x", "a_y", "a_z", ...Array.from({length: nCols - 4}, (_, i) => `col${i}`)];
    else if (nCols === 3) rawHdrs = ["a_x", "a_y", "a_z"];
    else if (nCols === 2) rawHdrs = ["a_x", "a_y"];
    else                  rawHdrs = ["a_x"];
    dataStart = 0;
  } else {
    rawHdrs   = firstVals.map((h) => h.toLowerCase());
    dataStart = 1;
  }

  const hdrs = rawHdrs.map((h) => UPLOAD_COL_MAP[h] ?? h);
  const tsIdx  = hdrs.indexOf("timestamp");
  const axIdx  = hdrs.indexOf("a_x");
  const ayIdx  = hdrs.indexOf("a_y");
  const azIdx  = hdrs.indexOf("a_z");
  const actIdx = hdrs.indexOf("activity");
  if (axIdx === -1) return null;

  const ax = [], ay = [], az = [], ts = [];
  let detectedLabel = null;
  for (let i = dataStart; i < lines.length; i++) {
    const parts = splitLine(lines[i]);
    const xv = parseFloat(parts[axIdx]);
    if (isNaN(xv)) continue;
    ax.push(xv);
    ay.push(ayIdx >= 0 ? (parseFloat(parts[ayIdx]) || 0) : 0);
    az.push(azIdx >= 0 ? (parseFloat(parts[azIdx]) || 0) : 0);
    ts.push(tsIdx >= 0 ? (parseFloat(parts[tsIdx]) || 10000) : 10000);
    if (actIdx >= 0 && !detectedLabel) {
      const raw = (parts[actIdx] ?? "").replace(/;$/, "").trim();
      detectedLabel = WISDM_ACTIVITY_MAP[raw] ?? (raw || null);
    }
  }
  if (ax.length < 2) return null;

  // Convert absolute timestamps → consecutive diffs.
  // ts[0] > 1e9  → Unix-epoch µs (original check, kept)
  // ts[2] > ts[1]*1.5 → relative-from-0 absolute µs, e.g. [0,40000,80000,…]
  //   (ts[0] is often 0, replaced by 10000 fallback, so we compare ts[2] vs ts[1]
  //    which are unaffected: for absolute, ts[2] ≈ 2*ts[1]; for deltas, ts[2] ≈ ts[1])
  const isAbsolute = ts[0] > 1e9 || (ts.length >= 3 && ts[2] > ts[1] * 1.5);
  const tArr = isAbsolute
    ? ts.slice(1).map((v, i) => v - ts[i])
    : ts;
  const durationMs = tArr.reduce((s, v) => s + Math.abs(v), 0) / 1000;

  // Per-file sample rate via median consecutive delta (µs) → Hz.
  // Median is robust to the one corrupted first diff caused by ts[0]=0→10000 fallback.
  const validDeltas = tArr.filter((d) => d > 0 && d < 2_000_000);
  let sampleRateHz = null;
  if (validDeltas.length >= 2) {
    const sorted = [...validDeltas].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianDelta = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    if (medianDelta > 0) sampleRateHz = Math.round((1_000_000 / medianDelta) * 10) / 10;
  }

  return { ax, ay, az, rowCount: ax.length, durationMs: Math.round(durationMs), detectedLabel, sampleRateHz };
}

function detectClassFromFilename(filename, classes, fallbackClassId) {
  // Normalize: strip extension, lowercase, collapse all non-alphanumeric to spaces
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const fnWords = norm(filename.replace(/\.[^.]+$/, "")).split(" ").filter(Boolean);
  for (const cls of classes) {
    const clsWords = norm(cls.name).split(" ").filter(Boolean);
    if (clsWords.length > 0 && clsWords.every((cw) => fnWords.includes(cw))) {
      return { classId: cls.id, detected: true };
    }
  }
  return { classId: fallbackClassId ?? classes[0]?.id ?? null, detected: false };
}

// ── Stat helpers ─────────────────────────────────────────────────────────────

function computeAxisStats(arr) {
  if (!arr?.length) return null;
  const n    = arr.length;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const std  = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { mean, std, min: Math.min(...arr), max: Math.max(...arr) };
}

// ── Signal plot (3-axis, larger) ─────────────────────────────────────────────

function SignalPlotRow({ data, color, label, height = 36 }) {
  if (!data?.length) return null;
  const VW = 400; const VH = height;
  const mn = Math.min(...data); const mx = Math.max(...data);
  const range = (mx - mn) || 0.001;
  const pts = data
    .map((v, i) => {
      const x = ((i / (data.length - 1)) * VW).toFixed(1);
      const y = (VH - 1 - ((v - mn) / range) * (VH - 2)).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color, width: 14, flexShrink: 0, textAlign: "right" }}>
        {label}
      </span>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ flex: 1, height: VH, display: "block", background: "#f8f7f3", border: "1px solid #ebeae5", borderRadius: 4 }}
        preserveAspectRatio="none"
      >
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

// ── File detail overlay ───────────────────────────────────────────────────────

function FileDetailPanel({ ev, allEvents, onClose, onAskCopilot }) {
  const snap  = ev.snapshot ?? {};
  const axes  = ["ax", "ay", "az"].filter((k) => snap[k]?.length > 0);
  const stats = {};
  for (const axis of axes) stats[axis] = computeAxisStats(snap[axis]);

  // Quality flags
  const flags = [];
  for (const axis of axes) {
    const s = stats[axis];
    if (!s) continue;
    if (s.std < 0.005)              flags.push(`${axis}: flatline (std = ${s.std.toFixed(5)})`);
    if (s.max > 15 || s.min < -15)  flags.push(`${axis}: possible clipping (range ${s.min.toFixed(2)} → ${s.max.toFixed(2)})`);
  }
  const allRates    = [...new Set(allEvents.map((e) => e.sampleRateHz).filter(Boolean))];
  const otherRates  = allRates.filter((r) => r !== ev.sampleRateHz);
  if (ev.sampleRateHz && otherRates.length > 0) {
    flags.push(`Sample rate ${ev.sampleRateHz} Hz differs from other files (${otherRates.join(", ")} Hz)`);
  }

  const copilotMsg = [
    `Analyze signal "${ev.filename ?? "unknown"}"`,
    ev.sampleRateHz ? `${ev.sampleRateHz} Hz` : null,
    `${ev.duration} ms`,
    `${snap.ax?.length ?? 0} samples`,
    axes.map((a) => `${a}: mean=${stats[a]?.mean.toFixed(3)}, std=${stats[a]?.std.toFixed(3)}, min=${stats[a]?.min.toFixed(3)}, max=${stats[a]?.max.toFixed(3)}`).join("; "),
    flags.length ? `Flags: ${flags.join("; ")}` : null,
    "Any data quality concerns?",
  ].filter(Boolean).join(" · ");

  const FMT = (v) => v?.toFixed(3) ?? "—";

  return (
    <div style={{
      position: "absolute", inset: 0, background: "#ffffff", zIndex: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
      border: "1px solid #ebeae5", borderRadius: 8,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid #ebeae5", flexShrink: 0 }}>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "#b0afa8", fontSize: 16, lineHeight: 1, flexShrink: 0 }}
          title="Back to list"
        >←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#0a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ev.filename ?? "Signal"}
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", marginTop: 1 }}>
            {[ev.sampleRateHz ? `${ev.sampleRateHz} Hz` : null, `${ev.duration} ms`, snap.ax?.length ? `${snap.ax.length} samples` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 20,
          background: `${ev.classColor}1a`, color: ev.classColor,
          fontFamily: "'DM Mono', monospace", flexShrink: 0,
        }}>
          {ev.className}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {/* Signal plots */}
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Signal</p>
        <div style={{ marginBottom: 14 }}>
          {axes.map((axis) => (
            <SignalPlotRow
              key={axis}
              data={snap[axis]}
              color={AXIS_COLORS[axis]}
              label={AXIS_LABELS[axis]}
              height={36}
            />
          ))}
        </div>

        {/* Per-axis stats */}
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Per-axis stats</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              {["", "mean", "std", "min", "max"].map((h) => (
                <th key={h} style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", textAlign: h === "" ? "left" : "right", padding: "2px 4px", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axes.map((axis) => {
              const s = stats[axis];
              if (!s) return null;
              return (
                <tr key={axis} style={{ borderTop: "1px solid #f0efe9" }}>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: AXIS_COLORS[axis], padding: "3px 4px", fontWeight: 600 }}>{axis}</td>
                  {[s.mean, s.std, s.min, s.max].map((v, i) => (
                    <td key={i} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#3a3935", textAlign: "right", padding: "3px 4px" }}>{FMT(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Flags */}
        {flags.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Flags</p>
            {flags.map((msg, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4, padding: "5px 8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6 }}>
                <span style={{ fontSize: 11, flexShrink: 0 }}>⚠</span>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#92400e", lineHeight: 1.45 }}>{msg}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ask Copilot */}
        {onAskCopilot && (
          <button
            onClick={() => onAskCopilot(copilotMsg)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "9px 12px", background: "#0a0a0a", color: "#ffffff",
              border: "none", borderRadius: 6, cursor: "pointer",
              fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 600,
            }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ width: 12, height: 12, flexShrink: 0 }}>
              <circle cx="8" cy="8" r="6.5" /><path d="M8 5.5v3M8 10.5h.01" />
            </svg>
            Ask Copilot about this signal
          </button>
        )}
      </div>
    </div>
  );
}

// ── Format guide (collapsible) ───────────────────────────────────────────────

function FormatGuide() {
  const [open, setOpen] = useState(false);
  const formats = [
    { label: "SensorFlow native",  cols: "timestamp, a_x, a_y, a_z",         note: "timestamp in µs between samples" },
    { label: "WISDM",             cols: "user, activity, timestamp, x, y, z", note: "activity column auto-used as class" },
    { label: "Generic XYZ",       cols: "any cols with time + x/y/z axes",   note: "column names auto-detected" },
    { label: "Headerless",        cols: "numeric rows, no header",            note: "assumes 100 Hz, columns: ts, x, y, z" },
  ];
  return (
    <div className="flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 8 8" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 1.5l3 2.5-3 2.5" />
        </svg>
        Supported formats
      </button>
      {open && (
        <div className="mt-2 border border-gray-700 rounded-lg overflow-hidden bg-gray-900">
          {formats.map((f) => (
            <div key={f.label} className="flex gap-3 px-3 py-2 border-b border-gray-800 last:border-0">
              <span className="text-[10px] font-semibold text-gray-400 w-28 flex-shrink-0">{f.label}</span>
              <div className="min-w-0">
                <code className="text-[10px] text-accent">{f.cols}</code>
                <p className="text-[10px] text-gray-600 mt-0.5">{f.note}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── File upload mode ──────────────────────────────────────────────────────────

function FileUploadMode({
  classes, setClasses, activeClassId, events, setEvents, onAnalysisReady,
  projectId, analyzeResult, separabilityNote,
  copilot, setCopilot, setDetectedSampleRate, onAskCopilot,
}) {
  // fileEntries: {file, name, parsed, classId, detected, error, note, reading}
  const [fileEntries,    setFileEntries]    = useState([]);
  const [uploading,      setUploading]      = useState(false);
  const [uploadError,    setUploadError]    = useState(null);
  const [uploadSuccess,  setUploadSuccess]  = useState(null);
  const [dragOver,       setDragOver]       = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const inputRef = useRef(null);

  // Read a CSV file and update its entry in state
  function readCsvEntry(file, targetFile = null) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseCSVText(e.target.result);
      setFileEntries((prev) => {
        const updated = [...prev];
        const realIdx = prev.findIndex((p) => p.file === (targetFile ?? file));
        if (realIdx >= 0) {
          const parsed = result?.error ? null : result;
          let note = null;
          if (result?.error === "pre-processed feature file") {
            note = "Pre-processed feature file — SensorFlow needs raw sensor time series data";
          }
          // Auto-assign detected class label if available (WISDM activity column)
          let classId  = updated[realIdx].classId;
          let detected = updated[realIdx].detected;
          if (result?.detectedLabel) {
            const match = classes.find((c) => c.name.toLowerCase() === result.detectedLabel.toLowerCase());
            if (match) { classId = match.id; detected = true; }
          }
          updated[realIdx] = {
            ...updated[realIdx],
            parsed,
            note,
            classId,
            detected,
            error:   parsed ? null : (note ?? "Could not parse — expected timestamp, a_x, a_y, a_z columns"),
            reading: false,
          };
        }
        return updated;
      });
    };
    reader.readAsText(file);
  }

  const addFiles = useCallback((newFiles) => {
    const newEntries = [];
    const csvToRead  = [];

    for (const f of Array.from(newFiles)) {
      // Skip zip files — per-class upload (right panel) handles multi-file ingestion
      if (f.name.toLowerCase().endsWith(".zip")) continue;
      const entry = {
        file: f, name: f.name,
        parsed: null, ...detectClassFromFilename(f.name, classes, activeClassId),
        error: null, note: null, reading: true,
      };
      newEntries.push(entry);
      csvToRead.push(f);
    }

    setFileEntries((prev) => [...prev, ...newEntries]);
    csvToRead.forEach((f) => readCsvEntry(f));
  }, [classes, activeClassId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setFileEntries((prev) => prev.map((e, i) => i === idx ? { ...e, classId, detected: true } : e));
  }

  // Entries we can actually submit (no error, not reading)
  const goodEntries = fileEntries.filter((e) => !e.error && !e.reading);

  function setEventClass(evId, newClassId) {
    const cls = classes.find((c) => c.id === newClassId);
    setEvents((prev) => prev.map((e) => e.id !== evId ? e : {
      ...e,
      classId:      newClassId,
      className:    cls?.name  ?? e.className,
      classColor:   cls?.color ?? e.classColor,
      autoAssigned: false,
    }));
  }

  async function addToDataset() {
    if (!goodEntries.length || uploading) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const fd = new FormData();
      fd.append("project_id", projectId ?? "demo-project");
      for (const entry of goodEntries) {
        fd.append("files", entry.file);
        fd.append("labels", "auto");  // backend detects class from filename
      }

      const res = await fetch(`${API_BASE_URL}/upload-events`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail?.message ?? body.detail ?? `Server error ${res.status}`);
      }
      const data = await res.json();

      // Build filename → sampleRateHz map from client-side parsed entries
      // BEFORE clearing fileEntries, so each event gets its own file's rate.
      const fileRateMap = {};
      for (const entry of goodEntries) {
        if (entry.name && entry.parsed?.sampleRateHz) {
          fileRateMap[entry.name] = entry.parsed.sampleRateHz;
        }
      }

      // Update detected sample rate from the upload response (computed from
      // actual timestamp deltas in the file, not a declared default).
      const uploadedSr = data.analysis?.sample_rate?.declared_hz;
      if (uploadedSr && uploadedSr > 0) setDetectedSampleRate(uploadedSr);

      // No auto-class creation. Only match events to classes that already
      // exist — files uploaded here are unassigned until the user places them
      // via a class-specific Upload button or renames them manually.
      const newEvents = data.events.map((ev) => {
        const matchedCls =
          classes.find((c) => c.name === ev.class_label) ??
          classes.find((c) => c.name.toLowerCase() === (ev.class_label || "").toLowerCase());
        return {
          id:            ev.id,
          datasetId:     ev.dataset_id ?? null,
          classId:       matchedCls?.id    ?? null,
          className:     matchedCls?.name  ?? "Unassigned",
          classColor:    matchedCls?.color ?? "#b0afa8",
          waveform:      ev.waveform_az ?? [],
          waveColor:     AXIS_COLORS.az,
          duration:      ev.duration_ms,
          timestamp:     new Date().toLocaleTimeString(),
          snapshot:      { ax: ev.waveform_ax ?? [], ay: ev.waveform_ay ?? [], az: ev.waveform_az ?? [] },
          filename:      ev.filename,
          notes:         ev.notes ?? [],
          autoAssigned:  true,
          detectedLabel: null,
          sampleRateHz:  fileRateMap[ev.filename] ?? null,
        };
      });
      setEvents((prev) => [...newEvents, ...prev]);

      const total = newEvents.length;
      setUploadSuccess(
        `Uploaded ${total} event${total !== 1 ? "s" : ""} — assign them a class using the Upload button next to each class.`
      );

      setFileEntries((prev) => prev.filter((e) => e.error));
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // Derive the selected event object for the detail panel
  const selectedEvent = selectedEventId ? events.find((e) => e.id === selectedEventId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3" style={{ position: "relative" }}>

      {/* ── File detail overlay — shown when an event row is clicked ──────── */}
      {selectedEvent && (
        <FileDetailPanel
          ev={selectedEvent}
          allEvents={events}
          onClose={() => setSelectedEventId(null)}
          onAskCopilot={onAskCopilot}
        />
      )}

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
            {dragOver ? "Drop to upload" : "Drop CSV files here"}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            Upload CSV files for each class using the buttons in the Classes panel →
          </p>
          <p className="text-xs text-gray-700 mt-0.5">
            Format: <code className="text-accent">timestamp_us,ax,ay,az</code> (no header)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-3 py-1 transition-colors"
          >
            Browse files
          </button>
          <a
            href="/sample-data.zip"
            download
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-accent hover:text-accent-dark transition-colors"
          >
            Download sample data →
          </a>
        </div>
      </div>

      {/* ── Format guide ───────────────────────────────────────────────────── */}
      <FormatGuide />

      {/* ── File cards ─────────────────────────────────────────────────────── */}
      {fileEntries.length > 0 && (
        <div className="flex flex-col gap-2 flex-shrink-0">
          {fileEntries.map((entry, idx) => {
            const assignedCls = classes.find((c) => c.id === entry.classId);
            return (
              <div
                key={idx}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                  entry.error ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
                }`}
              >
                {/* Waveform thumbnail */}
                {entry.reading ? (
                  <div className="w-16 h-7 bg-gray-100 rounded animate-pulse flex-shrink-0" />
                ) : entry.error ? (
                  <div className="w-16 h-7 bg-red-100 rounded flex-shrink-0 flex items-center justify-center">
                    <span className="text-xs text-red-400">!</span>
                  </div>
                ) : entry.parsed ? (
                  <WaveformThumb data={entry.parsed.az} color={AXIS_COLORS.az} w={64} h={28} />
                ) : (
                  <div className="w-16 h-7 bg-gray-100 rounded flex-shrink-0" />
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  {assignedCls && !entry.error ? (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: assignedCls.color }} />
                      <span className="text-xs font-bold" style={{ color: assignedCls.color }}>{assignedCls.name}</span>
                    </div>
                  ) : null}
                  <p className="text-xs text-gray-400 truncate">{entry.name}</p>
                  {entry.error ? (
                    <p className="text-[10px] text-red-500 mt-0.5 leading-tight">{entry.error}</p>
                  ) : !entry.reading && entry.detected === false ? (
                    <p className="text-[10px] text-yellow-600 mt-0.5 leading-tight">
                      No class detected — assigned to {assignedCls?.name ?? "unknown"}. Change if needed.
                    </p>
                  ) : entry.parsed ? (
                    <p className="text-[10px] text-gray-300 mt-0.5 tabular-nums">
                      {entry.parsed.rowCount} rows · {entry.parsed.durationMs} ms
                      {entry.parsed.sampleRateHz ? ` · ${entry.parsed.sampleRateHz} Hz` : ""}
                    </p>
                  ) : null}
                </div>

                {/* Class selector */}
                {!entry.error && !entry.reading && (
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

                <button
                  onClick={() => removeEntry(idx)}
                  className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-base leading-none px-1"
                >×</button>
              </div>
            );
          })}

          {/* Add to dataset button */}
          <div className="flex items-center gap-3">
            {uploadError && <p className="text-xs text-red-500 flex-1">{uploadError}</p>}
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


          {/* Success banner */}
          {uploadSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent/30 bg-accent/5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              <p className="text-xs text-accent leading-snug">{uploadSuccess}</p>
              <button
                onClick={() => setUploadSuccess(null)}
                className="ml-auto text-gray-400 hover:text-gray-600 text-sm leading-none flex-shrink-0"
              >×</button>
            </div>
          )}

          {/* Mixed-rate warning for staged (pre-upload) files */}
          {(() => {
            const stagedRates = [...new Set(
              fileEntries.map((e) => e.parsed?.sampleRateHz).filter(Boolean).map((r) => Math.round(r))
            )].sort((a, b) => a - b);
            if (stagedRates.length < 2) return null;
            return (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6 }}>
                <span style={{ fontSize: 12, flexShrink: 0 }}>⚠</span>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#92400e", lineHeight: 1.45 }}>
                  Files have different sample rates: {stagedRates.join(", ")} Hz — mixing rates will hurt training accuracy
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Analysis banner ─────────────────────────────────────────────────── */}
      {analyzeResult && (
        <div className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sf-gray-100 text-xs"
             style={{ background: "#f8f7f3" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-sf-black animate-pulse flex-shrink-0" />
          <span className="text-sf-black font-semibold">Signal analyzed</span>
          <span className="text-gray-500">— AI pipeline design ready on the next screen →</span>
        </div>
      )}

      {/* ── Mixed-rate warning for uploaded events ──────────────────────────── */}
      {(() => {
        const evRates = [...new Set(events.map((e) => e.sampleRateHz).filter(Boolean))].sort((a, b) => a - b);
        if (evRates.length < 2) return null;
        return (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>⚠</span>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#92400e", lineHeight: 1.45 }}>
              Files have different sample rates: {evRates.join(", ")} Hz — mixing rates will hurt training accuracy
            </p>
          </div>
        );
      })()}

      {/* ── Event list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-0.5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 border border-dashed border-gray-200 rounded gap-1">
            <span className="text-gray-300 text-xs">No events yet</span>
            <span className="text-gray-200 text-xs">Upload CSV files to add events</span>
          </div>
        ) : (
          events.map((ev) => {
            const isSelected = ev.id === selectedEventId;
            return (
              <div
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id)}
                className="flex items-center gap-2 px-3 py-2 border rounded group transition-colors bg-white"
                style={{
                  borderColor:  isSelected ? "#0a0a0a" : "#f0efe9",
                  cursor:       "pointer",
                  background:   isSelected ? "#f8f7f3" : "#ffffff",
                }}
              >
                <WaveformThumb data={ev.waveform} color={ev.waveColor} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={ev.classId ?? ""}
                      onChange={(e) => { e.stopPropagation(); setEventClass(ev.id, e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs border rounded px-1 py-0.5 focus:outline-none focus:border-accent bg-white flex-shrink-0"
                      style={{
                        color: ev.classColor,
                        borderColor: `${ev.classColor}60`,
                        maxWidth: "90px",
                      }}
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-400 tabular-nums">{ev.duration} ms</span>
                    {ev.sampleRateHz && (
                      <span className="text-[10px] tabular-nums" style={{ fontFamily: "'DM Mono', monospace", color: "#b0afa8" }}>
                        {ev.sampleRateHz} Hz
                      </span>
                    )}
                  </div>
                  {ev.autoAssigned ? (
                    <p className="text-[10px] text-yellow-600 mt-0.5 leading-tight">
                      Class not detected — assigned to {ev.className}. Change if needed.
                    </p>
                  ) : (
                    ev.filename && (
                      <p className="text-[10px] text-gray-300 mt-0.5 truncate">{ev.filename}</p>
                    )
                  )}
                </div>
                {/* Detail chevron */}
                <svg viewBox="0 0 8 12" className="w-2 h-3 flex-shrink-0 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2l4 4-4 4" />
                </svg>
                <button
                  onClick={(e) => { e.stopPropagation(); setEvents((prev) => prev.filter((e2) => e2.id !== ev.id)); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-base leading-none px-1 flex-shrink-0"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CollectScreen({ config, projectId, classes, setClasses, activeClassId, setActiveClassId, events, setEvents, analyzeResult, onAnalysisReady, chatHistory, setChatHistory, onApplyAction }) {
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

  // State (classes/activeClassId are now props from App.js for persistence)
  const [isRecording,     setIsRecording]     = useState(true);
  const [newClassName,    setNewClassName]    = useState("");
  const [showAddClass,    setShowAddClass]    = useState(false);
  const [deletingClassId, setDeletingClassId] = useState(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [timeSinceLast,   setTimeSinceLast]   = useState(null);
  const lastEventTimeRef = useRef(null);

  const [copilot, setCopilot] = useState({ status: "idle", data: null, error: null });
  // Tracks the sample rate computed from actual uploaded file timestamps.
  // Updated after every successful /upload-events response. Starts at the
  // hardware default (100 Hz) but is overwritten the moment real files land.
  const [detectedSampleRate, setDetectedSampleRate] = useState(SAMPLE_RATE);

  // ── Send a message directly to the copilot API (used from FileDetailPanel) ──
  async function sendToCopilot(message) {
    setChatHistory((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", content: message, timestamp: new Date().toLocaleTimeString() },
    ]);
    try {
      const res = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message, project_id: projectId, screen: "collect", pipeline_config: null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? `Server error ${res.status}`);
      setChatHistory((prev) => [
        ...prev,
        { id: `${Date.now()}-a`, role: "assistant", content: body.message, timestamp: new Date().toLocaleTimeString() },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: "assistant", content: `Copilot error: ${err.message}`, timestamp: new Date().toLocaleTimeString() },
      ]);
    }
  }
  const separabilityNoteRef  = useRef(null); // updated each render so async effect reads latest

  // Per-class CSV upload state
  const [classUploading,  setClassUploading]  = useState({});  // { [classId]: boolean }
  const [classUploadErr,  setClassUploadErr]  = useState({});  // { [classId]: string | null }
  const classInputRefs = useRef({});  // { [classId]: HTMLInputElement }

  async function handleClassUpload(classId, files) {
    if (!files?.length) return;
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;

    setClassUploading((prev) => ({ ...prev, [classId]: true }));
    setClassUploadErr((prev) => ({ ...prev, [classId]: null }));
    try {
      const fd = new FormData();
      fd.append("project_id", projectId ?? "demo-project");
      for (const file of Array.from(files)) {
        fd.append("files", file);
        fd.append("labels", cls.name);  // explicit — no auto-detection needed
      }
      const res = await fetch(`${API_BASE_URL}/upload-events`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail?.message ?? body.detail ?? `Server error ${res.status}`);
      }
      const data = await res.json();

      // Capture computed sample rate from this upload's timestamps
      const classSr = data.analysis?.sample_rate?.declared_hz;
      if (classSr && classSr > 0) setDetectedSampleRate(classSr);

      const newEvents = data.events.map((ev) => ({
        id:            ev.id,
        datasetId:     ev.dataset_id ?? null,
        classId:       cls.id,
        className:     cls.name,
        classColor:    cls.color,
        waveform:      ev.waveform_az ?? [],
        waveColor:     AXIS_COLORS.az,
        duration:      ev.duration_ms,
        timestamp:     new Date().toLocaleTimeString(),
        snapshot:      { ax: ev.waveform_ax ?? [], ay: ev.waveform_ay ?? [], az: ev.waveform_az ?? [] },
        filename:      ev.filename,
        notes:         ev.notes ?? [],
        autoAssigned:  false,
        detectedLabel: cls.name,
        sampleRateHz:  classSr && classSr > 0 ? classSr : null,
      }));
      setEvents((prev) => [...newEvents, ...prev]);
    } catch (err) {
      setClassUploadErr((prev) => ({ ...prev, [classId]: err.message }));
    } finally {
      setClassUploading((prev) => ({ ...prev, [classId]: false }));
    }
  }

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
        // Derive majority sample rate from per-file rates stored on events.
        // This prevents a single late-upload from clobbering the rate for all events.
        const rateCounts = events.reduce((acc, ev) => {
          if (ev.sampleRateHz) acc[ev.sampleRateHz] = (acc[ev.sampleRateHz] ?? 0) + 1;
          return acc;
        }, {});
        const majorityEntry = Object.entries(rateCounts).sort(([, a], [, b]) => b - a)[0];
        const sampleRateHz = majorityEntry ? parseFloat(majorityEntry[0]) : detectedSampleRate;

        const payload = {
          project_id: projectId ?? undefined,
          sample_rate_hz: sampleRateHz,
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
  }, [events, detectedSampleRate]); // eslint-disable-line react-hooks/exhaustive-deps

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
      ctx.fillStyle = "#fbfaf6";
      ctx.fillRect(0, 0, W, H);

      // Horizontal grid
      ctx.strokeStyle = "rgba(10,10,10,0.06)";
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
      ctx.strokeStyle = "rgba(10,10,10,0.12)";
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
        ctx.fillStyle  = "rgba(10,10,10,0.04)";
        ctx.fillRect(W - bandW, 0, bandW, H);
        // Leading edge
        ctx.strokeStyle = "rgba(10,10,10,0.25)";
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
        ctx.fillStyle = `rgba(10,10,10,${(burstStrength * 0.04).toFixed(3)})`;
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

  function handleDeleteClass(classId) {
    if (classes.length <= 1) return;
    setEvents((prev) => prev.filter((e) => e.classId !== classId));
    const remaining = classes.filter((c) => c.id !== classId);
    setClasses(remaining);
    if (activeClassId === classId) setActiveClassId(remaining[0]?.id ?? null);
    setDeletingClassId(null);
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
          setClasses={setClasses}
          activeClassId={activeClassId}
          events={events}
          setEvents={setEvents}
          onAnalysisReady={onAnalysisReady}
          projectId={projectId}
          analyzeResult={analyzeResult}
          separabilityNote={separabilityNote}
          copilot={copilot}
          setCopilot={setCopilot}
          setDetectedSampleRate={setDetectedSampleRate}
          onAskCopilot={sendToCopilot}
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
            {totalEvents > 0 && (
              clearAllConfirm ? (
                <span className="flex items-center gap-1.5 ml-1">
                  <span className="text-gray-400">Clear all?</span>
                  <button onClick={() => { setEvents([]); setClearAllConfirm(false); }}
                    className="text-red-400 hover:text-red-600 font-semibold">Yes</button>
                  <button onClick={() => setClearAllConfirm(false)}
                    className="text-gray-400 hover:text-gray-600">No</button>
                </span>
              ) : (
                <button onClick={() => setClearAllConfirm(true)}
                  className="text-gray-500 hover:text-red-400 transition-colors ml-1">
                  Clear all
                </button>
              )
            )}
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
          <div className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sf-gray-100 text-xs"
               style={{ background: "#f8f7f3" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-sf-black animate-pulse flex-shrink-0" />
            <span className="text-sf-black font-semibold">Signal analyzed</span>
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

          {/* Class list — scrollable if many classes */}
          <div className="divide-y divide-gray-50 overflow-y-auto" style={{ maxHeight: "220px" }}>
            {classes.map((cls) => {
              const count  = events.filter((e) => e.classId === cls.id).length;
              const pct    = Math.min(100, (count / TARGET_COUNT) * 100);
              const active = cls.id === activeClassId;
              const isDeleting = deletingClassId === cls.id;
              return (
                <div key={cls.id} className={`transition-colors ${active ? "bg-accent/5" : ""}`}>
                  {isDeleting ? (
                    /* ── inline delete confirmation ── */
                    <div className="px-4 py-3">
                      <p className="text-xs text-red-600 leading-snug mb-2">
                        Delete <strong>{cls.name}</strong> and its {count} event{count !== 1 ? "s" : ""}?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeletingClassId(null)}
                          className="flex-1 text-xs border border-gray-200 rounded py-1 text-gray-500 hover:border-gray-400"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteClass(cls.id)}
                          className="flex-1 text-xs bg-red-500 text-white rounded py-1 hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── normal class row ── */
                    <div className="relative group/cls">
                      {/* Hidden file input for per-class upload */}
                      <input
                        ref={(el) => { if (el) classInputRefs.current[cls.id] = el; }}
                        type="file"
                        accept=".csv,.txt"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) handleClassUpload(cls.id, e.target.files);
                          e.target.value = "";
                        }}
                      />
                      {/* Clickable area — div so we can nest real buttons */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveClassId(cls.id)}
                        onKeyDown={(e) => e.key === "Enter" && setActiveClassId(cls.id)}
                        className={`w-full text-left px-4 py-3 cursor-pointer transition-colors ${
                          active ? "" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                            <span className={`text-xs font-semibold truncate ${active ? "text-gray-800" : "text-gray-500"}`}>
                              {cls.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                            {/* Upload button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); classInputRefs.current[cls.id]?.click(); }}
                              disabled={!!classUploading[cls.id]}
                              className="text-[10px] text-accent border border-accent/30 rounded px-1.5 py-0.5 hover:bg-accent/5 transition-colors disabled:opacity-40"
                            >
                              {classUploading[cls.id] ? "…" : "Upload"}
                            </button>
                            <span className="text-xs text-gray-400 tabular-nums">{count}/{TARGET_COUNT}</span>
                          </div>
                        </div>
                        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: cls.color }} />
                        </div>
                        {classUploadErr[cls.id] && (
                          <p className="text-[10px] text-red-500 mt-1 leading-tight truncate">
                            {classUploadErr[cls.id]}
                          </p>
                        )}
                      </div>
                      {/* Delete button — visible on hover */}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (classes.length > 1) setDeletingClassId(cls.id); }}
                        title={classes.length <= 1 ? "Need at least one class" : `Delete ${cls.name}`}
                        className={`absolute top-2 right-2 w-4 h-4 rounded flex items-center justify-center
                          text-gray-300 opacity-0 group-hover/cls:opacity-100 transition-all
                          ${classes.length <= 1 ? "cursor-not-allowed" : "hover:text-red-400 hover:bg-red-50"}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
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
                <p className="text-xs text-gray-400 leading-relaxed">
                  Upload more events to unlock signal analysis.
                </p>
                <button
                  onClick={() => setCopilot({ status: "idle", data: null, error: null })}
                  className="mt-2 text-xs text-accent hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* ── ready ── */}
            {copilot.status === "ready" && (() => {
              const { cutoff_frequency: cf, normalization_window: nw, sample_rate: sr } = copilot.data;

              // Derive unique rates from per-file event data (more accurate than
              // the backend's single aggregated value).
              const eventRates = [...new Set(events.map((e) => e.sampleRateHz).filter(Boolean))].sort((a, b) => a - b);
              const mixedRates = eventRates.length > 1;

              return (
                <>
                  {/* Sample rate — single value when consistent, warning when mixed */}
                  {mixedRates ? (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6 }}>
                      <span style={{ fontSize: 11, flexShrink: 0 }}>⚠</span>
                      <div>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#92400e", fontWeight: 600 }}>
                          Mixed sample rates: {eventRates[0]}–{eventRates[eventRates.length - 1]} Hz
                        </p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b45309", marginTop: 2, lineHeight: 1.4 }}>
                          Use one consistent rate for reliable training
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Sample rate</p>
                      <p className="text-sm font-bold text-gray-800 tabular-nums">
                        {eventRates[0] ?? sr.measured_hz} Hz
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">computed from timestamps</p>
                    </div>
                  )}

                  {/* Low-pass cutoff — hidden when rates are mixed (Nyquist differs per file) */}
                  {!mixedRates && (
                    <>
                      <div className="w-full h-px bg-gray-200" />
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
                      </div>
                    </>
                  )}

                  {/* Energy bar — only shown alongside cutoff when rates are consistent */}
                  {!mixedRates && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${cf.energy_threshold_pct}%`, backgroundColor: "#1D9E75" }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                        {cf.energy_threshold_pct}% energy
                      </span>
                    </div>
                  )}

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
                events={events}
                classes={classes}
                setEvents={setEvents}
                setClasses={setClasses}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
