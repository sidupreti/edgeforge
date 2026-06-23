/**
 * RecordingsScreen — standalone data-quality and CV-accuracy tool.
 *
 * NOT part of the main Collect → Train → Validate → Export flow.
 * Use this to upload continuous labeled recordings and verify that your
 * data separates cleanly (GroupKFold cross-validation accuracy) BEFORE
 * committing to the full pipeline.
 *
 * Endpoints used:
 *   POST /recordings/upload          — upload one labeled CSV
 *   GET  /recordings?project_id=...  — list recordings for this project
 *   GET  /recordings/{id}/signal     — fetch signal for plotting
 *   POST /pipeline/train             — window + GroupKFold CV
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import API_BASE_URL from "../config";

const AXIS_COLOR = { ax: "#1D9E75", ay: "#3B82F6", az: "#F59E0B" };

// ── Tiny SVG line chart ───────────────────────────────────────────────────────
function LineChart({ series, width = 540, height = 120 }) {
  if (!series.length || !series[0].y.length) return null;
  const allY   = series.flatMap((s) => s.y);
  const yMin   = Math.min(...allY);
  const yMax   = Math.max(...allY);
  const yRange = yMax - yMin || 1;
  const xLen   = series[0].y.length;
  const pad    = { top: 10, right: 8, bottom: 24, left: 38 };
  const W      = width  - pad.left - pad.right;
  const H      = height - pad.top  - pad.bottom;

  function toPath(ys) {
    return ys
      .map((v, i) => {
        const x = pad.left + (i / Math.max(xLen - 1, 1)) * W;
        const y = pad.top  + (1 - (v - yMin) / yRange) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const tArr   = series[0].t || [];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const i = Math.round(f * (xLen - 1));
    return { x: pad.left + f * W, label: tArr[i] != null ? `${tArr[i].toFixed(1)}s` : "" };
  });
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((v, i) => {
        const y = pad.top + (1 - (v - yMin) / yRange) * H;
        return <line key={i} x1={pad.left} y1={y} x2={pad.left + W} y2={y} stroke="#f0efe9" strokeWidth={1} />;
      })}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + H} stroke="#d8d7d0" strokeWidth={1} />
      <line x1={pad.left} y1={pad.top + H} x2={pad.left + W} y2={pad.top + H} stroke="#d8d7d0" strokeWidth={1} />
      {yTicks.map((v, i) => {
        const y = pad.top + (1 - (v - yMin) / yRange) * H;
        return (
          <text key={i} x={pad.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#8a8982">
            {v.toFixed(2)}
          </text>
        );
      })}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={pad.top + H + 14} textAnchor="middle" fontSize={9} fill="#8a8982">
          {t.label}
        </text>
      ))}
      {series.map((s) => (
        <path key={s.label} d={toPath(s.y)} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinejoin="round" />
      ))}
      {series.map((s, i) => (
        <g key={s.label} transform={`translate(${pad.left + 8 + i * 52}, ${pad.top + 6})`}>
          <line x1={0} y1={5} x2={14} y2={5} stroke={s.color} strokeWidth={2} />
          <text x={18} y={9} fontSize={9} fill="#6b6a63">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Signal row (fetched on row expand) ────────────────────────────────────────
function SignalRow({ recordingId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/recordings/${recordingId}/signal`)
      .then((r) => (r.ok ? r.json() : r.json().then((b) => Promise.reject(b.detail || "Error"))))
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [recordingId]);

  if (loading) return <div style={s.sigPlaceholder}>Loading signal…</div>;
  if (error)   return <div style={{ ...s.sigPlaceholder, color: "#ef4444" }}>{error}</div>;
  if (!data)   return null;

  const series = [
    { label: "ax", color: AXIS_COLOR.ax, y: data.ax, t: data.t_s },
    { label: "ay", color: AXIS_COLOR.ay, y: data.ay, t: data.t_s },
    { label: "az", color: AXIS_COLOR.az, y: data.az, t: data.t_s },
  ];

  return (
    <div style={s.sigWrap}>
      <div style={s.sigMeta}>
        {data.t_s.length} pts · {data.sample_rate_hz} Hz
      </div>
      <LineChart series={series} width={540} height={120} />
    </div>
  );
}

// ── Confusion matrix heatmap ──────────────────────────────────────────────────
function ConfusionMatrix({ labels, matrix }) {
  if (!labels.length) return null;
  const allVals = matrix.flat();
  const maxVal  = Math.max(...allVals, 1);

  function cellBg(ri, ci, val) {
    if (ri === ci) return `rgba(16,185,129,${0.15 + (val / maxVal) * 0.7})`;
    if (val === 0) return "#fafaf8";
    return `rgba(239,68,68,${0.1 + (val / maxVal) * 0.6})`;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={s.cmTable}>
        <thead>
          <tr>
            <th style={s.cmCorner} />
            {labels.map((l) => (
              <th key={l} style={s.cmHead}>
                <span style={s.cmHeadText}>{l}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={labels[ri]}>
              <th style={s.cmRowLabel}>{labels[ri]}</th>
              {row.map((val, ci) => (
                <td key={ci} style={{ ...s.cmCell, background: cellBg(ri, ci, val) }}>
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={s.cmLegend}>
        <span style={{ color: "#059669" }}>■ correct</span>
        <span style={{ color: "#dc2626", marginLeft: 12 }}>■ misclassified</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RecordingsScreen({ projectId }) {
  const [recordings, setRecordings] = useState([]);
  const [label,      setLabel]      = useState("");
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState(null);
  const [uploadOk,   setUploadOk]   = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [dragging,   setDragging]   = useState(false);
  const inputRef = useRef(null);

  // ── Training state ─────────────────────────────────────────────────────────
  const [windowMs,   setWindowMs]   = useState(1000);
  const [overlapPct, setOverlapPct] = useState(50);
  const [nFolds,     setNFolds]     = useState(5);
  const [training,   setTraining]   = useState(false);
  const [trainResult,setTrainResult]= useState(null);
  const [trainErr,   setTrainErr]   = useState(null);

  const refresh = useCallback(() => {
    fetch(`${API_BASE_URL}/recordings?project_id=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then(setRecordings)
      .catch(() => {});
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function doUpload(file) {
    if (!file?.name.toLowerCase().endsWith(".csv")) {
      setUploadErr("Only CSV files are supported."); return;
    }
    const lbl = label.trim();
    if (!lbl) { setUploadErr("Enter a gesture label before uploading."); return; }

    setUploading(true); setUploadErr(null); setUploadOk(null);
    const form = new FormData();
    form.append("file", file);
    form.append("label", lbl);
    form.append("project_id", projectId);

    try {
      const res  = await fetch(`${API_BASE_URL}/recordings/upload`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || res.statusText);
      setUploadOk(
        `"${file.name}" uploaded — ${body.n_samples} samples at ${body.sample_rate_hz} Hz (${body.duration_s.toFixed(2)} s)`
      );
      setLabel("");
      refresh();
    } catch (e) {
      setUploadErr(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function doTrain() {
    setTraining(true); setTrainErr(null); setTrainResult(null);
    try {
      const res  = await fetch(`${API_BASE_URL}/pipeline/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, window_ms: windowMs, overlap_pct: overlapPct, n_folds: nFolds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || res.statusText);
      setTrainResult(body);
    } catch (e) {
      setTrainErr(e.message);
    } finally {
      setTraining(false);
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  }

  const accuracy = trainResult ? Math.round(trainResult.overall_accuracy * 100) : null;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#ffffff" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 28px" }}>

        {/* ── Header callout ── */}
        <div style={s.callout}>
          <div style={s.calloutIcon}>
            <svg viewBox="0 0 20 20" fill="none" style={{ width: 16, height: 16 }}>
              <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 4v4m0 4h.01"
                stroke="#6b6a63" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p style={s.calloutText}>
            <strong>Data-quality check</strong> — upload continuous labeled recordings, inspect
            each signal, then run a GroupKFold cross-validation to estimate accuracy before
            starting the main Collect → Train → Export pipeline.
            Results here do <em>not</em> produce a deployable model.
          </p>
        </div>

        {/* ── Upload panel ── */}
        <Section label="Upload a recording">
          <div className="flex items-center gap-3 mb-3">
            <label style={s.fieldLabel}>Gesture label</label>
            <input
              style={s.input}
              placeholder="e.g. updown, wave, idle"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setUploadErr(null); setUploadOk(null); }}
            />
          </div>

          <div
            style={{ ...s.dropzone, ...(dragging ? s.dropzoneActive : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files[0]; if (f) doUpload(f); e.target.value = ""; }} />
            {uploading
              ? <span style={s.dropText}>Uploading…</span>
              : <span style={s.dropText}>Drop a CSV here, or <u style={{ cursor: "pointer" }}>click to browse</u></span>}
            <span style={s.dropHint}>Required columns: timestamp_us, ax, ay, az</span>
          </div>

          {uploadErr && <Banner type="error">{uploadErr}</Banner>}
          {uploadOk  && <Banner type="ok">{uploadOk}</Banner>}
        </Section>

        {/* ── Collected recordings table ── */}
        <Section label={`Collected recordings`} count={recordings.length}>
          {recordings.length === 0 ? (
            <div style={s.empty}>No recordings yet — upload your first one above.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  {["Sample", "Label", "Duration", "Samples", "Rate", "Uploaded"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recordings.map((rec) => (
                  <React.Fragment key={rec.id}>
                    <tr
                      style={{ ...s.tr, ...(expanded === rec.id ? s.trExpanded : {}) }}
                      onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                    >
                      <td style={s.td}><span style={s.filename}>{rec.filename}</span></td>
                      <td style={s.td}><span style={s.labelBadge}>{rec.label}</span></td>
                      <td style={s.tdMono}>{rec.duration_s.toFixed(2)} s</td>
                      <td style={s.tdMono}>{rec.n_samples.toLocaleString()}</td>
                      <td style={s.tdMono}>{rec.sample_rate_hz} Hz</td>
                      <td style={s.tdMeta}>{new Date(rec.uploaded_at).toLocaleString()}</td>
                    </tr>
                    {expanded === rec.id && (
                      <tr>
                        <td colSpan={6} style={s.expandCell}>
                          <SignalRow recordingId={rec.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ── CV training panel ── */}
        {recordings.length >= 2 && (
          <Section label="Cross-validation accuracy check">
            <p style={s.cvNote}>
              Segments every recording into sliding windows and runs GroupKFold CV
              (recordings never split across folds). Use this to check if your classes
              are separable before running the main training pipeline.
            </p>

            <div style={s.sliders}>
              <Slider label="Window" value={windowMs} min={200} max={5000} step={100}
                unit=" ms" onChange={setWindowMs} />
              <Slider label="Overlap" value={overlapPct} min={0} max={90} step={5}
                unit="%" onChange={setOverlapPct} />
              <Slider label="CV folds" value={nFolds} min={2} max={10} step={1}
                unit="" onChange={setNFolds} />
            </div>

            <button
              style={{ ...s.trainBtn, ...(training ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
              onClick={doTrain}
              disabled={training}
            >
              {training ? "Running CV…" : "Check CV accuracy"}
            </button>

            {trainErr && <Banner type="error">{trainErr}</Banner>}

            {trainResult && (
              <div style={s.results}>
                {/* Accuracy hero */}
                <div style={s.heroRow}>
                  <div style={s.heroCard}>
                    <div style={{
                      ...s.heroValue,
                      color: accuracy >= 90 ? "#059669" : accuracy >= 70 ? "#d97706" : "#dc2626",
                    }}>
                      {accuracy}%
                    </div>
                    <div style={s.heroLabel}>CV accuracy</div>
                  </div>
                  <div style={s.heroCard}>
                    <div style={s.heroValue}>{trainResult.n_windows.toLocaleString()}</div>
                    <div style={s.heroLabel}>Windows</div>
                  </div>
                  <div style={s.heroCard}>
                    <div style={s.heroValue}>{trainResult.n_recordings}</div>
                    <div style={s.heroLabel}>Recordings</div>
                  </div>
                  <div style={s.heroCard}>
                    <div style={s.heroValue}>{trainResult.n_features}</div>
                    <div style={s.heroLabel}>Features</div>
                  </div>
                </div>

                {/* Per-class accuracy */}
                <div style={s.subLabel}>Per-class accuracy</div>
                <table style={s.classTable}>
                  <thead>
                    <tr>
                      {["Label", "Accuracy", ""].map((h) => (
                        <th key={h} style={s.cth}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(trainResult.class_accuracies)
                      .sort((a, b) => b[1] - a[1])
                      .map(([lbl, acc]) => (
                        <tr key={lbl}>
                          <td style={s.ctd}><span style={s.labelBadge}>{lbl}</span></td>
                          <td style={{ ...s.ctd, fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6a63" }}>
                            {Math.round(acc * 100)}%
                          </td>
                          <td style={s.ctd}>
                            <div style={{ height: 6, background: "#ebeae5", borderRadius: 100, width: 120 }}>
                              <div style={{
                                height: "100%", borderRadius: 100,
                                width: `${Math.round(acc * 100)}%`,
                                background: acc >= 0.9 ? "#10b981" : acc >= 0.7 ? "#f59e0b" : "#ef4444",
                                transition: "width 0.3s",
                              }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {/* Confusion matrix */}
                <div style={s.subLabel}>Confusion matrix</div>
                <p style={{ fontSize: 11, color: "#b0afa8", marginBottom: 10 }}>
                  Rows = true label · Columns = predicted label
                </p>
                <ConfusionMatrix
                  labels={trainResult.confusion_matrix.labels}
                  matrix={trainResult.confusion_matrix.matrix}
                />

                <p style={{ fontSize: 11, color: "#b0afa8", marginTop: 16, fontFamily: "'DM Mono', monospace" }}>
                  {trainResult.window_ms} ms window · {trainResult.overlap_pct}% overlap ·{" "}
                  {trainResult.window_samples} samples/window · {trainResult.n_folds} folds ·{" "}
                  {trainResult.median_sample_rate_hz} Hz median rate
                </p>
              </div>
            )}
          </Section>
        )}

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ label, count, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={s.sectionLabel}>
        {label}
        {count != null && (
          <span style={{ fontWeight: 400, color: "#b0afa8", marginLeft: 8 }}>
            {count} recording{count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Banner({ type, children }) {
  const isOk = type === "ok";
  return (
    <div style={{
      marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 13,
      background: isOk ? "#f0fdf4" : "#fef2f2",
      border: `1px solid ${isOk ? "#bbf7d0" : "#fecaca"}`,
      color: isOk ? "#15803d" : "#b91c1c",
    }}>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#6b6a63" }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
          {value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#0a0a0a" }} />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  callout:     { display: "flex", gap: 10, padding: "12px 14px", background: "#f8f7f3",
                 border: "1px solid #ebeae5", borderRadius: 8, marginBottom: 28 },
  calloutIcon: { flexShrink: 0, marginTop: 1 },
  calloutText: { fontSize: 12, color: "#6b6a63", lineHeight: 1.6, margin: 0 },

  sectionLabel:{ fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                 letterSpacing: "0.08em", color: "#8a8982", marginBottom: 12,
                 display: "flex", alignItems: "center", fontFamily: "'DM Mono', monospace" },
  fieldLabel:  { fontSize: 13, color: "#6b6a63", flexShrink: 0 },
  input:       { fontSize: 13, padding: "6px 10px", border: "1px solid #d8d7d0",
                 borderRadius: 6, outline: "none", width: 200,
                 fontFamily: "'DM Sans', system-ui, sans-serif" },

  dropzone:    { border: "2px dashed #d8d7d0", borderRadius: 10, padding: "22px 20px",
                 textAlign: "center", cursor: "pointer", background: "#fafaf8",
                 transition: "border-color 0.15s, background 0.15s" },
  dropzoneActive: { borderColor: "#0a0a0a", background: "#f3f2ef" },
  dropText:    { display: "block", fontSize: 13, color: "#0a0a0a", marginBottom: 4 },
  dropHint:    { display: "block", fontSize: 11, color: "#b0afa8",
                 fontFamily: "'DM Mono', monospace" },

  empty:       { fontSize: 13, color: "#b0afa8", textAlign: "center", padding: "24px 0" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:          { textAlign: "left", fontSize: 10, fontWeight: 600, color: "#8a8982",
                 textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 10px",
                 borderBottom: "1px solid #ebeae5", fontFamily: "'DM Mono', monospace" },
  tr:          { cursor: "pointer", transition: "background 0.1s" },
  trExpanded:  { background: "#f8f7f3" },
  td:          { padding: "10px 10px", borderBottom: "1px solid #f3f2ef", verticalAlign: "middle" },
  tdMono:      { padding: "10px 10px", borderBottom: "1px solid #f3f2ef",
                 fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6a63" },
  tdMeta:      { padding: "10px 10px", borderBottom: "1px solid #f3f2ef",
                 fontSize: 11, color: "#b0afa8" },
  filename:    { fontWeight: 500, fontSize: 12, fontFamily: "'DM Mono', monospace" },
  labelBadge:  { fontSize: 11, fontWeight: 600, padding: "2px 8px",
                 borderRadius: 100, background: "#f3f2ef", color: "#0a0a0a" },
  expandCell:  { padding: 0, borderBottom: "1px solid #ebeae5" },

  sigWrap:     { padding: "14px 16px", background: "#fff" },
  sigMeta:     { fontSize: 10, color: "#8a8982", fontFamily: "'DM Mono', monospace",
                 marginBottom: 6 },
  sigPlaceholder: { padding: "16px", fontSize: 13, color: "#8a8982" },

  cvNote:      { fontSize: 12, color: "#6b6a63", lineHeight: 1.6, marginBottom: 16 },
  sliders:     { display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" },
  trainBtn:    { padding: "8px 18px", fontSize: 13, fontWeight: 600,
                 background: "#0a0a0a", color: "#fff", border: "none",
                 borderRadius: 7, cursor: "pointer" },

  results:     { marginTop: 20, paddingTop: 20, borderTop: "1px solid #ebeae5" },
  heroRow:     { display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  heroCard:    { flex: "1 1 80px", background: "#f8f7f3", border: "1px solid #ebeae5",
                 borderRadius: 10, padding: "12px 16px", textAlign: "center" },
  heroValue:   { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
                 fontFamily: "'Syne', sans-serif" },
  heroLabel:   { fontSize: 10, color: "#8a8982", marginTop: 4, textTransform: "uppercase",
                 letterSpacing: "0.06em", fontFamily: "'DM Mono', monospace" },

  subLabel:    { fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                 letterSpacing: "0.06em", color: "#8a8982", marginBottom: 8,
                 fontFamily: "'DM Mono', monospace" },
  classTable:  { width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 20 },
  cth:         { textAlign: "left", padding: "5px 10px", borderBottom: "1px solid #ebeae5",
                 fontSize: 10, fontWeight: 600, color: "#8a8982",
                 textTransform: "uppercase", letterSpacing: "0.05em",
                 fontFamily: "'DM Mono', monospace" },
  ctd:         { padding: "8px 10px", borderBottom: "1px solid #f3f2ef", verticalAlign: "middle" },

  cmTable:     { borderCollapse: "collapse", fontSize: 12, marginBottom: 8 },
  cmCorner:    { width: 80 },
  cmHead:      { padding: "4px 8px", textAlign: "center" },
  cmHeadText:  { display: "inline-block", fontSize: 11, fontWeight: 600, color: "#6b6a63",
                 maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cmRowLabel:  { padding: "6px 10px 6px 0", textAlign: "right", fontSize: 11,
                 fontWeight: 600, color: "#6b6a63", whiteSpace: "nowrap" },
  cmCell:      { padding: "7px 12px", textAlign: "center", borderRadius: 4,
                 fontSize: 12, fontWeight: 500, minWidth: 36 },
  cmLegend:    { fontSize: 11, color: "#8a8982", marginTop: 6 },
};
