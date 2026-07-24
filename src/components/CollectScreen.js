import React, { useRef, useEffect, useState, useCallback } from "react";
import API_BASE_URL from "../config";
import CopilotChat from "./CopilotChat";
import LiveCaptureMode from "./LiveCaptureMode";
import SerialCaptureScreen from "./SerialCaptureScreen";

const COPILOT_THRESHOLD = 5;    // events before first analysis
const COPILOT_DEBOUNCE  = 1500; // ms to wait after last event before calling API

// ── Constants ────────────────────────────────────────────────────────────────

// Dynamic channel colors — any channel name gets a stable color
const _CH_PALETTE  = ["#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
function chColor(name, idx) { return _CH_PALETTE[idx % _CH_PALETTE.length]; }
// Legacy compat aliases
const AXIS_COLORS  = { ax: "#1D9E75", ay: "#3B82F6", az: "#F59E0B" };
const SAMPLE_RATE  = 100;   // Hz — default rate fallback
const TARGET_COUNT = 30;    // events per class before bar fills

const CLASS_PALETTE = [
  "#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// getActiveAxes moved to LiveCaptureMode.js

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

// Infer the multiplier that converts this file's timestamp unit → microseconds.
// Picks µs / ms / s by whichever yields a plausible sensor rate (~0.5–2000 Hz).
// Without this the preview assumed µs, so a 20 Hz recording whose timestamps are
// in ms mis-displayed as "20000 Hz · 170 ms" (the backend infers units correctly).
function _inferTimestampToUs(medianDelta) {
  if (!(medianDelta > 0)) return 1;              // no info → assume µs
  for (const toUs of [1, 1_000, 1_000_000]) {    // µs, ms, s
    const hz = 1_000_000 / (medianDelta * toUs);
    if (hz >= 0.5 && hz <= 2_000) return toUs;
  }
  return 1;                                        // fallback → µs
}

const UPLOAD_COL_MAP = {
  t: "timestamp", time: "timestamp", ts: "timestamp", time_us: "timestamp",
  timestamp_us: "timestamp",   // native SensorForge format
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
    const _tv = tsIdx >= 0 ? parseFloat(parts[tsIdx]) : NaN;   // keep a legit 0 (don't let 0||10000 corrupt it)
    ts.push(Number.isFinite(_tv) ? _tv : 10000);
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
  // Median consecutive delta (robust to gaps), then infer the timestamp unit and
  // convert both duration and sample rate accordingly.
  const validDeltas = tArr.filter((d) => d > 0);
  let medianDelta = null;
  if (validDeltas.length >= 2) {
    const sorted = [...validDeltas].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianDelta = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  const toUs = _inferTimestampToUs(medianDelta);   // native timestamp unit → microseconds
  const durationMs = tArr.reduce((s, v) => s + Math.abs(v), 0) * toUs / 1000;
  const sampleRateHz = medianDelta > 0
    ? Math.round((1_000_000 / (medianDelta * toUs)) * 10) / 10
    : null;

  return { ax, ay, az, rowCount: ax.length, durationMs: Math.round(durationMs), detectedLabel, sampleRateHz };
}

// ── Arduino Serial Monitor cleaner ───────────────────────────────────────────
// Strips Arduino noise and returns a clean 4-column CSV string ready for
// parseCSVText / the existing upload path.

const _SERIAL_PREFIX_RE  = /^\d{2}:\d{2}:\d{2}\.\d+\s*->\s*/;  // "14:56:18.403 ->  "
const _DATA_ROW_RE       = /^\d+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/;  // timestamp_us,ax,ay,az
const _NOISE_PREFIX_RE   = /^(ets |rst:|load:|clk_|mode:|phy_|Guru|E \(|Ready|===|#)/i;
const _HEADER_RE         = /^timestamp/i;

// unit: "us" | "ms" | "s"
// hzOverride: number | null — if set, replace all delta timestamps with 1e6/hz µs
function cleanSerialText(raw, unit = "us", hzOverride = null) {
  const lines = raw.split(/\r?\n/);
  const dataRows = [];

  for (let line of lines) {
    line = line.replace(_SERIAL_PREFIX_RE, "").trim();   // strip time prefix
    if (!line) continue;
    if (_NOISE_PREFIX_RE.test(line)) continue;           // boot / marker lines
    if (_HEADER_RE.test(line)) continue;                 // optional CSV header
    if (!_DATA_ROW_RE.test(line)) continue;              // keep only valid data rows
    dataRows.push(line.split(",").map((v) => v.trim()));
  }

  if (dataRows.length < 2) {
    throw new Error(
      "No valid data rows found — expected CSV with timestamp + numeric signal columns"
    );
  }

  // Multiplier to convert the user's timestamp unit → microseconds
  const toUs = unit === "us" ? 1 : unit === "ms" ? 1_000 : 1_000_000;

  // Parse timestamps in user's unit, convert to µs
  const tsUs = dataRows.map(([ts]) => parseFloat(ts) * toUs);

  // Re-zero: subtract first timestamp so series starts at 0
  const t0 = tsUs[0];
  const relUs = tsUs.map((t) => t - t0);

  // Compute inter-sample delta timestamps in µs (what the backend expects)
  const deltaUs = relUs.map((t, i) => i === 0 ? null : t - relUs[i - 1]);

  // Compute median of the first 50 inter-sample deltas (robust to gaps)
  const sample = deltaUs.slice(1, 51).filter((d) => d > 0);
  const sorted = [...sample].sort((a, b) => a - b);
  const medianDelta = sorted[Math.floor(sorted.length / 2)] ?? 10_000;

  // First sample has no predecessor — use median as its interval
  deltaUs[0] = medianDelta;

  // If the user supplied a fixed sample rate, override every interval
  const finalDeltas = (hzOverride && hzOverride > 0)
    ? dataRows.map(() => Math.round(1_000_000 / hzOverride))
    : deltaUs.map((d) => Math.max(100, Math.round(d)));

  return dataRows.map(([, ax, ay, az], i) => `${finalDeltas[i]},${ax},${ay},${az}`).join("\n");
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

function SignalPlotRow({ data, color, label, height = 36, startIdx = 0, endIdx }) {
  if (!data?.length) return null;
  const VW = 400; const VH = height;
  // Only render samples in the viewport range
  const si = Math.max(0, startIdx);
  const ei = endIdx != null ? Math.min(data.length, endIdx) : data.length;
  const slice = data.slice(si, ei);
  if (slice.length === 0) return null;
  const mn = Math.min(...slice); const mx = Math.max(...slice);
  const range = (mx - mn) || 0.001;
  const pts = slice
    .map((v, i) => {
      const x = ((i / Math.max(slice.length - 1, 1)) * VW).toFixed(1);
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

function FileDetailPanel({ ev, allEvents, onClose, onAskCopilot, classes, setClasses }) {
  const snap  = ev.snapshot ?? {};
  // Use actual channel names from snapshot keys (dynamic, not hardcoded ax/ay/az)
  const axes  = Object.keys(snap).filter((k) => snap[k]?.length > 0);
  const stats = {};
  for (const axis of axes) stats[axis] = computeAxisStats(snap[axis]);

  // Compute rate from this file's own sample count ÷ duration
  const firstCh = axes[0];
  const sampleCount = firstCh ? (snap[firstCh]?.length ?? 0) : 0;
  const displayRate = sampleCount > 0 && ev.duration > 0
    ? Math.round((sampleCount / (ev.duration / 1000)) * 10) / 10
    : ev.sampleRateHz;

  // Quality flags — read from the ingest quality gate (one source of truth)
  const flags = (ev.qualityFlags || []).map((f) => f.detail || f.flag_type || "unknown issue");

  // ── Viewport/zoom state ────────────────────────────────────────────────────
  const [viewWindowSec, setViewWindowSec] = useState(0);  // 0 = show all
  const [viewOffset, setViewOffset] = useState(0);  // ms offset from start
  const totalMs = ev.duration || 1;
  const viewStartMs = viewWindowSec > 0 ? viewOffset : 0;
  const viewEndMs = viewWindowSec > 0 ? Math.min(viewOffset + viewWindowSec * 1000, totalMs) : totalMs;
  const viewDurationMs = viewEndMs - viewStartMs;

  // ── Segments: single source of truth ────────────────────────────────────────
  // Each segment: { start_ms, end_ms, label, source, confidence, embedding, cluster_id }
  const [segments, setSegments] = useState([]);
  const [segSensitivity, setSegSensitivity] = useState(1.0);
  const [segLoading, setSegLoading] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [selectedSeg, setSelectedSeg] = useState(null);
  const [segSaveStatus, setSegSaveStatus] = useState("idle"); // idle | saving | saved | failed
  const [segSaveError, setSegSaveError] = useState(null);
  const segBarRef = useRef(null);
  const segRowRefs = useRef({});
  const saveTimerRef = useRef(null);
  const SEG_COLORS = ["#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];
  const UNLABELED_COLOR = "#c0bfb8";

  // ── Fetch persisted segments on mount ──────────────────────────────────────
  useEffect(() => {
    if (!ev.datasetId) return;
    fetch(`${API_BASE_URL}/datasets/${ev.datasetId}/segments`)
      .then((r) => r.ok ? r.json() : { segments: [] })
      .then((data) => { if (data.segments?.length > 0) setSegments(data.segments); })
      .catch(() => {});
  }, [ev.datasetId]);

  // ── Debounced save to backend ──────────────────────────────────────────────
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const saveSegments = useCallback(() => {
    if (!ev.datasetId) return;
    const segs = segmentsRef.current;
    if (segs.length === 0) return;
    setSegSaveStatus("saving");
    setSegSaveError(null);
    fetch(`${API_BASE_URL}/datasets/${ev.datasetId}/segments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: segs }),
    })
      .then((r) => { if (!r.ok) throw new Error(`Server ${r.status}`); return r.json(); })
      .then(() => { setSegSaveStatus("saved"); setTimeout(() => setSegSaveStatus((s) => s === "saved" ? "idle" : s), 2000); })
      .catch((err) => { setSegSaveStatus("failed"); setSegSaveError(err.message); });
  }, [ev.datasetId]);

  function debouncedSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveSegments, 500);
  }

  // Trigger debounced save after any segment mutation (skip initial load)
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) { initialLoadRef.current = false; return; }
    if (segments.length > 0) debouncedSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  // ── Sync segment labels → App.js classes ────────────────────────────────
  // Union, not replace: new labels introduced in segments are appended to the
  // class list; predefined classes are never dropped just because no segment
  // uses them yet (otherwise labeling the first segment would wipe every other
  // class out of the dropdown, making them unassignable).
  useEffect(() => {
    if (!setClasses || segments.length === 0) return;
    const segLabels = [...new Set(segments.map(s => s.label).filter(Boolean))];
    if (segLabels.length === 0) return;
    const CLASS_PALETTE = ["#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
    setClasses((prev) => {
      const existing = prev || [];
      const have = new Set(existing.map((c) => c.name));
      const missing = segLabels.filter((l) => !have.has(l));
      if (missing.length === 0) return existing;
      const base = existing.length;
      return [
        ...existing,
        ...missing.map((name, i) => ({
          id: `cls-${name.replace(/\s+/g, "-")}-${base + i}`,
          name,
          color: CLASS_PALETTE[(base + i) % CLASS_PALETTE.length],
          description: "",
        })),
      ];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  // ── Label→color map ──────────────────────────────────────────────────────
  const labelColorMap = React.useMemo(() => {
    const map = {};
    // Prefer the app-level class color so a class shows the SAME color in the
    // segment bar/table as in the CLASSES panel. Labels not in the class list
    // fall back to the palette (offset past the defined class colors).
    const byName = {};
    (classes || []).forEach((c) => { if (c?.name) byName[c.name] = c.color; });
    const extraLabels = [];
    for (const seg of segments) {
      if (!seg.label) continue;
      if (byName[seg.label]) { map[seg.label] = byName[seg.label]; }
      else if (!extraLabels.includes(seg.label)) { extraLabels.push(seg.label); }
    }
    extraLabels.forEach((lbl, idx) => {
      map[lbl] = SEG_COLORS[((classes ? classes.length : 0) + idx) % SEG_COLORS.length];
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, classes]);

  function getSegColor(seg) {
    return seg.label ? (labelColorMap[seg.label] || UNLABELED_COLOR) : UNLABELED_COLOR;
  }

  // ── Segment mutations ──────────────────────────────────────────────────────
  function mergeWithNext(idx) {
    if (idx >= segments.length - 1) return;
    setSegments(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], end_ms: next[idx + 1].end_ms };
      next.splice(idx + 1, 1);
      return next;
    });
    setSelectedSeg(null);
  }

  function mergeWithPrev(idx) {
    if (idx <= 0) return;
    setSegments(prev => {
      const next = [...prev];
      next[idx - 1] = { ...next[idx - 1], end_ms: next[idx].end_ms };
      next.splice(idx, 1);
      return next;
    });
    setSelectedSeg(null);
  }

  function deleteSegment(idx) {
    if (segments.length <= 1) return;
    if (idx === 0) { mergeWithNext(idx); return; }
    if (idx === segments.length - 1) { mergeWithPrev(idx); return; }
    const leftSize = segments[idx - 1].end_ms - segments[idx - 1].start_ms;
    const rightSize = segments[idx + 1].end_ms - segments[idx + 1].start_ms;
    if (leftSize >= rightSize) mergeWithPrev(idx);
    else mergeWithNext(idx);
  }

  function relabelSegment(idx, newLabel) {
    setSegments(prev => prev.map((s, i) =>
      i === idx ? { ...s, label: newLabel || null, source: newLabel ? "manual" : null, confidence: null } : s
    ));
  }

  function resizeSegment(idx, field, valueSec) {
    const newMs = Math.round(valueSec * 1000);
    const MIN_SEG_MS = 500;
    setSegments(prev => {
      const seg = prev[idx];
      if (!seg) return prev;
      if (field === "start") {
        const minMs = idx > 0 ? prev[idx - 1].start_ms + MIN_SEG_MS : 0;
        const maxMs = seg.end_ms - MIN_SEG_MS;
        const clamped = Math.max(minMs, Math.min(maxMs, newMs));
        return prev.map((s, i) => {
          if (i === idx) return { ...s, start_ms: clamped };
          if (i === idx - 1) return { ...s, end_ms: clamped };
          return s;
        });
      } else {
        const minMs = seg.start_ms + MIN_SEG_MS;
        const maxMs = idx < prev.length - 1 ? prev[idx + 1].end_ms - MIN_SEG_MS : totalMs;
        const clamped = Math.max(minMs, Math.min(maxMs, newMs));
        return prev.map((s, i) => {
          if (i === idx) return { ...s, end_ms: clamped };
          if (i === idx + 1) return { ...s, start_ms: clamped };
          return s;
        });
      }
    });
  }

  // ── Drag-to-resize segment edges on bar ─────────────────────────────────────
  const [edgeDrag, setEdgeDrag] = useState(null); // { segIndex, edge, startX, origMs }

  function handleSegEdgeDown(e, segIndex, edge) {
    e.stopPropagation();
    e.preventDefault();
    const origMs = edge === "left" ? segments[segIndex].start_ms : segments[segIndex].end_ms;
    setEdgeDrag({ segIndex, edge, startX: e.clientX, origMs });
  }

  useEffect(() => {
    if (!edgeDrag) return;
    const { segIndex, edge, startX, origMs } = edgeDrag;
    function onMove(e) {
      const bar = segBarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pxPerMs = rect.width / viewDurationMs;
      const dx = e.clientX - startX;
      let newMs = Math.round(origMs + dx / pxPerMs);
      const MIN_SEG_MS = 500;
      setSegments(prev => {
        const seg = prev[segIndex];
        if (!seg) return prev;
        if (edge === "left") {
          const minMs = segIndex > 0 ? prev[segIndex - 1].start_ms + MIN_SEG_MS : 0;
          const maxMs = seg.end_ms - MIN_SEG_MS;
          newMs = Math.max(minMs, Math.min(maxMs, newMs));
          return prev.map((s, i) => {
            if (i === segIndex) return { ...s, start_ms: newMs };
            if (i === segIndex - 1) return { ...s, end_ms: newMs };
            return s;
          });
        } else {
          const minMs = seg.start_ms + MIN_SEG_MS;
          const maxMs = segIndex < prev.length - 1 ? prev[segIndex + 1].end_ms - MIN_SEG_MS : totalMs;
          newMs = Math.max(minMs, Math.min(maxMs, newMs));
          return prev.map((s, i) => {
            if (i === segIndex) return { ...s, end_ms: newMs };
            if (i === segIndex + 1) return { ...s, start_ms: newMs };
            return s;
          });
        }
      });
    }
    function onUp() { setEdgeDrag(null); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [edgeDrag, viewDurationMs, totalMs]);

  // ── Auto-segment with label carryover ───────────────────────────────────────
  async function handleAutoSegment() {
    if (!ev.datasetId) return;
    // Snapshot existing labeled segments for carryover
    const oldLabeled = segments.filter(s => s.label && s.source === "manual");

    setSegLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/datasets/${ev.datasetId}/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset_id: ev.datasetId, sensitivity: segSensitivity }),
      });
      const data = await res.json();
      if (res.ok && data.segments) {
        // Carry over labels: if a new segment's midpoint falls inside an old labeled
        // segment's range, inherit that label with source:"manual"
        const normalized = data.segments.map(s => {
          const mid = (s.start_ms + s.end_ms) / 2;
          const donor = oldLabeled.find(old => mid >= old.start_ms && mid < old.end_ms);
          return {
            ...s,
            label: donor ? donor.label : null,
            source: donor ? "manual" : null,
            confidence: null,
          };
        });

        // Warn only if some old labels couldn't be carried over
        const carriedLabels = new Set(normalized.filter(s => s.label).map(s => s.label));
        const lostLabels = oldLabeled.filter(old => !carriedLabels.has(old.label));
        if (lostLabels.length > 0) {
          const lostNames = [...new Set(lostLabels.map(l => l.label))].join(", ");
          if (!window.confirm(`Labels [${lostNames}] could not be carried over to new segments. Continue?`)) {
            setSegLoading(false);
            return;
          }
        }

        setSegments(normalized);
        setSelectedSeg(null);
      }
    } catch { /* ignore */ }
    finally { setSegLoading(false); }
  }

  // ── Propagate ─────────────────────────────────────────────────────────────
  async function handlePropagate() {
    if (segments.length < 2) return;
    setPropagating(true);
    try {
      const payload = segments.map(seg => ({
        embedding: seg.embedding || [],
        label: seg.source === "manual" ? seg.label : null,
      }));
      const res = await fetch(`${API_BASE_URL}/datasets/propagate-labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: payload }),
      });
      const data = await res.json();
      if (res.ok && data.propagated) {
        setSegments(prev => {
          const next = [...prev];
          for (const p of data.propagated) {
            if (next[p.segment_index] && next[p.segment_index].source !== "manual") {
              next[p.segment_index] = {
                ...next[p.segment_index],
                label: p.predicted_label,
                source: "propagated",
                confidence: p.confidence,
              };
            }
          }
          return next;
        });
      }
    } catch { /* ignore */ }
    finally { setPropagating(false); }
  }

  const copilotMsg = [
    `Analyze signal "${ev.filename ?? "unknown"}"`,
    displayRate ? `${displayRate} Hz` : null,
    `${ev.duration} ms`,
    `${axes.length > 0 ? (snap[axes[0]]?.length ?? 0) : 0} samples`,
    axes.map((a) => `${a}: mean=${stats[a]?.mean.toFixed(3)}, std=${stats[a]?.std.toFixed(3)}, min=${stats[a]?.min.toFixed(3)}, max=${stats[a]?.max.toFixed(3)}`).join("; "),
    flags.length ? `Flags: ${flags.join("; ")}` : null,
    "Any data quality concerns?",
  ].filter(Boolean).join(" · ");

  const FMT = (v) => v?.toFixed(3) ?? "—";

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [dragStart, setDragStart] = useState(null);  // ms
  const [dragEnd,   setDragEnd]   = useState(null);  // ms
  const sigContainerRef = useRef(null);

  // ── Video / shared-timeline state ───────────────────────────────────────────
  const [hasVideo,      setHasVideo]      = useState(ev.hasVideo ?? false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [currentMs,     setCurrentMs]     = useState(0);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const videoRef = useRef(null);

  // ── Drag popup ─────────────────────────────────────────────────────────────
  const [dragPopup,     setDragPopup]     = useState(null);
  const [dragPopupName, setDragPopupName] = useState("");
  const dragPopupInputRef = useRef(null);
  const justCreatedPopupRef = useRef(false);

  // SVG viewBox width shared with SignalPlotRow
  const VW = 400;
  const AXIS_INSET = 20;

  function clientXToMs(clientX) {
    const rect = sigContainerRef.current?.getBoundingClientRect();
    if (!rect || viewDurationMs <= 0) return 0;
    const plotLeft = rect.left + AXIS_INSET;
    const plotW    = rect.width - AXIS_INSET;
    const frac = Math.max(0, Math.min(1, (clientX - plotLeft) / plotW));
    return viewStartMs + frac * viewDurationMs;
  }

  function msToVW(ms) {
    return viewDurationMs > 0 ? ((ms - viewStartMs) / viewDurationMs) * VW : 0;
  }

  function seekTo(ms) {
    setCurrentMs(ms);
    if (videoRef.current) { videoRef.current.currentTime = ms / 1000; }
  }

  // ── Drag-to-label ─────────────────────────────────────────────────────────
  function handleSigMouseDown(e) {
    if (e.button !== 0) return;
    const ms = clientXToMs(e.clientX);
    setDragStart(ms); setDragEnd(ms);
    setCurrentMs(ms);
  }

  function handlePanelMouseMove(e) {
    if (dragStart !== null && !dragPopup) setDragEnd(clientXToMs(e.clientX));
  }

  function handlePanelMouseUp(e) {
    if (dragStart !== null) {
      const endMs  = clientXToMs(e.clientX);
      const s_ms   = Math.min(dragStart, endMs);
      const dur_ms = Math.abs(endMs - dragStart);
      if (dur_ms < 5) {
        setDragStart(null); setDragEnd(null);
        seekTo(endMs);
        return;
      }
      if (dur_ms >= 5 && ev.datasetId) {
        setDragEnd(endMs);
        setDragPopup({ s_ms, dur_ms, clientX: e.clientX, clientY: e.clientY });
        setDragPopupName("");
        justCreatedPopupRef.current = true;
        setTimeout(() => {
          dragPopupInputRef.current?.focus();
          justCreatedPopupRef.current = false;
        }, 100);
        return;
      }
      setDragStart(null); setDragEnd(null);
    }
  }

  function handleCreateLabel(name) {
    if (!name?.trim() || !dragPopup) return;
    const { s_ms, dur_ms } = dragPopup;
    setDragPopup(null);
    setDragStart(null); setDragEnd(null);
    const trimmed = name.trim();
    // Find the segment whose range contains the drag midpoint and label it
    if (segments.length > 0) {
      const spanMid = s_ms + dur_ms / 2;
      const segIdx = segments.findIndex(s => spanMid >= s.start_ms && spanMid < s.end_ms);
      if (segIdx >= 0) {
        relabelSegment(segIdx, trimmed);
        return;
      }
    }
    // No segments yet — create a single segment covering the drag range
    setSegments(prev => [...prev, {
      start_ms: s_ms, end_ms: s_ms + dur_ms,
      label: trimmed, source: "manual", confidence: null,
      embedding: [], cluster_id: null,
    }].sort((a, b) => a.start_ms - b.start_ms));
  }

  // ── Video upload ─────────────────────────────────────────────────────────────
  async function handleVideoUpload(file) {
    if (!ev.datasetId || !file) return;
    setVideoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_BASE_URL}/datasets/${ev.datasetId}/video`, { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
      setHasVideo(true);
      // Reload video element
      if (videoRef.current) {
        videoRef.current.load();
        setCurrentMs(0);
        setIsPlaying(false);
      }
    } catch (err) { alert("Video upload failed: " + err.message); }
    finally { setVideoUploading(false); }
  }

  async function handleVideoRemove() {
    if (!ev.datasetId || !window.confirm("Remove video from this file?")) return;
    try {
      await fetch(`${API_BASE_URL}/datasets/${ev.datasetId}/video`, { method: "DELETE" });
      setHasVideo(false);
      setCurrentMs(0);
      setIsPlaying(false);
    } catch (err) { alert("Failed to remove video: " + err.message); }
  }

  function togglePlayPause() {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); setIsPlaying(true); }
    else            { vid.pause(); setIsPlaying(false); }
  }

  // VLM auto-label deferred — will be rewired to write to segments in a future commit

  // Live selection rect bounds in VW coords
  const selX   = dragStart !== null && dragEnd !== null ? msToVW(Math.min(dragStart, dragEnd)) : null;
  const selW   = dragStart !== null && dragEnd !== null ? msToVW(Math.abs(dragEnd - dragStart)) : 0;
  const isDrag = dragStart !== null;
  // Shared cursor x in VW coords
  const cursorX = msToVW(currentMs);

  return (
    <div
      style={{
        position: "absolute", inset: 0, background: "#ffffff", zIndex: 10,
        display: "flex", flexDirection: "column", overflow: "hidden",
        border: "1px solid #ebeae5", borderRadius: 8,
      }}
      onMouseMove={handlePanelMouseMove}
      onMouseUp={handlePanelMouseUp}
      onMouseLeave={handlePanelMouseUp}
      onClick={() => { if (dragPopup && !justCreatedPopupRef.current) { setDragPopup(null); setDragStart(null); setDragEnd(null); } }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid #ebeae5", flexShrink: 0 }}>
        <button
          onClick={() => {
            if (segSaveStatus === "failed" && !window.confirm("Segment changes failed to save. Close anyway?")) return;
            onClose();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "#b0afa8", fontSize: 16, lineHeight: 1, flexShrink: 0 }}
          title="Back to list"
        >←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#0a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ev.filename ?? "Signal"}
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", marginTop: 1 }}>
            {[displayRate ? `${displayRate} Hz` : null, `${ev.duration} ms`, snap.ax?.length ? `${snap.ax.length} samples` : null].filter(Boolean).join(" · ")}
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

        {/* ── Indexing warning — shown when file wasn't indexed by the backend ── */}
        {!ev.datasetId && (
          <div style={{ marginBottom: 12, padding: "8px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>⚠</span>
            <div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#92400e", lineHeight: 1.5, fontWeight: 600 }}>
                File not indexed by backend
              </p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#92400e", lineHeight: 1.5, marginTop: 2 }}>
                Video upload, timeline labeling, and the label track are unavailable.
                {ev.notes?.some((n) => n.startsWith("⚠ Indexing failed:")) && (
                  <span> Reason: {ev.notes.find((n) => n.startsWith("⚠ Indexing failed:"))?.slice(18)}</span>
                )}
                {" "}Re-upload this file to enable these features.
              </p>
            </div>
          </div>
        )}

        {/* ── Video lane (compact) ─────────────────────────────────────────── */}
        {ev.datasetId && (
          <div style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0, width: hasVideo ? 200 : "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Video</p>
              {hasVideo && (
                <>
                  <button
                    onClick={handleVideoRemove}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#b0afa8", padding: 0, fontFamily: "'DM Mono', monospace", marginLeft: "auto" }}
                    title="Remove video"
                  >remove</button>
                </>
              )}
            </div>

            {hasVideo ? (
              <>
              <div style={{ position: "relative" }}>
                <video
                  ref={videoRef}
                  src={`${API_BASE_URL}/datasets/${ev.datasetId}/video`}
                  style={{ width: "100%", borderRadius: 6, background: "#0a0a0a", display: "block", maxHeight: 150, objectFit: "contain" }}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentMs(videoRef.current.currentTime * 1000);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  preload="metadata"
                />
                {/* Play/pause overlay */}
                <button
                  onClick={togglePlayPause}
                  style={{
                    position: "absolute", bottom: 6, left: 6,
                    background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 4,
                    color: "#fff", cursor: "pointer", padding: "3px 8px", fontSize: 10,
                    fontFamily: "'DM Mono', monospace", backdropFilter: "blur(4px)",
                  }}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>
                {/* Current time readout */}
                <span style={{
                  position: "absolute", bottom: 6, right: 6,
                  background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 9,
                  fontFamily: "'DM Mono', monospace", padding: "3px 6px", borderRadius: 4,
                  backdropFilter: "blur(4px)",
                }}>
                  {(currentMs / 1000).toFixed(2)}s / {(ev.duration / 1000).toFixed(2)}s
                </span>
              </div>
              {/* Video scrubber — drag to seek through the video */}
              <input type="range" min={0} max={Math.max(1, ev.duration)} step={10} value={currentMs}
                onChange={(e) => seekTo(Number(e.target.value))}
                style={{ width: "100%", height: 6, accentColor: "#ef4444", marginTop: 4 }} />
              </>
            ) : (
              <label style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 5, padding: "12px 0", border: "1px dashed #d8d7d0", borderRadius: 6,
                cursor: videoUploading ? "wait" : "pointer", color: "#b0afa8", background: "#fafaf8",
              }}>
                <input
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  disabled={videoUploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ""; }}
                />
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ width: 20, height: 20, opacity: 0.5 }}>
                  <rect x="2" y="5" width="16" height="12" rx="2" /><path d="M7 2l3 3 3-3" />
                </svg>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace" }}>
                  {videoUploading ? "Uploading…" : "Upload video"}
                </span>
                <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#c0bfb8", textAlign: "center", lineHeight: 1.4 }}>
                  Crop your video to the same start/end as this recording so video time = signal time
                </span>
              </label>
            )}
            </div>
          </div>
        )}

        {/* Signal header + zoom controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
            Signal
            {ev.datasetId && (
              <span style={{ marginLeft: 8, textTransform: "none", letterSpacing: 0, color: isDrag && dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) > 5 ? "#3B82F6" : "#c0bfb8" }}>
                {isDrag && dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) > 5
                  ? `${(Math.min(dragStart, dragEnd) / 1000).toFixed(2)}s → ${(Math.max(dragStart, dragEnd) / 1000).toFixed(2)}s`
                  : "— drag to label · click to seek"}
              </span>
            )}
          </p>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, color: "#b0afa8", fontFamily: "'DM Mono', monospace" }}>
              {(viewStartMs / 1000).toFixed(1)}s – {(viewEndMs / 1000).toFixed(1)}s
            </span>
            {[10, 30, 60, 0].map((sec) => (
              <button key={sec} onClick={() => { setViewWindowSec(sec); setViewOffset(Math.min(viewOffset, Math.max(0, totalMs - sec * 1000))); }}
                style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3, border: "1px solid",
                  borderColor: viewWindowSec === sec ? "#8B5CF6" : "#e0e0e0",
                  color: viewWindowSec === sec ? "#8B5CF6" : "#999",
                  background: viewWindowSec === sec ? "rgba(139,92,246,0.05)" : "none",
                  cursor: "pointer", fontFamily: "'DM Mono', monospace",
                }}>
                {sec === 0 ? "All" : `${sec}s`}
              </button>
            ))}
          </div>
        </div>
        {/* Scroll bar for viewport (only when zoomed) */}
        {viewWindowSec > 0 && totalMs > viewWindowSec * 1000 && (
          <input type="range" min={0} max={Math.max(0, totalMs - viewWindowSec * 1000)} step={100}
            value={viewOffset} onChange={(e) => setViewOffset(Number(e.target.value))}
            style={{ width: "100%", height: 8, accentColor: "#8B5CF6", marginBottom: 4 }} />
        )}
        <div
          ref={sigContainerRef}
          style={{ marginBottom: 6, cursor: isDrag ? "col-resize" : ev.datasetId ? "crosshair" : "default", userSelect: "none" }}
          onMouseDown={ev.datasetId ? handleSigMouseDown : undefined}
        >
          {axes.map((axis, ai) => {
            const chanData = snap[axis] || [];
            const samplesPerMs = chanData.length / Math.max(totalMs, 1);
            const si = Math.floor(viewStartMs * samplesPerMs);
            const ei = Math.ceil(viewEndMs * samplesPerMs);
            return (
            <SignalPlotRow
              key={axis}
              data={chanData}
              color={chColor(axis, ai)}
              label={axis}
              height={60}
              startIdx={si}
              endIdx={ei}
            />
          );})}

          {/* Overlays: selection highlight + cursor line */}
          {((selX !== null && selW > 2) || ev.datasetId) && (() => {
            const overlayH = 60 * axes.length + 3 * Math.max(0, axes.length - 1);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", height: 0, top: -overlayH - 2 }}>
                <span style={{ width: 14, flexShrink: 0 }} />
                <svg
                  viewBox={`0 0 ${VW} ${overlayH}`}
                  style={{ flex: 1, height: overlayH, display: "block", pointerEvents: "none" }}
                  preserveAspectRatio="none"
                >
                  {selX !== null && selW > 2 && (
                    <rect x={selX} y={0} width={selW} height="100%" fill="rgba(59,130,246,0.12)" stroke="#3B82F6" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  )}
                  {ev.datasetId && (
                    <line x1={cursorX} y1={0} x2={cursorX} y2={overlayH} stroke="#ef4444" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
              </div>
            );
          })()}
        </div>

        {/* ── Time axis ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4, height: 18 }}>
          <span style={{ width: 14, flexShrink: 0 }} />
          <div style={{ flex: 1, position: "relative", height: 18 }}>
            {(() => {
              const durSec = viewDurationMs / 1000;
              if (durSec <= 0) return null;
              // Pick nice tick spacing
              const targetTicks = 8;
              const rawStep = durSec / targetTicks;
              const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
              const norm = rawStep / mag;
              const step = mag * (norm <= 1.5 ? 1 : norm <= 3.5 ? 2 : norm <= 7.5 ? 5 : 10);
              const startSec = viewStartMs / 1000;
              const endSec = viewEndMs / 1000;
              const first = Math.ceil(startSec / step) * step;
              const ticks = [];
              for (let t = first; t <= endSec; t += step) ticks.push(t);
              return ticks.map((t) => {
                const pct = ((t - startSec) / durSec) * 100;
                return (
                  <span key={t} style={{
                    position: "absolute", left: `${pct}%`, transform: "translateX(-50%)",
                    fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#b0afa8",
                    borderLeft: "1px solid #e0e0e0", paddingLeft: 2, top: 0,
                  }}>
                    {t % 1 === 0 ? `${t}s` : `${t.toFixed(1)}s`}
                  </span>
                );
              });
            })()}
            {/* Playhead time readout */}
            {(() => {
              const pct = ((currentMs - viewStartMs) / viewDurationMs) * 100;
              if (pct < -2 || pct > 102) return null;
              return (
                <span style={{
                  position: "absolute", left: `${Math.max(0, Math.min(95, pct))}%`,
                  top: 0, fontSize: 9, fontFamily: "'DM Mono', monospace",
                  color: "#ef4444", fontWeight: 700, transform: "translateX(-50%)",
                }}>
                  {(currentMs / 1000).toFixed(1)}s
                </span>
              );
            })()}
          </div>
        </div>

        {/* ── Auto-segmentation ───────────────────────────────────────────────── */}
        {ev.datasetId && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <button onClick={handleAutoSegment} disabled={segLoading}
                style={{ fontSize: 10, color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 4, padding: "2px 8px", background: "none", cursor: "pointer" }}>
                {segLoading ? "Segmenting…" : "Auto-segment"}
              </button>
              <span style={{ fontSize: 9, color: "#b0afa8" }}>Sensitivity</span>
              <input type="range" min={0.5} max={10} step={0.5} value={segSensitivity}
                onChange={(e) => setSegSensitivity(Number(e.target.value))}
                style={{ width: 80, accentColor: "#8B5CF6" }} />
              <span style={{ fontSize: 9, color: "#b0afa8", fontFamily: "'DM Mono', monospace" }}>{segSensitivity}</span>
              {segments.length > 0 && (
                <span style={{ fontSize: 9, color: "#6b6a63" }}>{segments.length} segments</span>
              )}
            </div>
            {/* ═══ Segment bar (display + select) ═══ */}
            {segments.length > 0 && ev.duration > 0 && (
              <>
                <div ref={segBarRef} role="listbox" aria-label="Segment timeline"
                  style={{ position: "relative", height: 24, borderRadius: 4, overflow: "visible", marginBottom: 4, background: "#f0f0f0" }}>
                  {segments.map((seg, i) => {
                    const leftPct = ((Math.max(seg.start_ms, viewStartMs) - viewStartMs) / viewDurationMs) * 100;
                    const rightPct = ((Math.min(seg.end_ms, viewEndMs) - viewStartMs) / viewDurationMs) * 100;
                    const w = rightPct - leftPct;
                    if (w <= 0 || seg.end_ms < viewStartMs || seg.start_ms > viewEndMs) return null;
                    const color = getSegColor(seg);
                    const isSelected = selectedSeg === i;
                    return (
                      <div key={i} role="option" aria-selected={isSelected}
                        aria-label={`Segment ${i + 1}: ${seg.label || "unlabeled"}, ${(seg.start_ms / 1000).toFixed(1)}s to ${(seg.end_ms / 1000).toFixed(1)}s`}
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); const next = isSelected ? null : i; setSelectedSeg(next); if (next !== null && segRowRefs.current[next]) segRowRefs.current[next].scrollIntoView({ behavior: "smooth", block: "nearest" }); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const next = isSelected ? null : i; setSelectedSeg(next); if (next !== null && segRowRefs.current[next]) segRowRefs.current[next].scrollIntoView({ behavior: "smooth", block: "nearest" }); } }}
                        style={{
                          position: "absolute", left: `${leftPct}%`, width: `${w}%`, top: 0, bottom: 0,
                          backgroundColor: color, opacity: seg.source === "propagated" ? 0.55 : 0.8,
                          borderRight: "1px solid white", display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", userSelect: "none",
                          outline: isSelected ? "2px solid #333" : "none", outlineOffset: -1, zIndex: isSelected ? 2 : 1,
                        }}>
                        {/* Left edge drag handle */}
                        <div onMouseDown={(e) => handleSegEdgeDown(e, i, "left")}
                          style={{ position: "absolute", left: -3, top: 0, bottom: 0, width: 6, cursor: "ew-resize", zIndex: 3 }} />
                        {/* Right edge drag handle */}
                        <div onMouseDown={(e) => handleSegEdgeDown(e, i, "right")}
                          style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 6, cursor: "ew-resize", zIndex: 3 }} />
                        <span style={{ fontSize: w > 4 ? 8 : 0, color: "white", fontWeight: 700, pointerEvents: "none",
                          textShadow: "0 1px 2px rgba(0,0,0,0.4)", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {seg.label || ""}{seg.source === "propagated" && " ~"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Legend + save status */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
                  {Object.entries(labelColorMap).map(([lbl, color]) => (
                    <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} aria-hidden="true" />
                      <span style={{ fontSize: 10, color: "#6b6a63" }}>{lbl}</span>
                    </div>
                  ))}
                  {segments.some(s => !s.label) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: UNLABELED_COLOR, flexShrink: 0 }} aria-hidden="true" />
                      <span style={{ fontSize: 10, color: "#b0afa8" }}>unlabeled</span>
                    </div>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "'DM Mono', monospace",
                    color: segSaveStatus === "failed" ? "#EF4444" : segSaveStatus === "saved" ? "#1D9E75" : "#b0afa8",
                    cursor: segSaveStatus === "failed" ? "pointer" : "default" }}
                    onClick={segSaveStatus === "failed" ? saveSegments : undefined}
                    title={segSaveStatus === "failed" ? `${segSaveError} — click to retry` : ""}>
                    {segSaveStatus === "saving" && "Saving..."}
                    {segSaveStatus === "saved" && "Saved"}
                    {segSaveStatus === "failed" && "Save failed — retry"}
                  </span>
                </div>

                {/* ═══ Segment table (edit surface) ═══ */}
                <div style={{ border: "1px solid #e8e7e4", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "20px 60px 60px 1fr 28px 56px", gap: 0,
                    padding: "4px 8px", background: "#f4f3f0", borderBottom: "1px solid #e8e7e4",
                    fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#b0afa8", textTransform: "uppercase", letterSpacing: "0.06em" }}
                    role="row" aria-label="Segment table header">
                    <span aria-hidden="true" /><span>Start</span><span>End</span><span>Label</span><span aria-hidden="true" /><span>Actions</span>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }} role="table" aria-label="Segment list">
                    {segments.map((seg, i) => {
                      const color = getSegColor(seg);
                      const isSelected = selectedSeg === i;
                      return (
                        <div key={i} ref={(el) => { segRowRefs.current[i] = el; }} role="row" aria-selected={isSelected} tabIndex={0}
                          onClick={() => setSelectedSeg(isSelected ? null : i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSeg(isSelected ? null : i); }
                            if (e.key === "ArrowDown" && i < segments.length - 1) { e.preventDefault(); setSelectedSeg(i + 1); segRowRefs.current[i + 1]?.focus(); }
                            if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); setSelectedSeg(i - 1); segRowRefs.current[i - 1]?.focus(); }
                            if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSegment(i); }
                          }}
                          style={{
                            display: "grid", gridTemplateColumns: "20px 60px 60px 1fr 28px 56px", gap: 0,
                            padding: "3px 8px", alignItems: "center",
                            background: isSelected ? "#f0edff" : i % 2 === 0 ? "#fff" : "#fafaf8",
                            borderBottom: "1px solid #f0efec", cursor: "pointer", outline: "none",
                            boxShadow: isSelected ? "inset 2px 0 0 #8B5CF6" : "none",
                          }}>
                          <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, flexShrink: 0,
                            border: seg.source === "propagated" ? "2px dashed rgba(0,0,0,0.2)" : "2px solid rgba(0,0,0,0.1)" }}
                            title={seg.source === "propagated" ? "Propagated" : seg.source === "manual" ? "Manual" : "Unlabeled"} />
                          <input type="number" step="0.1" min="0" aria-label={`Segment ${i + 1} start`}
                            value={(seg.start_ms / 1000).toFixed(1)} onClick={(e) => e.stopPropagation()}
                            onChange={(e) => resizeSegment(i, "start", parseFloat(e.target.value) || 0)}
                            style={{ width: 52, fontSize: 10, fontFamily: "'DM Mono', monospace", border: "1px solid #e8e7e4", borderRadius: 3, padding: "2px 4px", background: "#fff", outline: "none" }} />
                          <input type="number" step="0.1" min="0" aria-label={`Segment ${i + 1} end`}
                            value={(seg.end_ms / 1000).toFixed(1)} onClick={(e) => e.stopPropagation()}
                            onChange={(e) => resizeSegment(i, "end", parseFloat(e.target.value) || 0)}
                            style={{ width: 52, fontSize: 10, fontFamily: "'DM Mono', monospace", border: "1px solid #e8e7e4", borderRadius: 3, padding: "2px 4px", background: "#fff", outline: "none" }} />
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                            {classes.length > 0 ? (
                              <select value={seg.label || ""} aria-label={`Segment ${i + 1} label`}
                                onChange={(e) => relabelSegment(i, e.target.value)}
                                style={{ fontSize: 10, border: "1px solid #e8e7e4", borderRadius: 3, padding: "2px 4px", background: "#fff", outline: "none", maxWidth: 110 }}>
                                <option value="">— unlabeled —</option>
                                {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                            ) : (
                              <input type="text" placeholder="label..." value={seg.label || ""} aria-label={`Segment ${i + 1} label`}
                                onChange={(e) => relabelSegment(i, e.target.value)}
                                style={{ width: 80, fontSize: 10, border: "1px solid #e8e7e4", borderRadius: 3, padding: "2px 4px", background: "#fff", outline: "none", fontFamily: "'DM Mono', monospace" }} />
                            )}
                            {seg.source === "propagated" && <span title="Auto-propagated" style={{ fontSize: 9, color: "#b0afa8" }}>~</span>}
                          </div>
                          <button aria-label={`Delete segment ${i + 1}`} onClick={(e) => { e.stopPropagation(); deleteSegment(i); }}
                            disabled={segments.length <= 1}
                            style={{ fontSize: 11, color: segments.length > 1 ? "#EF4444" : "#ddd", background: "none", border: "none", cursor: segments.length > 1 ? "pointer" : "not-allowed", padding: 0, lineHeight: 1 }}
                            title="Delete (merge into neighbor)">x</button>
                          <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                            <button aria-label={`Merge segment ${i + 1} up`} onClick={() => mergeWithPrev(i)} disabled={i === 0}
                              title="Merge with segment above"
                              style={{ fontSize: 9, color: i > 0 ? "#8B5CF6" : "#ddd", background: "none", border: "1px solid " + (i > 0 ? "rgba(139,92,246,0.25)" : "#eee"), borderRadius: 3, padding: "1px 3px", cursor: i > 0 ? "pointer" : "not-allowed", lineHeight: 1 }}>
                              ↑</button>
                            <button aria-label={`Merge segment ${i + 1} down`} onClick={() => mergeWithNext(i)} disabled={i >= segments.length - 1}
                              title="Merge with segment below"
                              style={{ fontSize: 9, color: i < segments.length - 1 ? "#8B5CF6" : "#ddd", background: "none", border: "1px solid " + (i < segments.length - 1 ? "rgba(139,92,246,0.25)" : "#eee"), borderRadius: 3, padding: "1px 3px", cursor: i < segments.length - 1 ? "pointer" : "not-allowed", lineHeight: 1 }}>
                              ↓</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Propagate + status */}
                {(() => {
                  const nManual = segments.filter(s => s.source === "manual" && s.label).length;
                  const nLabeled = segments.filter(s => s.label).length;
                  const nUnlabeled = segments.length - nLabeled;
                  const canPropagate = nManual >= 1 && nUnlabeled > 0 && segments.some(s => s.embedding?.length > 0);
                  return (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {canPropagate && (
                        <button onClick={handlePropagate} disabled={propagating}
                          style={{ fontSize: 10, color: "#1D9E75", fontWeight: 600, border: "1px solid rgba(29,158,117,0.3)", borderRadius: 4, padding: "4px 12px", background: "none", cursor: propagating ? "wait" : "pointer" }}>
                          {propagating ? "Propagating..." : `Propagate labels (${nUnlabeled} unlabeled)`}
                        </button>
                      )}
                      <span style={{ fontSize: 9, color: "#b0afa8" }}>
                        {nLabeled}/{segments.length} labeled
                        {nManual > 0 && ` · ${nManual} manual seed${nManual > 1 ? "s" : ""}`}
                      </span>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Empty state when no segments */}
            {segments.length === 0 && ev.datasetId && ev.duration > 0 && (
              <div style={{ padding: "12px 0", textAlign: "center" }}>
                <span style={{ fontSize: 10, color: "#b0afa8", fontFamily: "'DM Mono', monospace" }}>
                  Run Auto-segment to detect activity boundaries, or drag on the signal to create a manual segment
                </span>
              </div>
            )}
          </div>
        )}

        {/* Per-channel stats */}
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Per-channel stats</p>
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
                  <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: chColor(axis, axes.indexOf(axis)), padding: "3px 4px", fontWeight: 600 }}>{axis}</td>
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
            <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Beta</span>
          </button>
        )}
      </div>

      {/* ── Drag label creation popup ─────────────────────────────────────── */}
      {dragPopup && (
        <div
          style={{
            position: "fixed", zIndex: 200,
            left: Math.max(8, Math.min(dragPopup.clientX - 104, (typeof window !== "undefined" ? window.innerWidth : 800) - 224)),
            top:  Math.max(8, dragPopup.clientY - 110),
            background: "#ffffff", border: "1px solid #ebeae5", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.13)", padding: "12px 14px", width: 208,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#b0afa8", marginBottom: 8, lineHeight: 1.4 }}>
            {(dragPopup.s_ms / 1000).toFixed(2)}s → {((dragPopup.s_ms + dragPopup.dur_ms) / 1000).toFixed(2)}s
            <span style={{ marginLeft: 6, color: "#c0bfb8" }}>({(dragPopup.dur_ms / 1000).toFixed(2)}s)</span>
          </p>
          <input
            ref={dragPopupInputRef}
            list="dp-label-list"
            value={dragPopupName}
            onChange={(e) => setDragPopupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  handleCreateLabel(dragPopupName);
              if (e.key === "Escape") { setDragPopup(null); setDragStart(null); setDragEnd(null); }
            }}
            placeholder="Label name…"
            style={{
              width: "100%", fontFamily: "'DM Mono', monospace", fontSize: 11,
              border: "1.5px solid #ebeae5", borderRadius: 6, padding: "6px 8px",
              outline: "none", boxSizing: "border-box", marginBottom: 10, display: "block",
              background: "#fafaf8",
            }}
            onFocus={(e) => { e.target.style.borderColor = "#0a0a0a"; }}
            onBlur={(e)  => { e.target.style.borderColor = "#ebeae5"; }}
            autoFocus
          />
          <datalist id="dp-label-list">
            {[...new Set(segments.map((s) => s.label).filter(Boolean))].map((n) => (
              <option key={n} value={n} />
            ))}
            {classes.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => handleCreateLabel(dragPopupName)}
              disabled={!dragPopupName.trim()}
              style={{
                flex: 1, background: "#0a0a0a", color: "#ffffff", border: "none",
                borderRadius: 6, padding: "6px 0", fontSize: 11,
                fontFamily: "'Syne', sans-serif", fontWeight: 600,
                cursor: dragPopupName.trim() ? "pointer" : "not-allowed",
                opacity: dragPopupName.trim() ? 1 : 0.35,
              }}
            >Create</button>
            <button
              onClick={() => setDragPopup(null)}
              style={{
                flex: 1, background: "none", color: "#b0afa8",
                border: "1px solid #ebeae5", borderRadius: 6, padding: "6px 0", fontSize: 11,
                fontFamily: "'Syne', sans-serif", cursor: "pointer",
              }}
            >Cancel</button>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Format guide (collapsible) ───────────────────────────────────────────────

function FormatGuide() {
  const [open, setOpen] = useState(false);
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
        <div className="mt-2 border border-gray-200 rounded-lg p-4 bg-white text-[11px] text-gray-600 space-y-3 leading-relaxed">
          <div>
            <p className="text-xs text-gray-800 font-semibold mb-1">CSV with header row (recommended)</p>
            <p>First row = column names. One column must be the timestamp (named <code className="text-accent">timestamp</code>, <code className="text-accent">time</code>, or <code className="text-accent">ts</code>). All other numeric columns become signal channels.</p>
            <pre className="mt-1.5 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-[10px] text-accent font-mono overflow-x-auto">
{`timestamp,ppg,accx,accy,accz
0,0.0248,0.0741,0.3170,9.8411
20,0.0854,-0.1288,0.2653,9.8502
40,0.1479,0.0432,0.1837,9.8023`}
            </pre>
          </div>
          <div>
            <p className="text-xs text-gray-800 font-semibold mb-1">Any number of channels</p>
            <p>1 channel (PPG only), 3 channels (accel), 6 channels (accel + gyro) — all work. Channel names come from the header and flow through the entire pipeline (features, explorer, export).</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 font-semibold mb-1">Timestamp handling</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Absolute (0, 20, 40, …) or interval (20, 20, 20, …) — auto-detected.</li>
              <li>Unit auto-detected: the unit (µs, ms, or s) that yields a plausible rate (1–5000 Hz) is chosen automatically.</li>
              <li>If no timestamp column is found, a default rate of 100 Hz is assumed (shown as a note).</li>
            </ul>
          </div>
          <div>
            <p className="text-xs text-gray-800 font-semibold mb-1">Headerless files</p>
            <p>If all values are numeric (no header row), the parser assigns generic column names. 4-column files are treated as <code className="text-accent">timestamp, a_x, a_y, a_z</code> for backward compatibility.</p>
          </div>
          <div>
            <p className="text-xs text-gray-800 font-semibold mb-1">Quality checks (automatic)</p>
            <p>Each file is checked for: flatlines, clipping, NaN/Inf, timestamp gaps, missing channels. Issues are flagged and failed files are quarantined from training by default.</p>
          </div>
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
  dataMode = "continuous",
}) {
  // fileEntries: {file, name, parsed, classId, detected, error, note, reading}
  const [fileEntries,    setFileEntries]    = useState([]);
  const [uploading,      setUploading]      = useState(false);
  const [uploadError,    setUploadError]    = useState(null);
  const [uploadSuccess,  setUploadSuccess]  = useState(null);
  const [dragOver,       setDragOver]       = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [poolTab,         setPoolTab]         = useState("train"); // "train" | "test"
  const [splitting,       setSplitting]       = useState(false);
  const [splitMsg,        setSplitMsg]        = useState(null);
  const inputRef = useRef(null);

  // ── Paste mode ───────────────────────────────────────────────────────────────
  const [inputMode,      setInputMode]      = useState("file");  // "file" | "paste"
  const [pasteText,      setPasteText]      = useState("");
  const [pasteClassId,   setPasteClassId]   = useState(activeClassId ?? classes[0]?.id ?? null);
  const [pasteUnit,      setPasteUnit]      = useState("us");   // "us" | "ms" | "s"
  const [pasteHz,        setPasteHz]        = useState("");     // optional Hz override (string)
  const [pasteError,     setPasteError]     = useState(null);

  // Sync pool assignments from project-index (by datasetId OR by filename fallback)
  function syncPoolsFromIndex() {
    if (!projectId) return Promise.resolve();
    return fetch(`${API_BASE_URL}/project-index/${projectId}`)
      .then((r) => r.ok ? r.json() : { datasets: [] })
      .then((d) => {
        const datasets = d.datasets || [];
        if (datasets.length === 0) return;
        // Build lookup by id AND by filename
        const byId = {};
        const byName = {};
        datasets.forEach((ds) => {
          byId[ds.id] = { pool: ds.pool || "train", datasetId: ds.id };
          byName[ds.source_filename] = { pool: ds.pool || "train", datasetId: ds.id };
        });
        setEvents((prev) => prev.map((ev) => {
          // Match by datasetId first, then by filename — also backfill missing datasetId
          if (ev.datasetId && byId[ev.datasetId]) {
            return { ...ev, pool: byId[ev.datasetId].pool };
          }
          if (ev.filename && byName[ev.filename]) {
            const match = byName[ev.filename];
            return { ...ev, pool: match.pool, datasetId: ev.datasetId || match.datasetId };
          }
          return ev;
        }));
      })
      .catch(() => {}); // network errors are non-fatal
  }

  // Hydrate pool assignments on mount (only when events exist)
  useEffect(() => {
    if (events.length > 0) syncPoolsFromIndex();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, events.length]);

  // Auto-split handler
  async function handleAutoSplit() {
    setSplitting(true);
    setSplitMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/datasets/auto-split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, test_ratio: 0.2 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSplitMsg(data.detail || "Auto-split failed");
        return;
      }
      // Sync pools from the index (most reliable — matches by id and filename)
      syncPoolsFromIndex();
      const warnings = data.warnings || [];
      setSplitMsg(warnings.length > 0 ? warnings.join("; ") : "Split complete");
      setTimeout(() => setSplitMsg(null), 4000);
    } catch (err) {
      setSplitMsg(err.message || "Auto-split failed");
    } finally {
      setSplitting(false);
    }
  }

  // Move a single recording to a different pool
  async function moveToPool(ev, targetPool) {
    if (!ev.datasetId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/datasets/${ev.datasetId}/pool`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool: targetPool }),
      });
      if (res.ok) {
        setEvents((prev) => prev.map((e) =>
          e.id === ev.id ? { ...e, pool: targetPool } : e
        ));
      }
    } catch { /* ignore */ }
  }

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
            note = "Pre-processed feature file — SensorForge needs raw sensor time series data";
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
        // For continuous mode: recordings are classless (labeled via segments)
        const isContinuous = dataMode === "continuous";
        const matchedCls = isContinuous ? null : (
          classes.find((c) => c.name === ev.class_label) ??
          classes.find((c) => c.name.toLowerCase() === (ev.class_label || "").toLowerCase())
        );
        return {
          id:            ev.id,
          datasetId:     ev.dataset_id ?? null,
          hasVideo:      ev.has_video  ?? false,
          classId:       matchedCls?.id    ?? null,
          className:     isContinuous ? "Recording" : (matchedCls?.name ?? "Unassigned"),
          classColor:    matchedCls?.color ?? "#b0afa8",
          waveform:      ev.waveform_az ?? [],
          waveColor:     AXIS_COLORS.az,
          duration:      ev.duration_ms,
          timestamp:     new Date().toLocaleTimeString(),
          snapshot:      (() => {
            // Build snapshot from actual channel names, falling back to ax/ay/az
            const chs = ev.channels || [];
            const snap = {};
            const waveforms = [ev.waveform_ax, ev.waveform_ay, ev.waveform_az];
            if (chs.length > 0) {
              chs.forEach((ch, i) => { snap[ch] = waveforms[i] ?? []; });
            } else {
              snap.ax = ev.waveform_ax ?? []; snap.ay = ev.waveform_ay ?? []; snap.az = ev.waveform_az ?? [];
            }
            return snap;
          })(),
          channels:      ev.channels || [],
          filename:      ev.filename,
          notes:         ev.notes ?? [],
          autoAssigned:  true,
          detectedLabel: null,
          sampleRateHz:  ev.sample_rate_hz ?? fileRateMap[ev.filename] ?? null,
          pool:          ev.pool ?? "train",
          qualityStatus: ev.quality_status ?? "pass",
          qualityFlags:  ev.quality_flags ?? [],
          quarantined:   ev.quarantined ?? false,
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

  // ── Paste submit — clean serial text → File → existing upload pipeline ──────
  function handlePasteSubmit() {
    setPasteError(null);
    const raw = pasteText.trim();
    if (!raw) { setPasteError("Paste some data first."); return; }
    const hzOverride = pasteHz.trim() ? parseFloat(pasteHz) : null;
    if (hzOverride !== null && (isNaN(hzOverride) || hzOverride <= 0)) {
      setPasteError("Sample rate override must be a positive number (e.g. 100).");
      return;
    }
    let cleanedCsv;
    try {
      cleanedCsv = cleanSerialText(raw, pasteUnit, hzOverride);
    } catch (err) {
      setPasteError(err.message);
      return;
    }
    // Wrap as a File so it flows through the identical file-upload pipeline
    const blob = new Blob([cleanedCsv], { type: "text/plain" });
    const file = new File([blob], "pasted-data.csv", { type: "text/plain" });
    const entry = {
      file, name: "pasted-data.csv",
      parsed: null,
      classId:  pasteClassId ?? classes[0]?.id ?? null,
      detected: true,
      error: null, note: null, reading: true,
    };
    setFileEntries((prev) => [...prev, entry]);
    // Trigger CSV read (same as file upload)
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseCSVText(e.target.result);
      setFileEntries((prev) => {
        const idx = prev.findIndex((p) => p.file === file);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          parsed:  result && !result.error ? result : null,
          error:   result?.error ? "Could not parse — expected CSV with timestamp + signal columns" : (!result ? "Parse failed" : null),
          reading: false,
        };
        return updated;
      });
    };
    reader.readAsText(file);
    // Switch back to file view so the card appears and user can submit
    setPasteText("");
    setInputMode("file");
  }

  // Derive the selected event object for the detail panel
  const selectedEvent = selectedEventId ? events.find((e) => e.id === selectedEventId) : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3" style={{ position: "relative" }}>

      {/* ── File detail overlay — shown when an event row is clicked ──────── */}
      {/* In "samples" mode: no detail panel (pre-labeled files don't need labeling) */}
      {selectedEvent && dataMode === "continuous" && (
        <FileDetailPanel
          ev={selectedEvent}
          allEvents={events}
          onClose={() => setSelectedEventId(null)}
          onAskCopilot={onAskCopilot}
          classes={classes}
          setClasses={setClasses}
        />
      )}

      {/* ── Input mode tabs ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex gap-0 border-b border-gray-700">
        {[["file", "Upload file"], ["paste", "Paste data"]].map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => { setInputMode(mode); setPasteError(null); }}
            className={`text-xs px-3 py-1.5 font-medium transition-colors border-b-2 -mb-px ${
              inputMode === mode
                ? "border-accent text-accent"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >{label}</button>
        ))}
      </div>

      {inputMode === "paste" ? (
        /* ── Paste data panel ──────────────────────────────────────────────── */
        <div className="flex-shrink-0 flex flex-col gap-3">
          <textarea
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setPasteError(null); }}
            placeholder={`Paste raw Serial Monitor output here, e.g.\n14:56:18.403 ->  0,0.12,-0.04,9.81\n14:56:18.413 ->  10000,0.13,-0.04,9.80\n…\nArduino prefixes and boot messages are stripped automatically.`}
            className="w-full text-xs font-mono text-gray-300 bg-gray-900 border border-gray-700 rounded-lg p-3 resize-y focus:outline-none focus:border-accent placeholder-gray-600"
            style={{ minHeight: 130, maxHeight: 300 }}
            spellCheck={false}
          />

          {/* Unit + Hz row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 flex-shrink-0">Timestamp unit:</span>
              <select
                value={pasteUnit}
                onChange={(e) => setPasteUnit(e.target.value)}
                className="text-xs border border-gray-700 rounded px-2 py-1 text-gray-300 bg-gray-900 focus:outline-none focus:border-accent"
              >
                <option value="us">Microseconds (µs) — Arduino/ESP32</option>
                <option value="ms">Milliseconds (ms)</option>
                <option value="s">Seconds (s)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 flex-shrink-0">Rate Hz:</span>
              <input
                type="number"
                min="1"
                placeholder="auto"
                value={pasteHz}
                onChange={(e) => { setPasteHz(e.target.value); setPasteError(null); }}
                className="text-xs border border-gray-700 rounded px-2 py-1 text-gray-300 bg-gray-900 focus:outline-none focus:border-accent w-20 placeholder-gray-600"
                title="Optional: override computed sample rate (Hz)"
              />
            </div>
          </div>

          {/* Class + submit row */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-gray-500 flex-shrink-0">Class:</span>
              <select
                value={pasteClassId ?? ""}
                onChange={(e) => setPasteClassId(e.target.value)}
                className="text-xs border border-gray-700 rounded px-2 py-1 text-gray-300 bg-gray-900 focus:outline-none focus:border-accent flex-1 min-w-0"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                {classes.length === 0 && <option value="">No classes yet</option>}
              </select>
            </div>
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim() || classes.length === 0}
              className="text-xs font-semibold px-4 py-1.5 rounded bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              Parse &amp; add
            </button>
          </div>

          {pasteError && (
            <p className="text-[11px] text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2 leading-snug">
              {pasteError}
            </p>
          )}

          <p className="text-[10px] text-gray-600 leading-relaxed">
            Strips Arduino Serial Monitor timestamps (<code className="text-gray-500">HH:MM:SS.mmm →</code>),
            boot messages, and marker lines. Expects rows: <code className="text-gray-500">timestamp,value1,value2,...</code>.
            Timestamps are converted to µs deltas using the selected unit.
          </p>
        </div>
      ) : (
        /* ── Drop zone (existing) ──────────────────────────────────────────── */
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
            <p className="text-xs text-gray-400 mt-0.5">
              {dataMode === "continuous"
                ? "Upload one continuous recording — you'll segment & label it after adding"
                : "Upload CSV files for each class using the buttons in the Classes panel →"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              CSV with header row, or headerless <code className="text-gray-300">timestamp,v1,v2,...</code>
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
              href="/sample_data.csv"
              download="sample_data.csv"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-gray-300 hover:text-white underline transition-colors"
            >
              Download sample data →
            </a>
          </div>
        </div>
      )}

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
                  {assignedCls && !entry.error && dataMode !== "continuous" ? (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: assignedCls.color }} />
                      <span className="text-xs font-bold" style={{ color: assignedCls.color }}>{assignedCls.name}</span>
                    </div>
                  ) : null}
                  <p className="text-xs text-gray-400 truncate">{entry.name}</p>
                  {entry.error ? (
                    <p className="text-[10px] text-red-500 mt-0.5 leading-tight">{entry.error}</p>
                  ) : dataMode === "continuous" && entry.parsed ? (
                    <p className="text-[10px] text-gray-300 mt-0.5 tabular-nums">
                      {entry.parsed.rowCount} rows · {entry.parsed.durationMs} ms
                      {entry.parsed.sampleRateHz ? ` · ${entry.parsed.sampleRateHz} Hz` : ""}
                    </p>
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

                {/* Class selector — hidden in continuous mode */}
                {!entry.error && !entry.reading && dataMode !== "continuous" && (
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
          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 bg-gray-200/60 px-1.5 py-0.5 rounded">Beta</span>
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

      {/* ── Train / Test tabs + split summary + auto-split button ─────── */}
      {events.length > 0 && (() => {
        const trainEvents = events.filter((e) => (e.pool || "train") === "train");
        const testEvents  = events.filter((e) => (e.pool || "train") === "test");
        const total = events.length;
        const trainPct = total > 0 ? Math.round((trainEvents.length / total) * 100) : 0;
        const trainClasses = new Set(trainEvents.map((e) => e.className));
        const allClasses = [...new Set(events.map((e) => e.className))];
        const missingFromTrain = allClasses.filter((c) => !trainClasses.has(c));

        // Continuous mode splits at the window level (per segment), not the file
        // level — so the file-level Training/Test tabs + Auto-split don't apply.
        if (dataMode === "continuous") return null;

        return (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 mb-1 flex-shrink-0">
              <div className="flex gap-0">
                {[
                  { id: "train", label: "Training data", count: trainEvents.length },
                  { id: "test",  label: "Test data",     count: testEvents.length },
                ].map(({ id, label, count }) => (
                  <button key={id} onClick={() => setPoolTab(id)}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                      poolTab === id ? "border-accent text-accent" : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}>
                    {label} <span className="tabular-nums text-[10px] ml-1">({count})</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {trainPct}% / {100 - trainPct}%
                </span>
                <button onClick={handleAutoSplit} disabled={splitting}
                  className="text-[10px] font-semibold text-accent border border-accent/30 rounded px-2 py-1 hover:bg-accent/5 transition-colors disabled:opacity-50">
                  {splitting ? "Splitting…" : "Auto-split (80/20)"}
                </button>
              </div>
            </div>
            {splitMsg && (
              <p className="text-[10px] text-accent px-2 py-1 flex-shrink-0">{splitMsg}</p>
            )}
            {missingFromTrain.length > 0 && testEvents.length > 0 && (
              <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 flex-shrink-0 mb-1">
                <span className="flex-shrink-0">⚠</span>
                <span>Class{missingFromTrain.length > 1 ? "es" : ""} <strong>{missingFromTrain.join(", ")}</strong> ha{missingFromTrain.length > 1 ? "ve" : "s"} no training data.</span>
              </div>
            )}
          </>
        );
      })()}

      {/* ── Event list (filtered by pool tab) ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-0.5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 border border-dashed border-gray-200 rounded gap-1">
            <span className="text-gray-300 text-xs">No events yet</span>
            <span className="text-gray-200 text-xs">Upload CSV files to add events</span>
          </div>
        ) : (
          events
            .filter((ev) => (ev.pool || "train") === poolTab)
            .map((ev) => {
            const isSelected = ev.id === selectedEventId;
            const otherPool = poolTab === "train" ? "test" : "train";
            return (
              <div
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id)}
                className="flex items-center gap-2 px-3 py-2 border rounded transition-colors bg-white"
                style={{
                  borderColor:  isSelected ? "#0a0a0a" : "#f0efe9",
                  cursor:       "pointer",
                  background:   isSelected ? "#f8f7f3" : "#ffffff",
                }}
              >
                <WaveformThumb data={ev.waveform} color={ev.waveColor} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Continuous recordings are classless — labels come from segments. */}
                    {dataMode === "continuous" ? (
                      <span className="text-xs font-semibold text-gray-500 flex-shrink-0">Recording</span>
                    ) : (
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
                    )}
                    <span className="text-xs text-gray-400 tabular-nums">{ev.duration} ms</span>
                  </div>
                  {ev.filename && (
                    <p className="text-[10px] text-gray-300 mt-0.5 truncate">{ev.filename}</p>
                  )}
                  {ev.qualityStatus && ev.qualityStatus !== "pass" && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                        ev.qualityStatus === "fail" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                      }`}>
                        {ev.qualityStatus === "fail" ? "FAIL" : "WARN"}
                      </span>
                      <span className="text-[9px] text-gray-400 truncate">
                        {(ev.qualityFlags || []).slice(0, 1).map(f => f.detail).join("; ")}
                      </span>
                    </div>
                  )}
                </div>
                {/* Quarantine toggle */}
                {ev.quarantined && (
                  <button onClick={(e) => {
                    e.stopPropagation();
                    if (!ev.datasetId) return;
                    fetch(`${API_BASE_URL}/datasets/${ev.datasetId}/quarantine`, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ quarantined: false }),
                    }).then((r) => r.ok && setEvents((prev) => prev.map((e2) =>
                      e2.id === ev.id ? { ...e2, quarantined: false } : e2
                    )));
                  }} className="text-[9px] text-red-400 hover:text-accent border border-red-200 hover:border-accent/40 rounded px-1.5 py-0.5 transition-colors flex-shrink-0 whitespace-nowrap"
                    title="Include in training despite quality issues">
                    Include
                  </button>
                )}
                {/* Move to other pool — file-level split is samples-mode only
                    (continuous mode splits at the window level per segment). */}
                {dataMode !== "continuous" && (ev.datasetId ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); moveToPool(ev, otherPool); }}
                    aria-label={`Move ${ev.filename || ev.id} to ${otherPool}`}
                    className="text-[9px] text-gray-400 hover:text-accent border border-gray-200 hover:border-accent/40 rounded px-1.5 py-0.5 transition-colors flex-shrink-0 whitespace-nowrap"
                  >
                    → {otherPool === "test" ? "Test" : "Train"}
                  </button>
                ) : (
                  <span className="text-[9px] text-gray-300 flex-shrink-0">no index</span>
                ))}
                <button
                  onClick={(e) => { e.stopPropagation(); setEvents((prev) => prev.filter((e2) => e2.id !== ev.id)); }}
                  className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none px-1 flex-shrink-0"
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

export default function CollectScreen({ config, setConfig, projectId, classes, setClasses, activeClassId, setActiveClassId, events, setEvents, analyzeResult, onAnalysisReady, chatHistory, setChatHistory, onApplyAction }) {
  const isFileUpload = (config?.connectionType ?? "").toLowerCase().includes("file");
  const dataMode = config?.dataMode || "";
  const collectMethod = config?.collectMethod || "upload";

  // State (classes/activeClassId are now props from App.js for persistence)
  const [newClassName,    setNewClassName]    = useState("");
  const [showAddClass,    setShowAddClass]    = useState(false);
  const [deletingClassId, setDeletingClassId] = useState(null);

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
        body:    JSON.stringify({ message, project_id: projectId, screen: "collect", pipeline_config: null, use_data_tools: true }),
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
        hasVideo:      ev.has_video  ?? false,
        classId:       cls.id,
        className:     cls.name,
        classColor:    cls.color,
        waveform:      ev.waveform_az ?? [],
        waveColor:     AXIS_COLORS.az,
        duration:      ev.duration_ms,
        timestamp:     new Date().toLocaleTimeString(),
        snapshot:      (() => {
          const chs = ev.channels || [];
          const snap = {};
          const waveforms = [ev.waveform_ax, ev.waveform_ay, ev.waveform_az];
          if (chs.length > 0) { chs.forEach((ch, i) => { snap[ch] = waveforms[i] ?? []; }); }
          else { snap.ax = ev.waveform_ax ?? []; snap.ay = ev.waveform_ay ?? []; snap.az = ev.waveform_az ?? []; }
          return snap;
        })(),
        channels:      ev.channels || [],
        filename:      ev.filename,
        notes:         ev.notes ?? [],
        autoAssigned:  false,
        detectedLabel: cls.name,
        sampleRateHz:  ev.sample_rate_hz ?? (classSr && classSr > 0 ? classSr : null),
        pool:          ev.pool ?? "train",
        qualityStatus: ev.quality_status ?? "pass",
        qualityFlags:  ev.quality_flags ?? [],
        quarantined:   ev.quarantined ?? false,
      }));
      setEvents((prev) => [...newEvents, ...prev]);
    } catch (err) {
      setClassUploadErr((prev) => ({ ...prev, [classId]: err.message }));
    } finally {
      setClassUploading((prev) => ({ ...prev, [classId]: false }));
    }
  }


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

  // ── Class management ────────────────────────────────────────────────────────

  function addNewClass() {
    const name = newClassName.trim();
    if (!name) return;
    const id    = `cls-${Date.now()}`;
    const color = CLASS_PALETTE[classes.length % CLASS_PALETTE.length];
    const next  = [...classes, { id, name, color, description: "" }];
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

  // ── Mode picker helper ──────────────────────────────────────────────────────
  function setDataMode(mode) {
    setConfig((c) => ({ ...c, dataMode: mode }));
    if (mode !== dataMode && events.length > 0) {
      setEvents([]);  // reset file list on mode change
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // If dataMode not set (legacy project or skipped), default to samples
  const effectiveDataMode = dataMode || "samples";

  return (
    <div className="flex gap-6 h-full">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      {collectMethod === "serial" ? (
        <SerialCaptureScreen
          projectId={projectId}
          classes={classes}
          events={events}
          setEvents={setEvents}
        />
      ) : effectiveDataMode === "continuous" && !isFileUpload ? (
        <LiveCaptureMode
          config={config}
          events={events}
          setEvents={setEvents}
          activeClassId={activeClassId}
          classes={classes}
          analyzeResult={analyzeResult}
        />
      ) : (
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
          dataMode={effectiveDataMode}
        />
      )}

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-4 min-h-0 overflow-hidden">

        {/* Mode badge + change link */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest">
            {effectiveDataMode === "continuous" ? "Continuous" : "Pre-labeled"}
          </span>
          <button onClick={() => setDataMode("")}
            className="text-[10px] text-gray-400 hover:text-accent transition-colors">
            Change mode
          </button>
        </div>

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
            {effectiveDataMode === "continuous" ? (
              /* ── Continuous mode: segment-derived class stats ── */
              classes.length > 0 ? classes.map((cls) => (
                <div key={cls.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cls.color }} />
                    <span className="text-xs font-semibold text-gray-700">{cls.name}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">segment label</span>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-[10px] text-gray-300">Labels derived from segments</p>
                  <p className="text-[10px] text-gray-300 mt-1">Open a recording and label segments</p>
                </div>
              )
            ) : (
            /* ── Samples mode: per-file class counters (original) ── */
            classes.map((cls) => {
              const count  = events.filter((e) => e.classId === cls.id).length;
              const pct    = Math.min(100, (count / TARGET_COUNT) * 100);
              const active = cls.id === activeClassId;
              const isDeleting = deletingClassId === cls.id;
              return (
                <div key={cls.id} className={`transition-colors ${active ? "bg-accent/5" : ""}`}>
                  {isDeleting ? (
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
                    <div className="relative group/cls">
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
                        {/* Gesture description — shown when class is active */}
                        {active && (
                          <input
                            placeholder="describe this gesture… (helps VLM auto-label)"
                            value={cls.description ?? ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              setClasses(classes.map((c) =>
                                c.id === cls.id ? { ...c, description: e.target.value } : c
                              ));
                            }}
                            className="mt-2 w-full text-[10px] text-gray-600 bg-white border border-gray-200
                                       rounded px-2 py-1 focus:outline-none focus:border-accent
                                       placeholder:text-gray-300"
                          />
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
            })
            )}
          </div>
        </div>

        {/* ── Copilot panel — full height ─────────────────────────────────── */}
        <div className="flex-1 min-h-0 border border-gray-200 rounded-lg overflow-hidden flex flex-col bg-gray-50">
          <div className="flex-1 min-h-0 flex flex-col p-3">
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
              grow
            />
          </div>
        </div>
      </div>
    </div>
  );
}
