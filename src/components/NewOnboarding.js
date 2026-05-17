import React, { useState, useRef } from "react";

const CLASS_PALETTE = [
  "#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];

const SENSOR_CHIPS = [
  { label: "Accelerometer", value: "Accelerometer (IMU)" },
  { label: "Microphone",    value: "Microphone (PDM)" },
  { label: "Temperature",   value: "Temperature / Humidity" },
  { label: "Pressure",      value: "Pressure (Barometric)" },
  { label: "Proximity",     value: "Proximity (ToF)" },
  { label: "Custom",        value: "Custom / Analog" },
];

const MCU_CHIPS = [
  { label: "ESP32-S3",    value: "ESP32-S3" },
  { label: "STM32L476",   value: "STM32L476RG" },
  { label: "nRF5340",     value: "nRF5340-DK" },
  { label: "Arduino BLE", value: "Arduino Nano 33 BLE" },
  { label: "RP2040",      value: "RP2040 (Raspberry Pi Pico)" },
  { label: "ATSAMD51",    value: "ATSAMD51 (Adafruit M4)" },
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
  const defaultCols = colCount >= 4
    ? ["timestamp_us", "ax", "ay", "az"]
    : colCount === 3
      ? ["timestamp_us", "ax", "ay"]
      : colCount === 2
        ? ["timestamp_us", "value"]
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
                ? "border-accent text-accent bg-accent/10"
                : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/75"
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
          style={{ background: "rgba(29,158,117,0.18)" }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-accent" />
        </div>
        <div className="flex-1 space-y-3">
          <div
            className="inline-block rounded-2xl rounded-tl-sm px-4 py-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
              {question}
            </p>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ── CSV Drop Zone ─────────────────────────────────────────────────────────────
function CsvDropZone({ onDetected, onSkip }) {
  const fileRef   = useRef(null);
  const [drag,    setDrag]    = useState(false);
  const [status,  setStatus]  = useState("idle"); // idle | parsing | done | error
  const [csvMeta, setCsvMeta] = useState(null);

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

  if (status === "done" && csvMeta) {
    const rateStr = csvMeta.sampleRateHz ? `${csvMeta.sampleRateHz} Hz · ` : "";
    const colsStr = csvMeta.columnNames.join(", ");
    return (
      <div
        className="rounded-xl px-4 py-3 space-y-1"
        style={{ background: "rgba(29,158,117,0.1)", border: "1px solid rgba(29,158,117,0.3)" }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="#1D9E75">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l3.5 3.5L13 4.5" />
          </svg>
          <p className="text-xs font-semibold" style={{ color: "#1D9E75" }}>
            Detected: {rateStr}{csvMeta.colCount} columns
          </p>
        </div>
        <p className="text-xs pl-5.5" style={{ color: "rgba(255,255,255,0.45)" }}>
          columns: <span className="font-mono" style={{ color: "rgba(255,255,255,0.65)" }}>{colsStr}</span>
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
          border: `2px dashed ${drag ? "rgba(29,158,117,0.6)" : "rgba(255,255,255,0.1)"}`,
          background: drag ? "rgba(29,158,117,0.06)" : "rgba(255,255,255,0.02)",
        }}
      >
        {status === "parsing" ? (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Parsing…</p>
        ) : (
          <>
            <svg className="w-5 h-5 mx-auto mb-2" style={{ color: "rgba(255,255,255,0.25)" }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
              {status === "error" ? "Couldn't parse that file — try another CSV" : "Drop a CSV file here or click to browse"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.18)" }}>
              format: timestamp_us, ax, ay, az
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="text-xs transition-colors"
        style={{ color: "rgba(255,255,255,0.3)" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
      >
        Skip →
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewOnboarding({ onComplete }) {
  const [appDesc,      setAppDesc]      = useState("");
  const [sensor,       setSensor]       = useState("");
  const [mcu,          setMcu]          = useState("ESP32-S3");
  const [csvSkipped,   setCsvSkipped]   = useState(false);
  const [detectedCsv,  setDetectedCsv]  = useState(null); // { colCount, columnNames, sampleRateHz }
  const [classes,      setClasses]      = useState("");
  const [error,        setError]        = useState("");

  function handleCsvDetected(meta) {
    setDetectedCsv(meta);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!appDesc.trim()) { setError("Please describe your application."); return; }
    if (!sensor)         { setError("Please select a sensor type."); return; }
    if (!classes.trim()) { setError("Please name at least one class."); return; }
    setError("");

    const classNames = classes
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (classNames.length === 0) { setError("Enter at least one class name."); return; }

    const finalClasses = classNames.map((name, i) => ({
      id:    `cls-${name.replace(/\s+/g, "-")}-${i}`,
      name,
      color: CLASS_PALETTE[i % CLASS_PALETTE.length],
    }));

    const finalConfig = {
      projectName:            slugify(appDesc.trim().split(/\s+/).slice(0, 4).join("-")),
      sensorType:             sensor,
      connectionType:         "File Upload (CSV / WAV)",
      triggerType:            "Threshold",
      triggerConfig:          {},
      targetMcu:              mcu,
      applicationDescription: appDesc.trim(),
      hardwarePreprocessing:  { type: "none" },
      detectedCsvFormat:      detectedCsv ?? null,
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
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              background: "linear-gradient(135deg, #ffffff 30%, rgba(255,255,255,0.55))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            EDGEFORGE
          </h1>
          <span className="animate-underline-grow" style={{ width: 120 }} />
          <p className="text-sm mt-3 tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
            ML for embedded hardware
          </p>
        </div>

        {/* ── Chat bubbles ───────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Q1 — App description */}
          <QuestionBlock index={0} question="What are you trying to classify? Describe your application briefly.">
            <textarea
              value={appDesc}
              onChange={(e) => setAppDesc(e.target.value)}
              placeholder="e.g. Detect vibration anomalies on a CNC spindle bearing"
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-none transition-colors
                         focus:outline-none focus:ring-2 focus:ring-accent/40"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0",
              }}
            />
          </QuestionBlock>

          {/* Q2 — Sensor */}
          <QuestionBlock index={1} question="Which sensor are you using?">
            <ChipSelect options={SENSOR_CHIPS} value={sensor} onChange={setSensor} />
          </QuestionBlock>

          {/* Q3 — MCU */}
          <QuestionBlock index={2} question="What's your target MCU?">
            <ChipSelect options={MCU_CHIPS} value={mcu} onChange={setMcu} />
          </QuestionBlock>

          {/* Q4 — CSV sample upload (new) */}
          <QuestionBlock
            index={3}
            question="Do you have a sample data file? Drop one here and I'll auto-detect the format — or skip if you don't have one yet."
          >
            <CsvDropZone
              onDetected={handleCsvDetected}
              onSkip={() => setCsvSkipped(true)}
            />
          </QuestionBlock>

          {/* Q5 — Classes (always visible, but visually highlighted once csv step resolved) */}
          <QuestionBlock index={4} question="Name your classification classes, separated by commas.">
            <input
              type="text"
              value={classes}
              onChange={(e) => setClasses(e.target.value)}
              placeholder="e.g. idle, tap, shake"
              className="w-full rounded-xl px-4 py-3 text-sm transition-colors
                         focus:outline-none focus:ring-2 focus:ring-accent/40"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0",
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

          {/* ── Error ────────────────────────────────────────────────────── */}
          {error && (
            <p
              className="text-xs px-4 py-2.5 rounded-lg animate-fade-up"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#fca5a5",
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
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: "linear-gradient(135deg, #1D9E75 0%, #16866A 100%)",
                boxShadow: "0 4px 24px rgba(29,158,117,0.35)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 6px 32px rgba(29,158,117,0.55)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 24px rgba(29,158,117,0.35)";
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
