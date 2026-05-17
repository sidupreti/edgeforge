import React from "react";

const STEPS = [
  { id: 0, key: "setup",    label: "Setup",    sub: "Project configuration" },
  { id: 1, key: "collect",  label: "Collect",  sub: "Sensor data capture" },
  { id: 2, key: "pipeline", label: "Pipeline", sub: "Feature extraction" },
  { id: 3, key: "train",    label: "Train",    sub: "Model training" },
  { id: 4, key: "validate", label: "Validate", sub: "Model evaluation" },
  { id: 5, key: "export",   label: "Export",   sub: "Deploy to device" },
];

export default function Sidebar({ activeStep, onResetRequest, onOpenSettings }) {
  return (
    <aside
      className="w-64 h-screen flex-shrink-0 flex flex-col overflow-y-auto"
      style={{
        background: "#060b17",
        borderRight: "1px solid rgba(29,158,117,0.12)",
      }}
    >
      {/* Logo / brand */}
      <div
        className="px-6 py-5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span
          className="font-bold text-base tracking-widest uppercase"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            background: "linear-gradient(135deg, #1D9E75 0%, #34d399 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          EdgeForge
        </span>
        <p className="text-xs mt-0.5 tracking-wider" style={{ color: "rgba(255,255,255,0.2)" }}>
          ML Dev Platform
        </p>
      </div>

      {/* Step list */}
      <nav className="flex-1 py-5 px-3 space-y-0.5">
        {STEPS.map((step) => {
          const isActive    = step.id === activeStep;
          const isCompleted = step.id < activeStep;
          const isFuture    = step.id > activeStep;

          return (
            <div
              key={step.key}
              className="flex items-start gap-3 px-3 py-3 rounded-lg transition-all"
              style={{
                background:  isActive ? "rgba(29,158,117,0.08)" : "transparent",
                borderLeft:  isActive ? "2px solid rgba(29,158,117,0.6)" : "2px solid transparent",
                opacity:     isFuture ? 0.35 : 1,
              }}
            >
              {/* Step indicator */}
              <div
                className="mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                style={{
                  background:   isCompleted ? "#1D9E75" : "transparent",
                  border:       isCompleted
                                  ? "none"
                                  : isActive
                                    ? "1.5px solid #1D9E75"
                                    : "1.5px solid rgba(255,255,255,0.15)",
                  color:        isCompleted ? "#fff" : isActive ? "#1D9E75" : "rgba(255,255,255,0.3)",
                }}
              >
                {isCompleted ? (
                  <svg viewBox="0 0 12 12" className="w-3 h-3 fill-current">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span>{step.id + 1}</span>
                )}
              </div>

              {/* Label */}
              <div>
                <p
                  className="text-sm font-semibold tracking-wide"
                  style={{
                    color: isActive    ? "#1D9E75"
                         : isCompleted ? "rgba(255,255,255,0.7)"
                         :               "rgba(255,255,255,0.3)",
                  }}
                >
                  {step.label}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "rgba(255,255,255,0.18)" }}
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
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* Settings gear */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
            style={{
              color: "rgba(255,255,255,0.3)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.3)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Project Settings
          </button>
        )}

        <button
          onClick={onResetRequest}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all group"
          style={{
            color: "rgba(255,255,255,0.25)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#f87171";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.25)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
          }}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
              d="M4 4l8 8M12 4l-8 8" />
          </svg>
          Reset Project
        </button>

        <p className="text-xs px-1" style={{ color: "rgba(255,255,255,0.12)" }}>v0.1.0-alpha</p>
      </div>
    </aside>
  );
}
