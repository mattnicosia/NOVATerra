import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useCalendarStore } from "@/stores/calendarStore";

/* ────────────────────────────────────────────────────────
   AddTaskModal — glass-styled modal for creating calendar tasks
   ──────────────────────────────────────────────────────── */

export default function AddTaskModal({ defaultDate, onClose }) {
  const C = useTheme();
  const dk = C.isDark;
  const T = C.T;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const ref = useRef(null);
  const addTask = useCalendarStore(s => s.addTask);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({ title: title.trim(), date, time, description: description.trim() });
    onClose();
  }

  const inputStyle = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    color: C.text,
    fontSize: 11,
    fontWeight: 400,
    fontFamily: T.font.display,
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: 8.5,
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: C.textDim,
    fontFamily: T.font.display,
    marginBottom: 4,
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={ref}
        style={{
          background: C.sidebarBg,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "20px 24px",
          maxWidth: 340,
          width: "90%",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16, fontFamily: T.font.display }}>
          New Task
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Title</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task name..."
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = `${C.accent}66`)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border)}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ ...inputStyle, colorScheme: dk ? "dark" : "light" }}
                onFocus={e => (e.currentTarget.style.borderColor = `${C.accent}66`)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                style={{ ...inputStyle, colorScheme: dk ? "dark" : "light" }}
                onFocus={e => (e.currentTarget.style.borderColor = `${C.accent}66`)}
                onBlur={e => (e.currentTarget.style.borderColor = C.border)}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              style={{ ...inputStyle, resize: "vertical", minHeight: 36 }}
              onFocus={e => (e.currentTarget.style.borderColor = `${C.accent}66`)}
              onBlur={e => (e.currentTarget.style.borderColor = C.border)}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                color: C.textMuted,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: T.font.display,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                border: `1px solid ${C.accent}4D`,
                background: title.trim() ? `${C.accent}26` : ov(0.04),
                color: title.trim() ? C.accent : C.textDim,
                fontSize: 11,
                fontWeight: 600,
                cursor: title.trim() ? "pointer" : "default",
                fontFamily: T.font.display,
                opacity: title.trim() ? 1 : 0.5,
              }}
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
