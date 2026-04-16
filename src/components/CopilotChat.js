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

export default function CopilotChat({ chatHistory, setChatHistory, projectId, onApplyAction, screen, pipelineConfig }) {
  const [input,     setInput]     = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef                  = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput("");

    const userMsg = {
      id:        `${Date.now()}-u`,
      role:      "user",
      content:   trimmed,
      timestamp: new Date().toLocaleTimeString(),
    };
    setChatHistory((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message:         trimmed,
          project_id:      projectId ?? "demo-project",
          screen:          screen ?? undefined,
          pipeline_config: pipelineConfig ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
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
              {msg.role === "user" ? (
                <div className="bg-accent text-white text-xs px-3 py-1.5 rounded-2xl rounded-tr-sm max-w-[85%] leading-relaxed">
                  {msg.content}
                </div>
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
