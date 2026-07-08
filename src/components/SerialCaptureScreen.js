import React, { useState, useRef, useEffect } from "react";
import API_BASE_URL from "../config";

// eslint-disable-next-line no-unused-vars
const CLASS_PALETTE = ["#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;

export default function SerialCaptureScreen({ projectId, classes, events, setEvents }) {
  // Connection state
  const [port, setPort]             = useState(null);
  const [connected, setConnected]   = useState(false);
  const [portName, setPortName]     = useState("");
  const [connError, setConnError]   = useState(null);

  // Record config
  const [label, setLabel]           = useState(classes[0]?.name || "");
  const [sampleRate, setSampleRate] = useState(100);
  const [sampleLen, setSampleLen]   = useState(1000);

  // Recording state
  const [recording, setRecording]   = useState(false);
  const [progress, setProgress]     = useState(0);    // 0-100
  const [preview, setPreview]       = useState([]);    // last N raw lines for preview
  const bufferRef = useRef([]);       // buffered parsed rows during recording
  const readerRef = useRef(null);
  const recordingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => { recordingRef.current = false; };
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  async function handleConnect() {
    setConnError(null);
    try {
      const p = await navigator.serial.requestPort();
      await p.open({ baudRate: 115200 });
      setPort(p);
      setConnected(true);
      setPortName(p.getInfo?.()?.usbProductId ? `USB ${p.getInfo().usbProductId}` : "Serial device");
    } catch (err) {
      if (err.name !== "NotFoundError") setConnError(err.message);
    }
  }

  async function handleDisconnect() {
    recordingRef.current = false;
    try { readerRef.current?.cancel(); } catch {}
    try { await port?.close(); } catch {}
    setPort(null);
    setConnected(false);
    setPortName("");
  }

  // ── Record ─────────────────────────────────────────────────────────────────
  async function handleStart() {
    if (!port || !label.trim()) return;
    setRecording(true);
    setProgress(0);
    setPreview([]);
    bufferRef.current = [];
    recordingRef.current = true;

    const durationMs = sampleLen;
    const startTime = Date.now();

    // Read stream
    const textDecoder = new TextDecoderStream();
    const readable = port.readable;
    if (!readable) { setRecording(false); return; }
    readable.pipeTo(textDecoder.writable).catch(() => {});
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    let partial = "";
    try {
      while (recordingRef.current) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= durationMs) break;
        setProgress(Math.min(100, Math.round((elapsed / durationMs) * 100)));

        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        partial += value;
        const lines = partial.split("\n");
        partial = lines.pop() || "";

        for (const raw of lines) {
          const line = raw.trim().replace(/\r$/, "");
          if (!line) continue;
          const parts = line.split(",").map(Number);
          if (parts.some(isNaN)) continue; // skip malformed
          bufferRef.current.push(parts);
          setPreview((prev) => [...prev.slice(-20), line]);
        }
      }
    } catch {
      // stream closed
    } finally {
      try { reader.releaseLock(); } catch {}
    }

    recordingRef.current = false;
    setRecording(false);
    setProgress(100);

    // Save the recording
    const rows = bufferRef.current;
    if (rows.length < 2) {
      setConnError("Recording too short — fewer than 2 samples received.");
      return;
    }

    // Build a CSV string and upload via the existing /upload-events endpoint
    const nCols = rows[0].length;
    const channelNames = nCols <= 3
      ? ["ch0", "ch1", "ch2"].slice(0, nCols)
      : Array.from({ length: nCols }, (_, i) => `ch${i}`);
    const dtUs = Math.round(1_000_000 / sampleRate);
    const header = "timestamp," + channelNames.join(",");
    const csvLines = [header];
    for (const row of rows) {
      csvLines.push(dtUs + "," + row.join(","));
    }
    const csvBlob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const file = new File([csvBlob], `${label.replace(/\s+/g, "_")}_${Date.now()}.csv`, { type: "text/csv" });

    const fd = new FormData();
    fd.append("project_id", projectId || "demo-project");
    fd.append("files", file);
    fd.append("labels", label.trim());

    try {
      const res = await fetch(`${API_BASE_URL}/upload-events`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail?.message || body.detail || `Server ${res.status}`);
      }
      const data = await res.json();
      // Add to events list (same format as CSV upload)
      const newEvents = (data.events || []).map((ev) => ({
        id:            ev.id,
        datasetId:     ev.dataset_id ?? null,
        classId:       classes.find((c) => c.name === label)?.id ?? null,
        className:     label,
        classColor:    classes.find((c) => c.name === label)?.color ?? "#999",
        waveform:      ev.waveform_az ?? ev.waveform_ax ?? [],
        waveColor:     "#1D9E75",
        duration:      ev.duration_ms,
        timestamp:     new Date().toLocaleTimeString(),
        snapshot:      (() => {
          const chs = ev.channels || [];
          const snap = {};
          const wfs = [ev.waveform_ax, ev.waveform_ay, ev.waveform_az];
          if (chs.length > 0) chs.forEach((ch, i) => { snap[ch] = wfs[i] ?? []; });
          else { snap.ch0 = ev.waveform_ax ?? []; }
          return snap;
        })(),
        channels:      ev.channels || channelNames,
        filename:      file.name,
        notes:         ev.notes ?? [],
        sampleRateHz:  sampleRate,
        pool:          "train",
        qualityStatus: ev.quality_status ?? "pass",
        qualityFlags:  ev.quality_flags ?? [],
        quarantined:   ev.quarantined ?? false,
      }));
      setEvents((prev) => [...newEvents, ...prev]);
    } catch (err) {
      setConnError(`Save failed: ${err.message}`);
    }
  }

  // ── Not supported ──────────────────────────────────────────────────────────
  if (!serialSupported) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-14 h-14 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
          <span className="text-2xl">🔌</span>
        </div>
        <p className="text-sm text-gray-600 font-semibold">Live capture requires Chrome or Edge</p>
        <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
          Web Serial is not supported in this browser. Use Chrome or Edge for live device capture,
          or switch to "Upload CSV" mode to upload recorded data files.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      {/* Connection bar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {connected ? (
          <>
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs text-gray-600 font-semibold">{portName}</span>
            <button onClick={handleDisconnect}
              className="text-xs text-gray-400 hover:text-red-400 border border-gray-200 rounded px-2 py-1 transition-colors">
              Disconnect
            </button>
          </>
        ) : (
          <button onClick={handleConnect}
            className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-4 py-2 hover:bg-accent/5 transition-colors">
            Connect device
          </button>
        )}
        {connError && <span className="text-xs text-red-500">{connError}</span>}
      </div>

      {/* Record config */}
      {connected && (
        <div className="flex items-end gap-4 flex-shrink-0 flex-wrap">
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Label</label>
            <select value={label} onChange={(e) => setLabel(e.target.value)}
              className="border border-gray-200 rounded px-2.5 py-1.5 text-xs outline-none focus:border-accent min-w-[120px]">
              {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Frequency</label>
            <div className="flex items-center gap-1">
              <input type="number" min={1} max={10000} value={sampleRate}
                onChange={(e) => setSampleRate(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-accent" />
              <span className="text-xs text-gray-400">Hz</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Sample length</label>
            <div className="flex items-center gap-1">
              <input type="number" min={100} max={60000} step={100} value={sampleLen}
                onChange={(e) => setSampleLen(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-accent" />
              <span className="text-xs text-gray-400">ms</span>
            </div>
          </div>
          <button onClick={handleStart} disabled={recording || !label.trim()}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
              recording ? "bg-red-50 text-red-500 border border-red-200"
                : "bg-accent text-white hover:bg-accent-dark shadow-sm shadow-accent/25"
            }`}>
            {recording ? `Recording… ${progress}%` : "Start"}
          </button>
        </div>
      )}

      {/* Progress bar */}
      {recording && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
          <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Live preview */}
      {recording && preview.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 flex-shrink-0 max-h-28 overflow-y-auto">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Incoming data</p>
          <pre className="text-[10px] font-mono text-gray-500 leading-relaxed">
            {preview.slice(-8).join("\n")}
          </pre>
        </div>
      )}

      {/* Recorded samples list */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
        <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">
          Recorded samples ({events.length})
        </p>
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 border border-dashed border-gray-200 rounded gap-1">
            <span className="text-gray-300 text-xs">No samples yet</span>
            <span className="text-gray-200 text-xs">Connect a device and click Start</span>
          </div>
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded text-xs">
              <span className="font-semibold px-1.5 py-0.5 rounded"
                style={{ color: ev.classColor, backgroundColor: `${ev.classColor}1a` }}>
                {ev.className}
              </span>
              <span className="text-gray-400 tabular-nums">{ev.duration} ms</span>
              <span className="text-gray-300">{ev.timestamp}</span>
              {ev.filename && <span className="text-gray-200 text-[10px] truncate ml-auto">{ev.filename}</span>}
            </div>
          ))
        )}
      </div>

      {/* Data format help */}
      <details className="flex-shrink-0 text-[11px] text-gray-400">
        <summary className="cursor-pointer hover:text-gray-600 transition-colors">Data format guide</summary>
        <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-white space-y-2 leading-relaxed">
          <p><strong>Your firmware must stream:</strong> comma-separated numeric values, one sample per line.</p>
          <pre className="bg-gray-50 rounded px-2 py-1 text-[10px] font-mono text-accent">
{`0.12,-0.04,9.81
0.13,-0.04,9.80
0.11,-0.03,9.82`}
          </pre>
          <ul className="list-disc list-inside space-y-0.5">
            <li>One line = one sample (all channels in that line)</li>
            <li>Values separated by commas</li>
            <li>Stream at the configured frequency (e.g. 100 Hz = one line every 10ms)</li>
            <li>Channel count inferred from the number of values per line</li>
            <li>No header row needed — just stream values</li>
          </ul>
          <p className="text-gray-300">Baud rate: 115200. Malformed/partial lines are skipped.</p>
        </div>
      </details>
    </div>
  );
}
