import React, { useState } from "react";

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

// A single "chat bubble" question block
function QuestionBlock({ index, question, children, visible }) {
  return (
    <div
      className="animate-bubble-in"
      style={{ animationDelay: `${index * 300}ms`, animationFillMode: "both", opacity: 0 }}
    >
      <div className="flex items-start gap-3">
        {/* Bot avatar */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: "rgba(29,158,117,0.18)" }}>
          <div className="w-2.5 h-2.5 rounded-full bg-accent" />
        </div>

        <div className="flex-1 space-y-3">
          {/* Question bubble */}
          <div
            className="inline-block rounded-2xl rounded-tl-sm px-4 py-3"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <p className="text-sm text-white/80 leading-relaxed">{question}</p>
          </div>

          {/* Answer input */}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function NewOnboarding({ onComplete }) {
  const [appDesc,  setAppDesc]  = useState("");
  const [sensor,   setSensor]   = useState("");
  const [mcu,      setMcu]      = useState("ESP32-S3");
  const [classes,  setClasses]  = useState("");
  const [error,    setError]    = useState("");

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
    };

    onComplete(finalConfig, finalClasses);
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-start overflow-y-auto"
      style={{ zIndex: 10, paddingTop: "5vh", paddingBottom: "5vh" }}
    >
      <div className="w-full max-w-xl px-6">

        {/* ── Hero logo ─────────────────────────────────────────────────── */}
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
          <p className="text-sm text-white/35 mt-3 tracking-wider">
            ML for embedded hardware
          </p>
        </div>

        {/* ── Chat bubbles ──────────────────────────────────────────────── */}
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

          {/* Q4 — Classes */}
          <QuestionBlock index={3} question="Name your classification classes, separated by commas.">
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

          {/* ── Error ───────────────────────────────────────────────────── */}
          {error && (
            <p
              className="text-xs px-4 py-2.5 rounded-lg animate-fade-up"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}
            >
              {error}
            </p>
          )}

          {/* ── CTA ─────────────────────────────────────────────────────── */}
          <div
            className="pt-4 animate-fade-up"
            style={{ animationDelay: "1300ms", animationFillMode: "both", opacity: 0 }}
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
