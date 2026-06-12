import React, { useState, useRef, useEffect } from "react";
import API_BASE_URL from "../config";

const STARTER_CHIPS = [
  "Why is my accuracy low?",
  "What features should I use?",
  "Is my data good enough?",
  "Which class is hardest to classify?",
  "What cutoff should I use?",
];

const ACTION_LABELS = {
  set_cutoff:  (v) => `cutoff → ${v} Hz`,
  set_window:  (v) => `window → ${v} ms`,
  set_model:   (v) => `model → ${v}`,
  add_feature: (v) => `add ${v}`,
};

/** Detect labeling intent so the label-tool path is activated on the backend. */
function isLabelingIntent(text) {
  return (
    /\b(label|relabel|re-label|rename)\b/i.test(text) ||
    /\b(call|mark|tag|set|change)\b.{0,30}\b(as|to)\b/i.test(text)
  );
}

const CLASS_PALETTE = [
  "#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];

export default function CopilotChat({
  chatHistory,
  setChatHistory,
  projectId,
  onApplyAction,
  screen,
  pipelineConfig,
  events,
  classes,
  setEvents,
  setClasses,
}) {
  const [input,     setInput]     = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef                  = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  // ── send an ordinary user message ─────────────────────────────────────────
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput("");

    setChatHistory((prev) => [
      ...prev,
      {
        id:        `${Date.now()}-u`,
        role:      "user",
        content:   trimmed,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    setIsLoading(true);

    const useLabelTools = isLabelingIntent(trimmed);

    // Collect DB dataset IDs of events currently visible in the UI.
    // These scope the AI's preview to only what the user sees, not all
    // historical datasets stored in the backend DB.
    const visibleDatasetIds = useLabelTools
      ? (events ?? []).map((e) => e.datasetId).filter(Boolean)
      : [];

    try {
      const res = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:              trimmed,
          project_id:           projectId ?? "demo-project",
          screen:               screen     ?? undefined,
          pipeline_config:      pipelineConfig ?? undefined,
          use_label_tools:      useLabelTools,
          visible_dataset_ids:  visibleDatasetIds,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();

      if (data.pending_operation) {
        // AI proposed a label operation → show confirm card, no mutation yet
        setChatHistory((prev) => [
          ...prev,
          {
            id:               `${Date.now()}-a`,
            role:             "assistant",
            type:             "confirm_card",
            content:          data.message,
            pendingOperation: data.pending_operation,
            timestamp:        new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        setChatHistory((prev) => [
          ...prev,
          {
            id:        `${Date.now()}-a`,
            role:      "assistant",
            content:   data.message,
            actions:   data.actions ?? [],
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      }
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          id:        `${Date.now()}-e`,
          role:      "assistant",
          content:   "Couldn't reach the copilot — is the backend running?",
          actions:   [],
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // ── user clicked Confirm on a pending label operation ─────────────────────
  async function handleConfirm(pendingOperation, msgId) {
    // Mark card as confirmed (shows "Applying…" state)
    setChatHistory((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, confirmed: true } : m))
    );
    setIsLoading(true);

    // The selector already contains dataset_ids scoped to visible events
    // (set by the backend during the proposal phase). Belt-and-suspenders:
    // if it somehow still has an empty selector and we have visible events,
    // restrict it now to avoid touching out-of-UI datasets.
    const visibleDatasetIds = (events ?? []).map((e) => e.datasetId).filter(Boolean);
    let scopedOp = pendingOperation;
    if (
      visibleDatasetIds.length > 0 &&
      (!pendingOperation.selector || Object.keys(pendingOperation.selector).length === 0)
    ) {
      scopedOp = {
        ...pendingOperation,
        selector: { dataset_ids: visibleDatasetIds },
      };
    }

    try {
      const res = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:           "confirmed",
          project_id:        projectId ?? "demo-project",
          confirm_operation: scopedOp,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();

      // ── Update React events state so the UI immediately reflects the new label ──
      const newLabel = (scopedOp.params ?? {}).new_label ?? "";
      const affectedIds = new Set(
        (scopedOp.selector?.dataset_ids ?? []).map(Number)
      );

      if (newLabel && setEvents) {
        // Find or create the class for the new label
        let targetClass = (classes ?? []).find(
          (c) => c.name.toLowerCase() === newLabel.toLowerCase()
        );
        if (!targetClass && setClasses) {
          const existingClasses = classes ?? [];
          targetClass = {
            id:    `cls-${Date.now()}`,
            name:  newLabel,
            color: CLASS_PALETTE[existingClasses.length % CLASS_PALETTE.length],
          };
          setClasses((prev) => [...prev, targetClass]);
        }

        if (targetClass) {
          setEvents((prev) =>
            prev.map((ev) => {
              if (ev.datasetId && affectedIds.has(Number(ev.datasetId))) {
                return {
                  ...ev,
                  classId:    targetClass.id,
                  className:  targetClass.name,
                  classColor: targetClass.color,
                };
              }
              return ev;
            })
          );
        }
      }

      setChatHistory((prev) => [
        ...prev,
        {
          id:        `${Date.now()}-s`,
          role:      "assistant",
          type:      "success_label",
          content:   data.message,
          logId:     data.log_id,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          id:        `${Date.now()}-e`,
          role:      "assistant",
          content:   "Relabeling failed — is the backend running?",
          actions:   [],
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // ── user clicked Cancel ────────────────────────────────────────────────────
  function handleCancel(msgId) {
    setChatHistory((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, cancelled: true } : m))
    );
  }

  // ── user clicked Undo after a successful relabeling ───────────────────────
  async function handleUndo(logId, msgId) {
    try {
      const res = await fetch(`${API_BASE_URL}/command-log/${logId}/undo`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setChatHistory((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, undone: true } : m))
      );
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          id:        `${Date.now()}-e`,
          role:      "assistant",
          content:   "Undo failed — is the backend running?",
          actions:   [],
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  }

  const isEmpty = chatHistory.length === 0 && !isLoading;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
          <div
            className={`w-1.5 h-1.5 rounded-full bg-accent ${
              isLoading ? "animate-ping" : "animate-pulse"
            }`}
          />
        </div>
        <span className="text-xs uppercase tracking-widest text-gray-400">Ask Copilot</span>
      </div>

      {/* Message list */}
      {(chatHistory.length > 0 || isLoading) && (
        <div
          ref={scrollRef}
          className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-0.5"
        >
          {chatHistory.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {/* ── user bubble ── */}
              {msg.role === "user" ? (
                <div className="bg-accent text-white text-xs px-3 py-1.5 rounded-2xl rounded-tr-sm max-w-[85%] leading-relaxed">
                  {msg.content}
                </div>

              /* ── confirm card (pending, not yet confirmed or cancelled) ── */
              ) : msg.type === "confirm_card" && !msg.confirmed && !msg.cancelled ? (
                <div className="flex items-start gap-1.5 max-w-[95%]">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="bg-amber-50 border border-amber-200 text-gray-700 text-xs px-3 py-2 rounded-2xl rounded-tl-sm leading-relaxed">
                      {msg.content}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleConfirm(msg.pendingOperation, msg.id)}
                        disabled={isLoading}
                        className="text-xs bg-accent text-white px-3 py-1 rounded-full hover:bg-accent-dark transition-colors font-semibold disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(msg.id)}
                        className="text-xs text-gray-500 border border-gray-200 px-3 py-1 rounded-full hover:border-gray-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>

              /* ── confirm card: applying… ── */
              ) : msg.type === "confirm_card" && msg.confirmed && !msg.cancelled ? (
                <div className="flex items-start gap-1.5 max-w-[95%]">
                  <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0 animate-pulse" />
                  <div className="bg-gray-100 text-gray-400 text-xs px-3 py-1.5 rounded-2xl rounded-tl-sm leading-relaxed italic">
                    Applying…
                  </div>
                </div>

              /* ── confirm card: cancelled ── */
              ) : msg.type === "confirm_card" && msg.cancelled ? (
                <div className="flex items-start gap-1.5 max-w-[95%]">
                  <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                  <div className="bg-gray-100 text-gray-400 text-xs px-3 py-1.5 rounded-2xl rounded-tl-sm leading-relaxed italic">
                    Cancelled.
                  </div>
                </div>

              /* ── success card with undo button ── */
              ) : msg.type === "success_label" ? (
                <div className="flex items-start gap-1.5 max-w-[95%]">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${msg.undone ? "bg-gray-300" : "bg-green-500"}`} />
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div
                      className={`text-xs px-3 py-1.5 rounded-2xl rounded-tl-sm leading-relaxed ${
                        msg.undone
                          ? "bg-gray-100 text-gray-400 line-through"
                          : "bg-green-50 border border-green-200 text-gray-700"
                      }`}
                    >
                      {msg.undone ? "Undone." : msg.content}
                    </div>
                    {!msg.undone && msg.logId && (
                      <button
                        onClick={() => handleUndo(msg.logId, msg.id)}
                        className="self-start text-xs text-gray-400 border border-gray-200 px-2.5 py-0.5 rounded-full hover:border-red-300 hover:text-red-500 transition-colors"
                      >
                        ↩ Undo
                      </button>
                    )}
                  </div>
                </div>

              /* ── regular assistant bubble ── */
              ) : (
                <div className="flex items-start gap-1.5 max-w-[95%]">
                  <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-2xl rounded-tl-sm leading-relaxed">
                      {msg.content}
                    </div>
                    {msg.actions?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.actions.map((action, i) => {
                          const labelFn = ACTION_LABELS[action.type];
                          const label   = labelFn
                            ? labelFn(action.value)
                            : `${action.type}: ${action.value}`;
                          return (
                            <button
                              key={i}
                              onClick={() => onApplyAction?.(action)}
                              className="text-xs bg-accent/10 text-accent border border-accent/25 px-2 py-0.5 rounded-full hover:bg-accent/20 transition-colors font-semibold"
                            >
                              Apply: {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex items-start gap-1.5">
              <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Starter chips */}
      {isEmpty && (
        <div className="flex flex-wrap gap-1">
          {STARTER_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => sendMessage(chip)}
              className="text-xs text-gray-500 border border-gray-200 rounded-full px-2.5 py-1 hover:border-accent/40 hover:text-accent transition-colors text-left"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(input); }}
          placeholder="Ask about your signal…"
          disabled={isLoading}
          className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent disabled:opacity-50 min-w-0"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
          className="px-2.5 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-bold flex-shrink-0"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
