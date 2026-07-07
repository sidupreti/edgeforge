import React, { useState, useEffect, useRef } from "react";

// ── Constants (same as CollectScreen) ────────────────────────────────────────

const AXIS_COLORS  = { ax: "#1D9E75", ay: "#3B82F6", az: "#F59E0B" };
const AXIS_LABELS  = { ax: "a_x",     ay: "a_y",     az: "a_z"     };
const SAMPLE_RATE  = 100;
const BUFFER_SIZE  = 500;
const CAPTURE_WIN  = 80;

function WaveformThumb({ data, color = "#1D9E75", w = 64, h = 28 }) {
  if (!data?.length) return <div style={{ width: w, height: h }} className="bg-gray-100 rounded" />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 0.001;
  const pts = data.map((v, i) => {
    const x = ((i / (data.length - 1)) * w).toFixed(1);
    const y = (h - 1 - ((v - min) / range) * (h - 2)).toFixed(1);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="flex-shrink-0 rounded overflow-hidden"
      style={{ background: "#f8f7f3", border: "1px solid #ebeae5" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function getActiveAxes(sensorType = "") {
  const s = sensorType.toLowerCase();
  if (s.includes("accelerometer") || s.includes("imu")) return ["ax", "ay", "az"];
  if (s.includes("microphone") || s.includes("pdm"))    return ["ax"];
  if (s.includes("proximity")  || s.includes("tof"))    return ["ax"];
  return ["ax", "ay"];
}

// ── Main component ───────────────────────────────────────────────────────────

export default function LiveCaptureMode({
  config, events, setEvents, activeClassId, classes, analyzeResult,
}) {
  const activeAxes = getActiveAxes(config?.sensorType);

  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const isRecordingRef   = useRef(true);
  const activeClassIdRef = useRef(activeClassId);
  const classesRef       = useRef(classes);
  const addEventRef      = useRef(null);

  const [isRecording,   setIsRecording]   = useState(true);
  const [timeSinceLast, setTimeSinceLast] = useState(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const lastEventTimeRef = useRef(null);

  // Keep refs in sync
  isRecordingRef.current   = isRecording;
  activeClassIdRef.current = activeClassId;
  classesRef.current       = classes;

  addEventRef.current = (snapshot, durationMs) => {
    const classId = activeClassIdRef.current;
    const cls     = classesRef.current.find((c) => c.id === classId);
    const firstAx = activeAxes[0] ?? "ax";
    setEvents((prev) => [{
      id:         `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      classId,
      className:  cls?.name  ?? classId,
      classColor: cls?.color ?? "#1D9E75",
      waveform:   snapshot[firstAx] ?? [],
      waveColor:  AXIS_COLORS[firstAx] ?? "#1D9E75",
      duration:   durationMs,
      timestamp:  new Date().toLocaleTimeString(),
      snapshot,
    }, ...prev]);
    lastEventTimeRef.current = Date.now();
    setTimeSinceLast(0);
  };

  // Tick "time since last event"
  useEffect(() => {
    const iv = setInterval(() => {
      if (lastEventTimeRef.current !== null) {
        setTimeSinceLast(Math.floor((Date.now() - lastEventTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const init = () => {
      canvas.width  = canvas.offsetWidth  || 700;
      canvas.height = canvas.offsetHeight || 180;
      startLoop(canvas);
    };
    const raf0 = requestAnimationFrame(init);
    return () => { cancelAnimationFrame(raf0); cancelAnimationFrame(animRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startLoop(canvas) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const buffers = { ax: [], ay: [], az: [] };
    let frame = 0, burstActive = false, burstStrength = 0, burstFrames = 0;
    let nextBurstAt = performance.now() + 2800 + Math.random() * 400;
    let capturing = false, captureFrames = 0;
    const capBuf = { ax: [], ay: [], az: [] };

    function sample(f, axis) {
      const t = f / SAMPLE_RATE;
      let base;
      switch (axis) {
        case "ax": base = 0.35 * Math.sin(2*Math.PI*2.1*t); break;
        case "ay": base = 0.28 * Math.sin(2*Math.PI*3.3*t + 1.0); break;
        case "az": base = 0.22 * Math.sin(2*Math.PI*1.7*t + 2.1) + 0.08; break;
        default:   base = 0.30 * Math.sin(2*Math.PI*2.0*t);
      }
      const noise = (Math.random()-0.5)*0.04;
      const bScale = axis==="ax"?1:axis==="ay"?0.72:0.50;
      const burst = burstActive ? burstStrength*bScale*(Math.random()-0.5)*1.8 : 0;
      return base + noise + burst;
    }

    function tick() {
      frame++;
      const now = performance.now();
      if (burstActive) {
        burstFrames--; burstStrength *= 0.88;
        if (burstFrames <= 0) { burstActive=false; burstStrength=0; nextBurstAt=now+2800+Math.random()*400; }
      } else if (now >= nextBurstAt) {
        burstActive=true; burstStrength=0.80+Math.random()*0.55; burstFrames=18+Math.floor(Math.random()*14);
        if (isRecordingRef.current) { capturing=true; captureFrames=CAPTURE_WIN; capBuf.ax=[]; capBuf.ay=[]; capBuf.az=[]; }
      }
      ["ax","ay","az"].forEach((axis) => {
        const v = sample(frame, axis);
        buffers[axis].push(v); if (buffers[axis].length > BUFFER_SIZE) buffers[axis].shift();
        if (capturing) capBuf[axis].push(v);
      });
      if (capturing) {
        captureFrames--;
        if (captureFrames <= 0) {
          capturing=false;
          addEventRef.current({ax:[...capBuf.ax],ay:[...capBuf.ay],az:[...capBuf.az]}, Math.round((CAPTURE_WIN/SAMPLE_RATE)*1000));
        }
      }
      // Draw
      ctx.clearRect(0,0,W,H); ctx.fillStyle="#fbfaf6"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(10,10,10,0.06)"; ctx.lineWidth=1; ctx.setLineDash([]);
      for (let g=0;g<=4;g++){const y=Math.round((g/4)*H)+0.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      ctx.strokeStyle="rgba(10,10,10,0.12)";ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();ctx.setLineDash([]);
      if (capturing){const p=1-captureFrames/CAPTURE_WIN;ctx.fillStyle="rgba(10,10,10,0.04)";ctx.fillRect(W-p*W,0,p*W,H);ctx.strokeStyle="rgba(10,10,10,0.25)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W-p*W,0);ctx.lineTo(W-p*W,H);ctx.stroke();}
      activeAxes.forEach((axis)=>{
        const buf=buffers[axis]; if(buf.length<2)return;
        ctx.strokeStyle=AXIS_COLORS[axis];ctx.lineWidth=1.5;
        if(burstActive&&burstStrength>0.35){ctx.shadowColor=AXIS_COLORS[axis];ctx.shadowBlur=5;}
        ctx.beginPath();buf.forEach((v,i)=>{const x=(i/(BUFFER_SIZE-1))*W;const y=H/2-v*(H*0.36);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();ctx.shadowBlur=0;
      });
      if(burstActive&&burstStrength>0.25){ctx.fillStyle=`rgba(10,10,10,${(burstStrength*0.04).toFixed(3)})`;ctx.fillRect(0,0,W,H);}
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
  }

  function deleteEvent(id) { setEvents((prev) => prev.filter((e) => e.id !== id)); }
  const activeClass = classes.find((c) => c.id === activeClassId);
  const totalEvents = events.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">
      {/* Signal canvas */}
      <div className="bg-gray-900 rounded-lg border border-gray-700 flex-shrink-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/60">
          <div className="flex items-center gap-5">
            {activeAxes.map((axis) => (
              <div key={axis} className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 rounded-full" style={{ backgroundColor: AXIS_COLORS[axis] }} />
                <span className="text-xs" style={{ color: AXIS_COLORS[axis] }}>{AXIS_LABELS[axis]}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 tabular-nums">{SAMPLE_RATE} Hz</span>
            {isRecording && (
              <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold text-red-400 tracking-widest">REC</span>
              </div>
            )}
          </div>
        </div>
        <canvas ref={canvasRef} className="w-full block" style={{ height: "180px" }} />
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
                <button onClick={() => { setEvents([]); setClearAllConfirm(false); }} className="text-red-400 hover:text-red-600 font-semibold">Yes</button>
                <button onClick={() => setClearAllConfirm(false)} className="text-gray-400 hover:text-gray-600">No</button>
              </span>
            ) : (
              <button onClick={() => setClearAllConfirm(true)} className="text-gray-500 hover:text-red-400 transition-colors ml-1">Clear all</button>
            )
          )}
        </div>
        <div className="w-px h-3 bg-gray-200" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">class</span>
          <span className="font-semibold" style={{ color: activeClass?.color ?? "#1D9E75" }}>{activeClass?.name ?? "—"}</span>
        </div>
        <div className="w-px h-3 bg-gray-200" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">last event</span>
          <span className="text-gray-500 tabular-nums">
            {timeSinceLast === null ? "—" : timeSinceLast === 0 ? "just now" : `${timeSinceLast}s ago`}
          </span>
        </div>
        <button onClick={() => setIsRecording((r) => !r)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded border text-xs transition-colors ${
            isRecording ? "border-red-400/40 text-red-400 hover:bg-red-50" : "border-accent/40 text-accent hover:bg-accent/5"
          }`}>
          {isRecording ? "⏹ Stop" : "⏺ Record"}
        </button>
      </div>

      {/* AI analysis banner */}
      {analyzeResult && (
        <div className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sf-gray-100 text-xs" style={{ background: "#f8f7f3" }}>
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
            <div key={ev.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-100 rounded hover:border-gray-200 group transition-colors">
              <WaveformThumb data={ev.waveform} color={ev.waveColor} />
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                  style={{ color: ev.classColor, backgroundColor: `${ev.classColor}1a` }}>{ev.className}</span>
                <span className="text-xs text-gray-400 tabular-nums">{ev.duration} ms</span>
                <span className="text-xs text-gray-300">{ev.timestamp}</span>
              </div>
              <button onClick={() => deleteEvent(ev.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-base leading-none px-1" title="Delete">×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
