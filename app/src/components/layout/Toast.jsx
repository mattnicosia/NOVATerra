import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

const TOAST_DURATION = 2800;

export default function Toast() {
  const C = useTheme();
  const T = C.T;
  const toast = useUiStore(s => s.toast);
  const [visible, setVisible] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (toast) {
      setVisible(toast);
      setLeaving(false);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setLeaving(true);
        setTimeout(() => { setVisible(null); setLeaving(false); }, 280);
      }, TOAST_DURATION);
    }
    return () => clearTimeout(timerRef.current);
  }, [toast]);

  if (!visible) return null;

  const isSuccess = visible.type === "success";
  const isError = visible.type === "error";
  const bg = isSuccess ? C.green : isError ? C.red : C.accent;

  return (
    <div style={{
      position: "fixed", bottom: T.space[6], left: "50%", transform: "translateX(-50%)",
      minWidth: 220, maxWidth: 380,
      background: `linear-gradient(135deg, ${bg}E8, ${bg}D0)`,
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${bg}40`,
      borderRadius: T.radius.md,
      boxShadow: `0 8px 32px ${bg}30, 0 0 20px ${bg}15`,
      zIndex: T.z.toast,
      overflow: "hidden",
      animation: leaving ? "toastExit 280ms cubic-bezier(0.4, 0, 1, 1) forwards" : "toastEnter 350ms cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <div style={{
        padding: `${T.space[3]}px ${T.space[4]}px`,
        display: "flex", alignItems: "center", gap: T.space[3],
      }}>
        {/* Icon with entrance animation */}
        <div style={{
          width: 28, height: 28, borderRadius: T.radius.full, flexShrink: 0,
          background: "rgba(255,255,255,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: leaving ? "none" : "toastIconPop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 80ms both",
        }}>
          {isSuccess ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: leaving ? "none" : "checkmarkDraw 350ms ease-out 200ms both" }}>
              <path d="M20 6L9 17l-5-5" strokeDasharray="30" />
            </svg>
          ) : isError ? (
            <Ic d={I.x} size={14} color="#fff" sw={2.5} />
          ) : (
            <Ic d={I.check} size={14} color="#fff" sw={2.5} />
          )}
        </div>

        {/* Message */}
        <span style={{
          color: "#fff", fontSize: T.fontSize.base,
          fontWeight: T.fontWeight.medium,
          lineHeight: T.lineHeight.tight,
        }}>
          {visible.msg}
        </span>
      </div>

      {/* Auto-close progress bar */}
      <div style={{
        height: 2,
        background: "rgba(255,255,255,0.15)",
      }}>
        <div style={{
          height: "100%",
          background: "rgba(255,255,255,0.45)",
          animation: leaving ? "none" : `toastProgress ${TOAST_DURATION}ms linear forwards`,
          transformOrigin: "left",
        }} />
      </div>
    </div>
  );
}
