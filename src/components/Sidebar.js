import React from "react";

const STEPS = [
  { id: 0, key: "setup",    label: "Setup",    sub: "Project configuration" },
  { id: 1, key: "collect",  label: "Collect",  sub: "Sensor data capture" },
  { id: 2, key: "pipeline", label: "Pipeline", sub: "Feature extraction" },
  { id: 3, key: "train",    label: "Train",    sub: "Model training" },
  { id: 4, key: "validate", label: "Validate", sub: "Model evaluation" },
  { id: 5, key: "export",   label: "Export",   sub: "Deploy to device" },
];

export default function Sidebar({ activeStep }) {
  return (
    <aside className="w-64 h-screen flex-shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col overflow-y-auto">
      {/* Logo / brand */}
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-accent font-bold text-lg tracking-widest uppercase">
          EdgeForge
        </span>
        <p className="text-gray-500 text-xs mt-0.5 tracking-wider">
          ML Dev Platform
        </p>
      </div>

      {/* Step list */}
      <nav className="flex-1 py-6 px-4 space-y-1">
        {STEPS.map((step) => {
          const isActive    = step.id === activeStep;
          const isCompleted = step.id < activeStep;
          const isFuture    = step.id > activeStep;

          return (
            <div
              key={step.key}
              className={`
                flex items-start gap-3 px-3 py-3 rounded
                ${isActive    ? "bg-gray-800 border border-accent/30" : ""}
                ${isFuture    ? "opacity-40" : ""}
              `}
            >
              {/* Step indicator */}
              <div
                className={`
                  mt-0.5 w-5 h-5 rounded-full border flex-shrink-0
                  flex items-center justify-center text-xs font-bold
                  ${isActive    ? "border-accent text-accent" : ""}
                  ${isCompleted ? "bg-accent border-accent text-white" : ""}
                  ${isFuture    ? "border-gray-600 text-gray-600" : ""}
                `}
              >
                {isCompleted ? (
                  <svg viewBox="0 0 12 12" className="w-3 h-3 fill-current">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span>{step.id + 1}</span>
                )}
              </div>

              {/* Label */}
              <div>
                <p
                  className={`text-sm font-semibold tracking-wide ${
                    isActive    ? "text-accent" :
                    isCompleted ? "text-gray-300" :
                                  "text-gray-500"
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{step.sub}</p>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-700">
        <p className="text-gray-600 text-xs">v0.1.0-alpha</p>
      </div>
    </aside>
  );
}
