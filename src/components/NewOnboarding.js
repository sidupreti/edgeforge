import React, { useState, useRef } from "react";

const CLASS_PALETTE = [
  "#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];


const MCU_CHIPS = [
  { label: "ESP32-S3",    value: "ESP32-S3" },
  { label: "STM32L476",   value: "STM32L476RG" },
  { label: "nRF5340",     value: "nRF5340-DK" },
  { label: "Arduino BLE", value: "Arduino Nano 33 BLE" },
  { label: "RP2040",      value: "RP2040 (Raspberry Pi Pico)" },
  { label: "ATSAMD51",    value: "ATSAMD51 (Adafruit M4)" },
  { label: "Custom",      value: "__custom__" },
];

function slugify(name) {
  const s = (name || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return s || "my-project";
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsvMeta(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim().replace(/\r$/, ""))
    .filter(Boolean)
    .slice(0, 12);

  if (lines.length < 2) return null;

  const firstParts = lines[0].split(",");
  const hasHeader  = isNaN(parseFloat(firstParts[0].trim()));
  const dataLines  = hasHeader ? lines.slice(1) : lines;
  if (dataLines.length < 2) return null;

  const colCount = firstParts.length;
  const headers  = hasHeader
    ? firstParts.map((h) => h.trim())
    : null;

  // Infer column names when no header
  const defaultCols = colCount >= 2
    ? ["timestamp", ...Array.from({ length: colCount - 1 }, (_, i) => `ch${i}`)]
    : Array.from({ length: colCount }, (_, i) => `col${i}`);
  const columnNames = headers ?? defaultCols.slice(0, colCount);

  // Estimate sample rate
  const stamps = dataLines
    .slice(0, 10)
    .map((l) => parseFloat(l.split(",")[0]))
    .filter((n) => !isNaN(n) && n > 0);

  let sampleRateHz = null;
  let timestampUnit = "µs";
  if (stamps.length >= 2) {
    const diffs = stamps.slice(1).map((t, i) => t - stamps[i]).filter((d) => d > 0);
    if (diffs.length > 0) {
      const avg = diffs.reduce((a, b) => a + b) / diffs.length;
      if (stamps[0] > 50000) {
        sampleRateHz = Math.round(1e6 / avg);
        timestampUnit = "µs";
      } else if (stamps[0] > 50) {
        sampleRateHz = Math.round(1000 / avg);
        timestampUnit = "ms";
      } else {
        sampleRateHz = Math.round(1 / avg);
        timestampUnit = "s";
      }
    }
  }

  return { colCount, columnNames, sampleRateHz, timestampUnit };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChipSelect({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`text-sm px-3.5 py-1.5 rounded-full border font-medium transition-all ${
              active
                ? "border-sf-black text-sf-black bg-sf-black/10"
                : "border-sf-gray-200 text-sf-gray-400 hover:border-sf-gray-300 hover:text-sf-black"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function QuestionBlock({ index, question, children }) {
  return (
    <div
      className="animate-bubble-in"
      style={{ animationDelay: `${index * 300}ms`, animationFillMode: "both", opacity: 0 }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "#ebeae5" }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-sf-black" />
        </div>
        <div className="flex-1 space-y-3">
          <div
            className="inline-block rounded-2xl rounded-tl-sm px-4 py-3"
            style={{ background: "#f8f7f3", border: "1px solid #ebeae5" }}
          >
            <p className="text-sm leading-relaxed" style={{ color: "#0a0a0a" }}>
              {question}
            </p>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ── CSV Drop Zone (currently unused — kept for future re-enable) ─────────────
// eslint-disable-next-line no-unused-vars
function CsvDropZone({ onDetected }) {
  const fileRef    = useRef(null);
  const [drag,     setDrag]    = useState(false);
  const [status,   setStatus]  = useState("idle"); // idle | parsing | done | error | skipped
  const [csvMeta,  setCsvMeta] = useState(null);

  function processFile(file) {
    if (!file) return;
    setStatus("parsing");
    const reader = new FileReader();
    reader.onload = (e) => {
      const meta = parseCsvMeta(e.target.result);
      if (!meta) {
        setStatus("error");
        return;
      }
      setCsvMeta(meta);
      setStatus("done");
      onDetected(meta, file.name);
    };
    reader.onerror = () => setStatus("error");
    reader.readAsText(file.slice(0, 8192));
  }

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  if (status === "skipped") {
    return (
      <p className="text-xs" style={{ color: "#b0afa8" }}>
        Skipped — using default format (timestamp, ch0, ch1, ...)
      </p>
    );
  }

  if (status === "done" && csvMeta) {
    const rateStr = csvMeta.sampleRateHz ? `${csvMeta.sampleRateHz} Hz · ` : "";
    const colsStr = csvMeta.columnNames.join(", ");
    return (
      <div
        className="rounded-xl px-4 py-3 space-y-1"
        style={{ background: "#f8f7f3", border: "1px solid #d8d7d0" }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="#0a0a0a">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l3.5 3.5L13 4.5" />
          </svg>
          <p className="text-xs font-semibold" style={{ color: "#0a0a0a" }}>
            Detected: {rateStr}{csvMeta.colCount} columns
          </p>
        </div>
        <p className="text-xs pl-5.5" style={{ color: "#8a8982" }}>
          columns: <span className="font-mono" style={{ color: "#0a0a0a" }}>{colsStr}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); e.target.value = ""; }}
      />

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className="rounded-xl px-4 py-5 text-center cursor-pointer transition-all"
        style={{
          border: `2px dashed ${drag ? "#0a0a0a" : "#d8d7d0"}`,
          background: drag ? "rgba(10,10,10,0.04)" : "#fbfaf6",
        }}
      >
        {status === "parsing" ? (
          <p className="text-xs" style={{ color: "#6b6a63" }}>Parsing…</p>
        ) : (
          <>
            <svg className="w-5 h-5 mx-auto mb-2" style={{ color: "#b0afa8" }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-xs font-medium" style={{ color: "#6b6a63" }}>
              {status === "error" ? "Couldn't parse that file — try another CSV" : "Drop a CSV file here or click to browse"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#b0afa8" }}>
              CSV with timestamp + signal columns
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setStatus("skipped")}
        className="text-xs transition-colors"
        style={{ color: "#8a8982" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#0a0a0a"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#8a8982"; }}
      >
        Skip →
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewOnboarding({ onComplete }) {
  const [projectName,  setProjectName]  = useState("");
  const [mcu,          setMcu]          = useState("ESP32-S3");
  const [customMcu,    setCustomMcu]    = useState("");
  const [classes,      setClasses]      = useState("");
  const [dataMode,     setDataMode]     = useState("");  // "samples" | "continuous"
  const [collectMethod, setCollectMethod] = useState("upload"); // "upload" | "serial"
  const [modality,     setModality]     = useState("sensor"); // "sensor" | "image"
  const [error,        setError]        = useState("");
  const isImage = modality === "image";

  function handleSubmit(e) {
    e.preventDefault();
    if (!projectName.trim()) { setError("Please name your project."); return; }
    if (!isImage && !dataMode) { setError("Please select how your data is organized."); return; }
    // Classes required for pre-labeled samples and images, optional for continuous
    if ((isImage || dataMode === "samples") && !classes.trim()) { setError("Please name at least one class."); return; }
    setError("");
    // Images are always per-class file uploads → reuse the samples/upload data path.
    const effDataMode = isImage ? "samples" : dataMode;
    const effCollect  = isImage ? "upload"  : collectMethod;

    const classNames = classes.trim()
      ? classes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [];

    const finalClasses = classNames.map((name, i) => ({
      id:    `cls-${name.replace(/\s+/g, "-")}-${i}`,
      name,
      color: CLASS_PALETTE[i % CLASS_PALETTE.length],
      description: "",
    }));

    const resolvedMcu = mcu === "__custom__" ? (customMcu.trim() || "Custom MCU") : mcu;

    const finalConfig = {
      projectName:            slugify(projectName.trim()),
      sensorType:             "Custom / Analog",
      connectionType:         "File Upload (CSV / WAV)",
      triggerType:            "Threshold",
      triggerConfig:          {},
      targetMcu:              resolvedMcu,
      applicationDescription: projectName.trim(),
      hardwarePreprocessing:  { type: "none" },
      dataMode:               effDataMode,
      collectMethod:          effCollect,
      modality,
    };

    onComplete(finalConfig, finalClasses);
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-start overflow-y-auto"
      style={{ zIndex: 10, paddingTop: "5vh", paddingBottom: "5vh" }}
    >
      <div className="w-full max-w-xl px-6">

        {/* ── Hero logo ──────────────────────────────────────────────────── */}
        <div
          className="mb-10 animate-fade-up"
          style={{ animationDelay: "0ms", animationFillMode: "both", opacity: 0 }}
        >
          <h1
            className="text-4xl font-bold tracking-tight mb-2"
            style={{
              fontFamily: "'Syne', sans-serif",
              color: "#0a0a0a",
              letterSpacing: "-0.03em",
            }}
          >
            EDGEFORGE
          </h1>
          <span className="animate-underline-grow" style={{ width: 120 }} />
          <p className="text-sm mt-3 tracking-wider" style={{ color: "#8a8982", fontFamily: "'DM Mono', monospace", fontSize: "12px" }}>
            Embedded ML Platform
          </p>
        </div>

        {/* ── Chat bubbles ───────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Q1 — Project name */}
          <QuestionBlock index={0} question="Name your project.">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. CNC Vibration Monitor"
              className="w-full rounded-xl px-4 py-3 text-sm transition-colors
                         focus:outline-none focus:ring-2 focus:ring-accent/40"
              style={{ background: "#ffffff", border: "1px solid #d8d7d0", color: "#0a0a0a" }}
            />
          </QuestionBlock>

          {/* Q2 — MCU */}
          <QuestionBlock index={1} question="What's your target MCU?">
            <ChipSelect options={MCU_CHIPS} value={mcu} onChange={setMcu} />
            {mcu === "__custom__" && (
              <input
                type="text"
                value={customMcu}
                onChange={(e) => setCustomMcu(e.target.value)}
                placeholder="Enter your MCU name…"
                className="w-full rounded-xl px-4 py-3 text-sm mt-2 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-accent/40"
                style={{ background: "#ffffff", border: "1px solid #d8d7d0", color: "#0a0a0a" }}
                autoFocus
              />
            )}
          </QuestionBlock>

          {/* Q2.5 — Data type / modality */}
          <QuestionBlock index={2} question="What kind of data are you classifying?">
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "sensor", title: "Sensor time-series", sub: "Accelerometer, IMU, audio, analog — CSV recordings" },
                { id: "image", title: "Images", sub: "Photos per class — pixel or transfer-learning features" },
              ].map(({ id, title, sub }) => (
                <button key={id} type="button" onClick={() => setModality(id)}
                  className="flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-colors text-left"
                  style={{
                    borderColor: modality === id ? "#1D9E75" : "#d8d7d0",
                    background: modality === id ? "rgba(29,158,117,0.05)" : "#ffffff",
                  }}>
                  <span className="text-sm font-semibold" style={{ color: modality === id ? "#1D9E75" : "#0a0a0a" }}>{title}</span>
                  <span className="text-xs text-gray-400 leading-relaxed">{sub}</span>
                </button>
              ))}
            </div>
          </QuestionBlock>

          {/* Q3 — Classes (required for samples, optional/deferred for continuous) */}
          <QuestionBlock index={3} question={
            dataMode === "continuous"
              ? "Name your classes (optional — you can define them later when labeling segments)."
              : "Name your classification classes, separated by commas."
          }>
            <input
              type="text"
              value={classes}
              onChange={(e) => setClasses(e.target.value)}
              placeholder="e.g. idle, tap, shake"
              className="w-full rounded-xl px-4 py-3 text-sm transition-colors
                         focus:outline-none focus:ring-2 focus:ring-accent/40"
              style={{
                background: "#ffffff",
                border: "1px solid #d8d7d0",
                color: "#0a0a0a",
              }}
            />
            {classes.trim() && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {classes.split(",").map((c, i) => {
                  const name = c.trim().toLowerCase();
                  if (!name) return null;
                  const color = CLASS_PALETTE[i % CLASS_PALETTE.length];
                  return (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-full font-semibold"
                      style={{ color, background: color + "20" }}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
          </QuestionBlock>

          {/* Q4 — Data organization mode (sensor only; images are per-class uploads) */}
          {!isImage && (
          <QuestionBlock index={4} question="How is your data organized?">
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "samples", title: "Pre-labeled samples", sub: "Separate files, each one example of a class" },
                { id: "continuous", title: "Continuous recording", sub: "One long capture — segment & label it" },
              ].map(({ id, title, sub }) => (
                <button key={id} type="button" onClick={() => setDataMode(id)}
                  className="flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-colors text-left"
                  style={{
                    borderColor: dataMode === id ? "#1D9E75" : "#d8d7d0",
                    background: dataMode === id ? "rgba(29,158,117,0.05)" : "#ffffff",
                  }}>
                  <span className="text-sm font-semibold" style={{ color: dataMode === id ? "#1D9E75" : "#0a0a0a" }}>{title}</span>
                  <span className="text-xs text-gray-400 leading-relaxed">{sub}</span>
                </button>
              ))}
            </div>
          </QuestionBlock>
          )}

          {/* Q5 — Collection method */}
          {!isImage && (
          <QuestionBlock index={5} question="How will you collect data?">
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "upload", title: "Upload CSV", sub: "Upload recorded data files from your computer" },
                { id: "serial", title: "Live capture", sub: "Connect a device via serial and record live" },
              ].map(({ id, title, sub }) => (
                <button key={id} type="button" onClick={() => setCollectMethod(id)}
                  className="flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-colors text-left"
                  style={{
                    borderColor: collectMethod === id ? "#1D9E75" : "#d8d7d0",
                    background: collectMethod === id ? "rgba(29,158,117,0.05)" : "#ffffff",
                  }}>
                  <span className="text-sm font-semibold" style={{ color: collectMethod === id ? "#1D9E75" : "#0a0a0a" }}>{title}</span>
                  <span className="text-xs text-gray-400 leading-relaxed">{sub}</span>
                </button>
              ))}
            </div>
          </QuestionBlock>
          )}

          {/* ── Error ────────────────────────────────────────────────────── */}
          {error && (
            <p
              className="text-xs px-4 py-2.5 rounded-lg animate-fade-up"
              style={{
                background: "#fff5f5",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#ef4444",
              }}
            >
              {error}
            </p>
          )}

          {/* ── CTA ──────────────────────────────────────────────────────── */}
          <div
            className="pt-4 animate-fade-up"
            style={{ animationDelay: "1600ms", animationFillMode: "both", opacity: 0 }}
          >
            <button
              type="submit"
              className="w-full py-4 rounded-2xl text-white font-bold text-base tracking-wide transition-all"
              style={{
                fontFamily: "'Syne', sans-serif",
                background: "#0a0a0a",
                boxShadow: "0 4px 20px rgba(0,0,0,0.16)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 6px 28px rgba(0,0,0,0.24)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.16)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Let's go →
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
