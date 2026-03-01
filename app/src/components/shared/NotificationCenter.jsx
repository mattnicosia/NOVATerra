import { useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useNovaStore } from '@/stores/novaStore';

const SEVERITY_CONFIG = {
  info:    { color: '#60A5FA', bg: 'rgba(96,165,250,0.08)',  icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z M12 16v-4 M12 8h.01' },
  success: { color: '#34D399', bg: 'rgba(52,211,153,0.08)',  icon: 'M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3' },
  warn:    { color: '#FBBF24', bg: 'rgba(251,191,36,0.08)',  icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01' },
  error:   { color: '#F87171', bg: 'rgba(248,113,113,0.08)', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z M15 9l-6 6 M9 9l6 6' },
};

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function NotificationCenter({ open, onClose }) {
  const C = useTheme();
  const T = C.T;
  const isDk = C.isDark;
  const ov = (a) => isDk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  const notifications = useNovaStore(s => s.notifications);
  const dismissNotification = useNovaStore(s => s.dismissNotification);
  const panelRef = useRef(null);

  // Mark all as read when opened
  useEffect(() => {
    if (!open) return;
    const store = useNovaStore.getState();
    const unread = store.notifications.filter(n => !n.read);
    if (unread.length > 0) {
      useNovaStore.setState({
        notifications: store.notifications.map(n => n.read ? n : { ...n, read: true }),
      });
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Delay listener to prevent immediate close
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const sorted = [...notifications].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div ref={panelRef} style={{
      position: 'fixed', top: 56, right: 16,
      width: 340, maxHeight: 'calc(100vh - 80px)',
      background: isDk
        ? `linear-gradient(145deg, ${C.glassBg} 0%, ${C.glassBgDark} 100%)`
        : C.bg1,
      backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      boxShadow: isDk
        ? `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px ${C.glassBorder}`
        : `0 16px 48px rgba(0,0,0,0.12), 0 0 0 1px ${C.border}`,
      zIndex: 500,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'modalEnter 0.2s cubic-bezier(0.16,1,0.3,1) both',
      fontFamily: T.font.display,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${C.borderLight || C.border}`,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: C.text,
          letterSpacing: '0.02em',
        }}>Notifications</span>
        {sorted.length > 0 && (
          <button
            onClick={() => {
              sorted.forEach(n => dismissNotification(n.id));
            }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 10.5, fontWeight: 500, color: `${C.accent}B3`,
              padding: '2px 6px', borderRadius: 4,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.color = `${C.accent}B3`; }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Notifications list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 6px 8px' }}>
        {sorted.length === 0 && (
          <div style={{
            padding: '40px 16px', textAlign: 'center',
            color: C.textDim, fontSize: 12,
          }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.4 }}>
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <div>No notifications yet</div>
            <div style={{ fontSize: 10.5, marginTop: 4, opacity: 0.5 }}>
              NOVA will notify you of important events
            </div>
          </div>
        )}
        {sorted.map(n => {
          const cfg = SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.info;
          return (
            <div key={n.id} style={{
              display: 'flex', gap: 10, padding: '10px 10px',
              borderRadius: 10, marginBottom: 2,
              transition: 'background 0.12s',
              cursor: 'default',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = ov(0.03); }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Severity icon */}
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: cfg.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={cfg.icon} />
                </svg>
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 500,
                  color: C.text, opacity: 0.85,
                  lineHeight: 1.4,
                }}>{n.message}</div>
                <div style={{
                  fontSize: 10, color: C.textDim,
                  marginTop: 3,
                }}>{timeAgo(n.timestamp)}</div>
              </div>

              {/* Dismiss */}
              <button
                onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                style={{
                  width: 20, height: 20, borderRadius: 6,
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', color: C.textDim,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = C.textMuted; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.textDim; }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
