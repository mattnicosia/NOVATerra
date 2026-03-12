/**
 * FeedbackWidget — In-app beta feedback button + modal
 *
 * Sprint 5.3: Floating button in bottom-left corner.
 * Opens a compact feedback form with:
 *   - Category selector (Bug, Feature Request, UX Issue, General)
 *   - Text area for description
 *   - Auto-captures: page URL, user email, timestamp, app version
 *   - Saves to Supabase `beta_feedback` table (or localStorage fallback)
 */

import { useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { useFeatureFlagStore } from "@/stores/featureFlagStore";
import { supabase } from "@/utils/supabase";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";

const CATEGORIES = [
  { value: "bug", label: "🐛 Bug", color: "red" },
  { value: "feature", label: "💡 Feature", color: "purple" },
  { value: "ux", label: "🎨 UX Issue", color: "orange" },
  { value: "general", label: "💬 General", color: "accent" },
];

export default function FeedbackWidget() {
  const C = useTheme();
  const T = C.T;
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const isEnabled = useFeatureFlagStore(s => s.isEnabled("feedback-widget"));

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!message.trim()) return;
    setSending(true);

    const feedback = {
      category,
      message: message.trim(),
      page: location.pathname,
      user_email: user?.email || "anonymous",
      user_id: user?.id || null,
      app_version: __BUILD_TS__ || "unknown",
      user_agent: navigator.userAgent,
      screen_width: window.innerWidth,
      screen_height: window.innerHeight,
      created_at: new Date().toISOString(),
    };

    try {
      // Try Supabase first
      const { error } = await supabase.from("beta_feedback").insert([feedback]);
      if (error) throw error;
    } catch {
      // Fallback: save to localStorage
      try {
        const existing = JSON.parse(localStorage.getItem("nova_feedback") || "[]");
        existing.push(feedback);
        localStorage.setItem("nova_feedback", JSON.stringify(existing));
      } catch {
        // Silent fail
      }
    }

    setSending(false);
    setSent(true);
    setMessage("");
    setTimeout(() => {
      setSent(false);
      setOpen(false);
    }, 2000);
  }, [category, message, location.pathname, user]);

  if (!isEnabled) return null;

  const catColor = CATEGORIES.find(c => c.value === category);
  const accentColor = catColor ? C[catColor.color] || C.accent : C.accent;

  return (
    <>
      {/* Floating feedback button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Send feedback"
          style={{
            position: "fixed",
            bottom: 20,
            left: 20,
            zIndex: T.z.toast - 1,
            width: 40,
            height: 40,
            borderRadius: T.radius.full,
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple || C.accent})`,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 4px 16px ${C.accent}40`,
            transition: "transform 150ms ease, box-shadow 150ms ease",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow = `0 6px 20px ${C.accent}50`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = `0 4px 16px ${C.accent}40`;
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 14l-1.5 3L5 15.5 3 14z" />
            <path d="M15 2H3a1 1 0 00-1 1v9a1 1 0 001 1h12a1 1 0 001-1V3a1 1 0 00-1-1z" />
            <path d="M6 6h6M6 9h3" />
          </svg>
        </button>
      )}

      {/* Feedback modal */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: 20,
            zIndex: T.z.toast,
            width: 320,
            ...card(C),
            padding: T.space[4],
            boxShadow: T.shadow.xl,
            animation: "fadeUp 0.2s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[3] }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              Send Feedback
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
            >
              <Ic d={I.close || I.settings} size={14} color={C.textDim} />
            </button>
          </div>

          {sent ? (
            <div style={{ textAlign: "center", padding: T.space[4] }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>
                Thanks for your feedback!
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
                We'll review it shortly.
              </div>
            </div>
          ) : (
            <>
              {/* Category pills */}
              <div style={{ display: "flex", gap: 4, marginBottom: T.space[3], flexWrap: "wrap" }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    style={bt(C, {
                      padding: "4px 10px",
                      fontSize: 10,
                      fontWeight: category === cat.value ? 700 : 500,
                      background: category === cat.value ? `${C[cat.color] || C.accent}18` : "transparent",
                      border: `1px solid ${category === cat.value ? (C[cat.color] || C.accent) + "40" : C.border}`,
                      color: category === cat.value ? C[cat.color] || C.accent : C.textDim,
                    })}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Message textarea */}
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe the issue or suggestion..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 12,
                  borderRadius: T.radius.sm,
                  border: `1px solid ${C.border}`,
                  background: C.bg2 || C.bg,
                  color: C.text,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: T.font.sans,
                  lineHeight: 1.5,
                  boxSizing: "border-box",
                }}
                autoFocus
              />

              {/* Context info */}
              <div style={{ fontSize: 8, color: C.textDim, marginTop: 4, marginBottom: T.space[3] }}>
                Page: {location.pathname} · {user?.email || "anonymous"}
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!message.trim() || sending}
                style={bt(C, {
                  width: "100%",
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: message.trim()
                    ? `linear-gradient(135deg, ${accentColor}, ${C.purple || accentColor})`
                    : C.bg3,
                  color: message.trim() ? "#fff" : C.textDim,
                  opacity: sending ? 0.6 : 1,
                  cursor: message.trim() && !sending ? "pointer" : "default",
                })}
              >
                {sending ? "Sending..." : "Submit Feedback"}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
