import React from "react";

const SENSOR_TYPES = [
  "Accelerometer (IMU)",
  "Microphone (PDM)",
  "Temperature / Humidity",
  "Pressure (Barometric)",
  "Proximity (ToF)",
  "Custom / Analog",
];

const CONNECTION_TYPES = [
  "File Upload (CSV / WAV)",
  "Serial / UART",
  "USB CDC",
  "BLE (nRF)",
  "Wi-Fi (MQTT)",
];

const TRIGGER_TYPES = [
  "Threshold",
  "Firmware Marker",
  "Periodic",
];

const TARGET_MCUS = [
  "STM32L476RG",
  "STM32H743ZI",
  "nRF5340-DK",
  "Arduino Nano 33 BLE",
  "ESP32-S3",
  "RP2040 (Raspberry Pi Pico)",
  "ATSAMD51 (Adafruit M4)",
];

function Label({ children }) {
  return (
    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1">
      {children}
    </label>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800
                 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                 appearance-none cursor-pointer"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800
                 placeholder-gray-400 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
    />
  );
}

function TriggerConfig({ triggerType, triggerConfig, setTriggerConfig }) {
  const set = (key, val) => setTriggerConfig((prev) => ({ ...prev, [key]: val }));

  if (triggerType === "Threshold") {
    return (
      <div className="mt-4 pl-3 border-l-2 border-accent/40 space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Threshold config</p>
        <div>
          <Label>Onset (mg)</Label>
          <Input
            type="number"
            value={triggerConfig.onset ?? ""}
            onChange={(v) => set("onset", v)}
            placeholder="e.g. 150"
          />
        </div>
        <div>
          <Label>Hold (ms)</Label>
          <Input
            type="number"
            value={triggerConfig.hold ?? ""}
            onChange={(v) => set("hold", v)}
            placeholder="e.g. 20"
          />
        </div>
        <div>
          <Label>Release (mg)</Label>
          <Input
            type="number"
            value={triggerConfig.release ?? ""}
            onChange={(v) => set("release", v)}
            placeholder="e.g. 80"
          />
        </div>
      </div>
    );
  }

  if (triggerType === "Firmware Marker") {
    return (
      <div className="mt-4 pl-3 border-l-2 border-accent/40 space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Marker config</p>
        <div>
          <Label>Marker string</Label>
          <Input
            value={triggerConfig.markerString ?? ""}
            onChange={(v) => set("markerString", v)}
            placeholder="e.g. ##START##"
          />
        </div>
      </div>
    );
  }

  if (triggerType === "Periodic") {
    return (
      <div className="mt-4 pl-3 border-l-2 border-accent/40 space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Periodic config</p>
        <div>
          <Label>Window length (ms)</Label>
          <Input
            type="number"
            value={triggerConfig.windowLength ?? ""}
            onChange={(v) => set("windowLength", v)}
            placeholder="e.g. 2000"
          />
        </div>
      </div>
    );
  }

  return null;
}

function DeviceStatusPanel({ connectionType }) {
  const isFileUpload = connectionType === "File Upload (CSV / WAV)";
  const isReady = isFileUpload;

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-4">
        Device Status
      </h3>

      {/* Status card */}
      <div
        className={`
          rounded border p-5 mb-4
          ${isReady
            ? "bg-accent/5 border-accent/30"
            : "bg-gray-50 border-gray-200"
          }
        `}
      >
        {/* Status dot + label */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              isReady ? "bg-accent animate-pulse" : "bg-gray-300"
            }`}
          />
          <span
            className={`text-sm font-semibold tracking-wide ${
              isReady ? "text-accent" : "text-gray-400"
            }`}
          >
            {isReady ? "READY" : "NO DEVICE DETECTED"}
          </span>
        </div>

        {isReady ? (
          <p className="text-xs text-gray-500 leading-relaxed">
            File upload mode selected. Drop a CSV or WAV file in the{" "}
            <span className="text-accent">Collect</span> step to begin.
          </p>
        ) : (
          <p className="text-xs text-gray-400 leading-relaxed">
            {connectionType
              ? `Waiting for ${connectionType} connection…`
              : "Select a connection type to continue."}
          </p>
        )}
      </div>

      {/* Specs table */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
          Detected specs
        </p>
        {[
          ["Port",    isReady ? "—"          : "—"],
          ["Baud",    isReady ? "—"          : "—"],
          ["Firmware","—"],
          ["SDK ver", "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-gray-400">{k}</span>
            <span className="text-gray-600">{v}</span>
          </div>
        ))}
      </div>

      {/* Connection type indicator */}
      {connectionType && (
        <div className="mt-auto pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Mode:</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {connectionType}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SetupScreen({ config, setConfig, submitError }) {
  const { projectName, sensorType, connectionType, triggerType, triggerConfig, targetMcu } = config;

  const update = (key, val) => setConfig((prev) => ({ ...prev, [key]: val }));
  const setTriggerConfig = (updater) =>
    setConfig((prev) => ({ ...prev, triggerConfig: updater(prev.triggerConfig) }));

  return (
    <div className="flex gap-8 h-full">
      {/* Left column — form */}
      <div className="flex-1 space-y-6 max-w-lg">
        <div>
          <Label>Project Name</Label>
          <Input
            value={projectName}
            onChange={(v) => update("projectName", v)}
            placeholder="e.g. gesture-detection-v1"
          />
        </div>

        <div>
          <Label>Sensor Type</Label>
          <Select
            value={sensorType}
            onChange={(v) => update("sensorType", v)}
            options={SENSOR_TYPES}
            placeholder="Select sensor…"
          />
        </div>

        <div>
          <Label>Connection Type</Label>
          <Select
            value={connectionType}
            onChange={(v) => update("connectionType", v)}
            options={CONNECTION_TYPES}
            placeholder="Select connection…"
          />
        </div>

        <div>
          <Label>Event Trigger</Label>
          <Select
            value={triggerType}
            onChange={(v) => {
              update("triggerType", v);
              setTriggerConfig(() => ({}));
            }}
            options={TRIGGER_TYPES}
            placeholder="Select trigger…"
          />
          <TriggerConfig
            triggerType={triggerType}
            triggerConfig={triggerConfig}
            setTriggerConfig={setTriggerConfig}
          />
        </div>

        <div>
          <Label>Target MCU</Label>
          <Select
            value={targetMcu}
            onChange={(v) => update("targetMcu", v)}
            options={TARGET_MCUS}
            placeholder="Select MCU…"
          />
        </div>

        {submitError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded px-4 py-3">
            <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-red-600 leading-relaxed">{submitError}</p>
          </div>
        )}
      </div>

      {/* Right column — device status */}
      <div className="w-64 flex-shrink-0">
        <DeviceStatusPanel connectionType={connectionType} />
      </div>
    </div>
  );
}
