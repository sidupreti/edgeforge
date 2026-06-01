import React from "react";

const STEPS = [
  { id: 0, key: "setup",    label: "Setup",    sub: "Project configuration" },
  { id: 1, key: "collect",  label: "Collect",  sub: "Sensor data capture" },
  { id: 2, key: "pipeline", label: "Pipeline", sub: "Feature extraction" },
  { id: 3, key: "train",    label: "Train",    sub: "Model training" },
  { id: 4, key: "validate", label: "Validate", sub: "Model evaluation" },
  { id: 5, key: "export",   label: "Export",   sub: "Deploy to device" },
];

/* Chip-interconnect logo SVG */
function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-label="SensorFlow logo">
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill="#0a0a0a"/>
      <rect x="13" y="13" width="4" height="4" rx="0.6" fill="white"/>
      <rect x="19" y="13" width="4" height="4" rx="0.6" fill="white" opacity="0.75"/>
      <rect x="13" y="19" width="4" height="4" rx="0.6" fill="white" opacity="0.75"/>
      <rect x="19" y="19" width="4" height="4" rx="0.6" fill="white"/>
      <line x1="17" y1="15" x2="19" y2="15" stroke="white" strokeWidth="0.8"/>
      <line x1="15" y1="17" x2="15" y2="19" stroke="white" strokeWidth="0.8"/>
      <line x1="21" y1="17" x2="21" y2="19" stroke="white" strokeWidth="0.8"/>
      <line x1="17" y1="21" x2="19" y2="21" stroke="white" strokeWidth="0.8"/>
      <rect x="14" y="6" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="20" y="6" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="14" y="26" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="20" y="26" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="6" y="14" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="6" y="20" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="26" y="14" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="26" y="20" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
    </svg>
  );
}

export default function Sidebar({ activeStep, onResetRequest, onOpenSettings }) {
  return (
    <aside
      className="w-64 h-screen flex-shrink-0 flex flex-col overflow-y-auto"
      style={{
        background:  "#ffffff",
        borderRight: "1px solid #ebeae5",
      }}
    >
      {/* Logo / brand */}
      <div
        className="px-5 py-5 flex items-center gap-3"
        style={{ borderBottom: "1px solid #ebeae5" }}
      >
        <LogoMark size={28} />
        <div>
          <span
            className="font-bold text-base"
            style={{
              fontFamily: "'Syne', sans-serif",
              color: "#0a0a0a",
              letterSpacing: "-0.02em",
            }}
          >
            SensorFlow
          </span>
          <p
            className="text-xs mt-0.5"
            style={{ fontFamily: "'DM Mono', monospace", color: "#b0afa8", letterSpacing: "0.04em" }}
          >
            Embedded ML
          </p>
        </div>
      </div>

      {/* Step list */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {STEPS.map((step) => {
          const isActive    = step.id === activeStep;
          const isCompleted = step.id < activeStep;
          const isFuture    = step.id > activeStep;

          return (
            <div
              key={step.key}
              className="flex items-start gap-3 px-3 py-3 rounded-lg transition-all"
              style={{
                background:  isActive ? "#f8f7f3" : "transparent",
                borderLeft:  isActive ? "2px solid #0a0a0a" : "2px solid transparent",
                opacity:     isFuture ? 0.4 : 1,
              }}
            >
              {/* Mono step number */}
              <div
                className="mt-0.5 w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{
                  background:  isCompleted ? "#0a0a0a" : isActive ? "#0a0a0a" : "transparent",
                  border:      isCompleted || isActive
                                 ? "none"
                                 : "1px solid #d8d7d0",
                  color:       isCompleted || isActive ? "#ffffff" : "#b0afa8",
                  fontFamily:  "'DM Mono', monospace",
                  fontSize:    "11px",
                  fontWeight:  500,
                }}
              >
                {isCompleted ? (
                  <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                ) : (
                  String(step.id + 1).padStart(2, "0")
                )}
              </div>

              {/* Label */}
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    color: isActive ? "#0a0a0a"
                         : isCompleted ? "#3a3935"
                         : "#6b6a63",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {step.label}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ fontFamily: "'DM Mono', monospace", color: "#b0afa8", fontSize: "10px", letterSpacing: "0.02em" }}
                >
                  {step.sub}
                </p>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-4 space-y-2"
        style={{ borderTop: "1px solid #ebeae5" }}
      >
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
            style={{
              color:      "#6b6a63",
              border:     "1px solid #ebeae5",
              background: "#ffffff",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color       = "#0a0a0a";
              e.currentTarget.style.borderColor = "#d8d7d0";
              e.currentTarget.style.background  = "#f8f7f3";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color       = "#6b6a63";
              e.currentTarget.style.borderColor = "#ebeae5";
              e.currentTarget.style.background  = "#ffffff";
            }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Project Settings
          </button>
        )}

        <button
          onClick={onResetRequest}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
          style={{
            color:      "#8a8982",
            border:     "1px solid #ebeae5",
            background: "#ffffff",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color       = "#ef4444";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)";
            e.currentTarget.style.background  = "#fff5f5";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color       = "#8a8982";
            e.currentTarget.style.borderColor = "#ebeae5";
            e.currentTarget.style.background  = "#ffffff";
          }}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 4l8 8M12 4l-8 8" />
          </svg>
          Reset Project
        </button>

        <p
          className="text-xs px-1"
          style={{ fontFamily: "'DM Mono', monospace", color: "#d8d7d0", fontSize: "10px" }}
        >
          v0.1.0-alpha
        </p>
      </div>
    </aside>
  );
}
