import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

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
        setTimeout(() => { setVisible(null); setLeaving(false); }, 200);
      }, 2300);
    }
    return () => clearTimeout(timerRef.current);
  }, [toast]);

  if (!visible) return null;

  const bg = visible.type === "success" ? C.green
    : visible.type === "error" ? C.red
    : C.accent;

  const icon = visible.type === "success" ? I.check
    : visible.type === "error" ? I.x
    : null;

  return (
    <div style={{
      position: "fixed", bottom: T.space[6], right: T.space[6],
      padding: `${T.space[3]}px ${T.space[5]}px`,
      background: bg + "E6",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      color: "#fff", borderRadius: T.radius.md,
      fontSize: T.fontSize.base, fontWeight: T.fontWeight.medium,
      animation: leaving ? "slideOut 0.2s ease-in forwards" : "slideUp 0.25s ease-out",
      boxShadow: T.shadow.lg,
      zIndex: T.z.toast,
      display: "flex", alignItems: "center", gap: T.space[2],
    }}>
      {icon && <Ic d={icon} size={14} color="#fff" sw={2.5} />}
      {visible.msg}
    </div>
  );
}
