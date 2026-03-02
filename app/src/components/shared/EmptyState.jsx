// EmptyState — Beautiful animated empty state with icon, message, and CTA
// Used across all pages for consistent "nothing here yet" experiences.
import { useTheme } from '@/hooks/useTheme';
import Ic from './Ic';

export default function EmptyState({ icon, title, subtitle, action, actionLabel, actionIcon, color }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const accentColor = color || C.accent;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: `${T.space[10]}px ${T.space[6]}px`,
      textAlign: 'center',
      animation: 'staggerFadeUp 500ms cubic-bezier(0.16,1,0.3,1) both',
    }}>
      {/* Animated icon ring — glass */}
      {icon && (
        <div style={{
          position: 'relative',
          width: 80, height: 80, borderRadius: T.radius.full,
          background: dk ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.15)',
          backdropFilter: T.glass.blurLight,
          WebkitBackdropFilter: T.glass.blurLight,
          border: `0.5px solid ${dk ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.30)'}`,
          boxShadow: [T.glass.specular, T.glass.edge].join(', '),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: T.space[5],
          animation: 'staggerFadeUp 600ms cubic-bezier(0.16,1,0.3,1) 100ms both',
        }}>
          {/* Outer breathing ring */}
          <div style={{
            position: 'absolute', inset: -6,
            borderRadius: T.radius.full,
            border: `0.5px solid ${dk ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)'}`,
            animation: 'breathe 4s ease-in-out infinite',
          }} />
          <Ic d={icon} size={32} color={accentColor} sw={1.5} />
        </div>
      )}

      {/* Title */}
      {title && (
        <div style={{
          fontSize: T.fontSize.lg, fontWeight: T.fontWeight.semibold, color: C.text,
          marginBottom: T.space[2],
          animation: 'staggerFadeUp 500ms cubic-bezier(0.16,1,0.3,1) 200ms both',
        }}>
          {title}
        </div>
      )}

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontSize: T.fontSize.base, color: C.textMuted,
          lineHeight: T.lineHeight.normal,
          maxWidth: 360,
          marginBottom: action ? T.space[5] : 0,
          animation: 'staggerFadeUp 500ms cubic-bezier(0.16,1,0.3,1) 300ms both',
        }}>
          {subtitle}
        </div>
      )}

      {/* CTA button — liquid glass */}
      {action && (
        <button
          onClick={action}
          className="accent-btn"
          style={{
            borderRadius: T.radius.md, cursor: 'pointer',
            background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(16px) saturate(170%)',
            WebkitBackdropFilter: 'blur(16px) saturate(170%)',
            color: C.text,
            border: `0.5px solid ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.35)'}`,
            padding: '10px 22px', fontSize: T.fontSize.base,
            fontWeight: T.fontWeight.semibold,
            fontFamily: "'DM Sans',sans-serif",
            display: 'flex', alignItems: 'center', gap: T.space[2],
            boxShadow: [
              `inset 0 0.5px 0 ${dk ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.50)'}`,
              `0 0 0 0.5px ${dk ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)'}`,
            ].join(', '),
            animation: 'staggerFadeUp 500ms cubic-bezier(0.16,1,0.3,1) 400ms both',
          }}
        >
          {actionIcon && <Ic d={actionIcon} size={14} color={accentColor} sw={2.5} />}
          {actionLabel || 'Get Started'}
        </button>
      )}
    </div>
  );
}
