import React, { useState, useEffect, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASS_PALETTE = [
  "#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];

const SENSOR_OPTIONS = [
  { label: "Accelerometer (IMU)", value: "Accelerometer (IMU)" },
  { label: "Microphone (PDM)",    value: "Microphone (PDM)" },
  { label: "Temperature / Humidity", value: "Temperature / Humidity" },
  { label: "Pressure (Barometric)", value: "Pressure (Barometric)" },
  { label: "Other / Analog",      value: "Custom / Analog" },
];

const DATA_SOURCE_OPTIONS = [
  { label: "I have CSV files",       value: "files" },
  { label: "Collect data fresh",     value: "fresh" },
];

const FILE_CONFIRM_OPTIONS = [
  { label: "Yes, looks right",    value: "yes" },
  { label: "Let me re-upload",    value: "no" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text) {
  return (text || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40) || "project";
}

function projectNameFromDesc(desc) {
  const words = desc.trim().split(/\s+/).slice(0, 4).join("-");
  return slugify(words);
}

async function parseFileMetadata(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target.result;
      const lines = raw
        .split("\n")
        .map((l) => l.trim().replace(/\r$/, ""))
        .filter(Boolean);
      if (lines.length < 2) { resolve(null); return; }

      const firstParts = lines[0].split(",");
      const hasHeader  = isNaN(parseFloat(firstParts[0].trim()));
      const dataLines  = hasHeader ? lines.slice(1) : lines;
      if (dataLines.length < 2) { resolve(null); return; }

      const colCount = firstParts.length;
      const headers  = hasHeader ? firstParts.map((h) => h.trim().toLowerCase()) : null;

      // Estimate sample rate from timestamps
      const stamps = dataLines
        .slice(0, 15)
        .map((l) => parseFloat(l.split(",")[0]))
        .filter((n) => !isNaN(n) && n > 0);

      let sampleRateHz = null;
      let timestampUnit = "µs";
      if (stamps.length >= 2) {
        const diffs = stamps.slice(1).map((t, i) => t - stamps[i]).filter((d) => d > 0);
        if (diffs.length > 0) {
          const avgDiff = diffs.reduce((a, b) => a + b) / diffs.length;
          if (stamps[0] > 50000) {
            sampleRateHz = Math.round(1e6 / avgDiff);
            timestampUnit = "µs";
          } else if (stamps[0] > 50) {
            sampleRateHz = Math.round(1000 / avgDiff);
            timestampUnit = "ms";
          } else {
            sampleRateHz = Math.round(1 / avgDiff);
            timestampUnit = "s";
          }
        }
      }

      // Describe axis count
      const axisDesc =
        colCount >= 4 ? "3-axis" :
        colCount === 3 ? "2-axis" :
        colCount === 2 ? "1-axis" : `${colCount} columns`;

      resolve({
        colCount,
        headers,
        sampleRateHz,
        timestampUnit,
        axisDesc,
        rowCount: dataLines.length,
        filename: file.name,
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file.slice(0, 16384)); // first 16 KB is plenty
  });
}

function formatDetectionMessage(meta) {
  if (!meta) return "I couldn't parse that file — make sure it's a CSV with comma-separated columns.";
  const parts = [];
  if (meta.sampleRateHz) parts.push(`${meta.sampleRateHz} Hz`);
  parts.push(meta.axisDesc);
  if (meta.headers) parts.push(`columns: ${meta.headers.join(", ")}`);
  parts.push(`timestamps in ${meta.timestampUnit}`);
  return `Detected: ${parts.join(" · ")}\n${meta.rowCount} rows read from ${meta.filename}. Does this look right?`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <div className="w-2.5 h-2.5 rounded-full bg-accent" />
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div className="flex justify-end">
      <div className="bg-accent text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-sm shadow-sm shadow-accent/20">
        <p className="text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function SummaryCard({ data, onConfirm }) {
  return (
    <div
      className="bg-white border border-sf-gray-100 rounded-xl p-5 space-y-4"
      style={{ background: "#f8f7f3" }}
    >
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Project Ready</p>
      </div>

      <div className="space-y-2.5">
        {data.items.map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-xs">
            <span className="text-gray-400 flex-shrink-0 w-28">{label}</span>
            <span className="text-gray-700 font-semibold leading-relaxed">{value}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-400 uppercase tracking-widest">Classes</p>
        <div className="flex flex-wrap gap-1.5">
          {data.classes.map(({ name, color }) => (
            <span
              key={name}
              className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ color, backgroundColor: color + "1a" }}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={onConfirm}
        className="w-full py-3 bg-accent text-white text-xs font-bold rounded-xl hover:bg-accent-dark transition-colors tracking-widest uppercase shadow-sm shadow-accent/25"
      >
        Start Collecting Data →
      </button>
    </div>
  );
}

function BotBubble({ msg, onQuickReply, onFileSelect, onConfirm }) {
  const fileRef = useRef(null);

  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <div className="w-2.5 h-2.5 rounded-full bg-accent" />
      </div>

      <div className="flex-1 max-w-md space-y-3">
        {/* Text bubble */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{msg.text}</p>
        </div>

        {/* File detection result */}
        {msg.type === "file_result" && msg.fileData && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1.5 text-xs">
            {[
              ["File",          msg.fileData.filename],
              ["Columns",       String(msg.fileData.colCount)],
              msg.fileData.sampleRateHz
                ? ["Sample rate", `~${msg.fileData.sampleRateHz} Hz`]
                : null,
              ["Timestamp",     `${msg.fileData.timestampUnit}`],
              ["Rows detected", String(msg.fileData.rowCount)],
            ]
              .filter(Boolean)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-gray-400">{k}</span>
                  <span className="font-semibold text-gray-700 text-right">{v}</span>
                </div>
              ))}
          </div>
        )}

        {/* File upload zone */}
        {msg.type === "file_upload" && !msg.replied && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) onFileSelect(e.target.files[0], msg.id);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-7 text-center hover:border-accent/40 hover:bg-accent/5 transition-all group"
            >
              <svg
                className="w-6 h-6 text-gray-300 group-hover:text-accent/50 mx-auto mb-2 transition-colors"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-xs text-gray-400 group-hover:text-gray-600 transition-colors font-medium">
                Click to select a CSV file
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5">format: timestamp, ax, ay, az</p>
            </button>
          </div>
        )}

        {/* Summary card */}
        {msg.type === "summary" && (
          <SummaryCard data={msg.summaryData} onConfirm={onConfirm} />
        )}

        {/* Quick replies */}
        {msg.quickReplies && (
          <div className="flex flex-wrap gap-2">
            {msg.quickReplies.map(({ label, value }) => {
              const isSelected = msg.replied === label;
              const isDimmed   = msg.replied && msg.replied !== label;
              return (
                <button
                  key={value}
                  disabled={!!msg.replied}
                  onClick={() => onQuickReply(msg.id, label, value)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${
                    isSelected
                      ? "bg-accent/10 text-accent border-accent/50"
                      : isDimmed
                      ? "text-gray-200 border-gray-100 cursor-default"
                      : "text-accent border-accent/30 hover:bg-accent/5 hover:border-accent/60"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingChat({ onComplete, onManualSetup }) {
  const [messages,    setMessages]    = useState([]);
  const [isTyping,    setIsTyping]    = useState(false);
  const [phase,       setPhase]       = useState("app_desc");
  const [inputValue,  setInputValue]  = useState("");
  const [localData,   setLocalData]   = useState({});

  const scrollRef       = useRef(null);
  const inputRef        = useRef(null);
  const queueRef        = useRef(Promise.resolve());
  const msgCounterRef   = useRef(0);
  const activeIdRef     = useRef(null); // ID of the current "awaiting reply" bot message

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function nextId() {
    return `msg-${Date.now()}-${++msgCounterRef.current}`;
  }

  // Enqueue a bot message with a typing delay. Returns the message ID synchronously.
  function botSay(msgData, delay = 800) {
    const id = nextId();
    queueRef.current = queueRef.current.then(
      () =>
        new Promise((resolve) => {
          setIsTyping(true);
          setTimeout(() => {
            setIsTyping(false);
            setMessages((prev) => [...prev, { id, role: "bot", ...msgData }]);
            setTimeout(resolve, 80);
          }, delay);
        })
    );
    return id;
  }

  function userSay(text) {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", text },
    ]);
  }

  function markReplied(msgId, replyLabel) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, replied: replyLabel } : m))
    );
  }

  // ── Scroll to bottom ────────────────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // ── Initial message ─────────────────────────────────────────────────────────

  useEffect(() => {
    const id = botSay(
      {
        text:
          "Welcome to SensorFlow!\n\nWhat are you trying to classify? Describe your application in a sentence or two.\n\nFor example: \"Detect vibration anomalies on a CNC spindle bearing\" or \"Recognize hand gestures on a wristband.\"",
        phase: "app_desc",
      },
      400
    );
    activeIdRef.current = id;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step handlers ────────────────────────────────────────────────────────────

  // Step 0 → Step 1: user submits application description
  function handleAppDescSubmit() {
    const desc = inputValue.trim();
    if (!desc) return;
    setInputValue("");

    userSay(desc);
    setLocalData((prev) => ({
      ...prev,
      appDescription: desc,
      projectName: projectNameFromDesc(desc),
    }));

    setPhase("sensor");
    const id = botSay({
      text: "What sensor are you using?",
      quickReplies: SENSOR_OPTIONS,
      phase: "sensor",
    });
    activeIdRef.current = id;
  }

  // Step 1 → Step 2: user selects sensor
  function handleSensorSelect(msgId, label, value) {
    markReplied(msgId, label);
    userSay(label);
    setLocalData((prev) => ({ ...prev, sensorType: value }));

    setPhase("data_source");
    const id = botSay({
      text: "Do you have existing CSV data files you'd like to upload, or will you be collecting data fresh with a device?",
      quickReplies: DATA_SOURCE_OPTIONS,
      phase: "data_source",
    });
    activeIdRef.current = id;
  }

  // Step 2 → Step 3 (file) or Step 3 (classes): user picks data source
  function handleDataSourceSelect(msgId, label, value) {
    markReplied(msgId, label);
    userSay(label);
    setLocalData((prev) => ({
      ...prev,
      connectionType:
        value === "files" ? "File Upload (CSV / WAV)" : "Serial / UART",
    }));

    if (value === "files") {
      setPhase("file_upload");
      const id = botSay({
        text: "Drop a sample file here and I'll detect the format automatically. You can upload more files during data collection.",
        type: "file_upload",
        phase: "file_upload",
      });
      activeIdRef.current = id;
    } else {
      setPhase("classes");
      const id = botSay({
        text: "What are the classes you want to classify?\n\nList them separated by commas — e.g. circle, shake, flick",
        phase: "classes",
      });
      activeIdRef.current = id;
      setTimeout(() => inputRef.current?.focus(), 900);
    }
  }

  // Step 2.5: user selects a file for format detection
  async function handleFileSelect(file, uploadMsgId) {
    // Mark the file-upload zone as "done"
    setMessages((prev) =>
      prev.map((m) => (m.id === uploadMsgId ? { ...m, replied: "file" } : m))
    );
    userSay(`📎 ${file.name}`);

    setPhase("file_parsing");
    const meta = await parseFileMetadata(file);
    setLocalData((prev) => ({ ...prev, fileMetadata: meta }));

    setPhase("file_confirm");
    const id = botSay(
      {
        text: formatDetectionMessage(meta),
        type: meta ? "file_result" : "text",
        fileData: meta ?? undefined,
        quickReplies: FILE_CONFIRM_OPTIONS,
        phase: "file_confirm",
      },
      600
    );
    activeIdRef.current = id;
  }

  // Step 2.5 confirmation → Step 3
  function handleFileConfirm(msgId, label, value) {
    markReplied(msgId, label);

    if (value === "no") {
      // Re-show file upload
      setPhase("file_upload");
      const id = botSay({
        text: "No problem — try another file.",
        type: "file_upload",
        phase: "file_upload",
      });
      activeIdRef.current = id;
    } else {
      setPhase("classes");
      const id = botSay({
        text: "What are the classes you want to classify?\n\nList them separated by commas — e.g. circle, shake, flick",
        phase: "classes",
      });
      activeIdRef.current = id;
      setTimeout(() => inputRef.current?.focus(), 900);
    }
  }

  // Step 3 → Step 4: user submits class list
  function handleClassesSubmit() {
    const raw = inputValue.trim();
    if (!raw) return;
    setInputValue("");

    const names = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (names.length === 0) return;

    const classes = names.map((name, i) => ({
      id:    `cls-${name.replace(/\s+/g, "-")}-${i}`,
      name,
      color: CLASS_PALETTE[i % CLASS_PALETTE.length],
    }));

    userSay(raw);
    setLocalData((prev) => ({ ...prev, classes }));

    setPhase("summary");

    // Build summary
    const currentData = { ...localData, classes };
    const summaryData = {
      items: [
        { label: "Application",  value: currentData.appDescription || "—" },
        { label: "Sensor",       value: currentData.sensorType    || "—" },
        { label: "Connection",   value: currentData.connectionType || "File Upload (CSV / WAV)" },
        currentData.fileMetadata?.sampleRateHz
          ? { label: "Sample rate", value: `~${currentData.fileMetadata.sampleRateHz} Hz` }
          : null,
      ].filter(Boolean),
      classes,
    };

    botSay(
      {
        text: `Got it — ${classes.length} class${classes.length !== 1 ? "es" : ""}. Here's your project setup:`,
        type: "summary",
        summaryData,
        phase: "summary",
      },
      700
    );
  }

  // Step 4: user confirms — hand off to parent
  function handleConfirm() {
    const finalConfig = {
      projectName:            localData.projectName || "my-project",
      sensorType:             localData.sensorType  || "Accelerometer (IMU)",
      connectionType:         localData.connectionType || "File Upload (CSV / WAV)",
      triggerType:            "Threshold",
      triggerConfig:          {},
      targetMcu:              "ESP32-S3",
      applicationDescription: localData.appDescription || "",
      hardwarePreprocessing:  { type: "none" },
    };
    const finalClasses = localData.classes || [
      { id: "cls-idle",  name: "idle",  color: CLASS_PALETTE[1] },
      { id: "cls-event", name: "event", color: CLASS_PALETTE[0] },
    ];
    onComplete(finalConfig, finalClasses);
  }

  // ── Quick reply dispatcher ────────────────────────────────────────────────────

  function handleQuickReply(msgId, label, value) {
    switch (phase) {
      case "sensor":        return handleSensorSelect(msgId, label, value);
      case "data_source":   return handleDataSourceSelect(msgId, label, value);
      case "file_confirm":  return handleFileConfirm(msgId, label, value);
      default:              break;
    }
  }

  // ── Text submit dispatcher ───────────────────────────────────────────────────

  function handleSubmit(e) {
    e?.preventDefault?.();
    if (!inputValue.trim()) return;
    switch (phase) {
      case "app_desc": return handleAppDescSubmit();
      case "classes":  return handleClassesSubmit();
      default:         break;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // ── Input visibility ─────────────────────────────────────────────────────────

  const showTextInput = phase === "app_desc" || phase === "classes";
  const placeholder =
    phase === "app_desc"
      ? "Describe your application…"
      : "circle, shake, flick…";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Project Setup
          </span>
        </div>
        <button
          onClick={onManualSetup}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
        >
          Configure manually →
        </button>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1"
        style={{ scrollBehavior: "smooth" }}
      >
        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id} text={msg.text} />
          ) : (
            <BotBubble
              key={msg.id}
              msg={msg}
              onQuickReply={handleQuickReply}
              onFileSelect={handleFileSelect}
              onConfirm={handleConfirm}
            />
          )
        )}

        {isTyping && <TypingIndicator />}

        {/* Scroll anchor */}
        <div />
      </div>

      {/* Text input */}
      {showTextInput && (
        <form onSubmit={handleSubmit} className="flex gap-2 mt-4 flex-shrink-0">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800
                       placeholder-gray-400 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                       transition-colors"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center
                       hover:bg-accent-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                       flex-shrink-0 shadow-sm shadow-accent/25"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}
