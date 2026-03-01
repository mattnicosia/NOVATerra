// Skeleton — Shimmer loading placeholder components
// Uses the .skeleton CSS class for the shimmer animation.
// Provides shape variants that match common UI patterns.
import { useTheme } from '@/hooks/useTheme';

// Basic skeleton block — configurable dimensions and shape
export default function Skeleton({ width, height = 16, radius = 6, style, className = '' }) {
  const C = useTheme();
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width || '100%',
        height,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${C.bg2} 25%, ${C.bg3} 50%, ${C.bg2} 75%)`,
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite ease-in-out',
        ...style,
      }}
    />
  );
}

// Text line skeleton — matches typography dimensions
export function SkeletonText({ lines = 3, width, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? '60%' : (width || '100%')}
          radius={4}
        />
      ))}
    </div>
  );
}

// KPI card skeleton — matches KPI component dimensions
export function SkeletonKPI() {
  const C = useTheme();
  const T = C.T;
  return (
    <div style={{
      padding: T.space[5],
      borderRadius: T.radius.md,
      background: C.glassBg || 'rgba(18,21,28,0.55)',
      backdropFilter: T.glass.blur,
      border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
      display: 'flex',
      flexDirection: 'column',
      gap: T.space[2],
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={60} height={10} radius={3} />
        <Skeleton width={28} height={28} radius={T.radius.sm} />
      </div>
      <Skeleton width={80} height={22} radius={4} />
    </div>
  );
}

// Table row skeleton — matches estimate/dashboard table rows
export function SkeletonRow({ columns = 5 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `2fr ${Array(columns - 1).fill('1fr').join(' ')}`,
      gap: 12,
      padding: '12px 16px',
      alignItems: 'center',
    }}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === 0 ? '70%' : '50%'}
          radius={4}
        />
      ))}
    </div>
  );
}

// Card skeleton — matches standard glass cards
export function SkeletonCard({ height = 120 }) {
  const C = useTheme();
  const T = C.T;
  return (
    <div style={{
      height,
      borderRadius: T.radius.md,
      background: C.glassBg || 'rgba(18,21,28,0.55)',
      backdropFilter: T.glass.blur,
      border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
      padding: T.space[4],
      display: 'flex',
      flexDirection: 'column',
      gap: T.space[3],
    }}>
      <Skeleton width={120} height={10} radius={3} />
      <Skeleton height={16} radius={4} />
      <Skeleton width="60%" height={12} radius={4} />
    </div>
  );
}
