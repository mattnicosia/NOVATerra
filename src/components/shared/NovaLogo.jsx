import { useId } from 'react';
import { useTheme } from '@/hooks/useTheme';

export default function NovaLogo({ size = 28 }) {
  const C = useTheme();
  const uid = useId();
  const g1 = `nl-g1-${uid}`;
  const g2 = `nl-g2-${uid}`;
  const g3 = `nl-g3-${uid}`;
  const fl = `nl-glow-${uid}`;

  // Derive lighter tint of accent for gradient endpoints
  const accentLight = C.accentAlt || C.accent;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={g1} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.accent} />
          <stop offset="100%" stopColor={accentLight} />
        </linearGradient>
        <linearGradient id={g2} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentLight} />
          <stop offset="100%" stopColor={C.accent} />
        </linearGradient>
        <linearGradient id={g3} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" stopColor={accentLight} />
          <stop offset="100%" stopColor={C.accent} />
        </linearGradient>
        <filter id={fl} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${fl})`}>
        {/* Chevron A: upper-left */}
        <path d="M256 80 L100 170 L100 346 L178 300 L178 214 L256 170Z" fill={`url(#${g1})`} opacity="0.92" />
        {/* Chevron B: upper-right */}
        <path d="M256 80 L412 170 L412 346 L334 300 L334 214 L256 170Z" fill={`url(#${g2})`} opacity="0.92" />
        {/* Chevron C: bottom */}
        <path d="M100 346 L256 436 L412 346 L334 300 L256 346 L178 300Z" fill={`url(#${g3})`} opacity="0.92" />
        {/* Center hexagon — matches sidebar bg */}
        <path d="M256 170 L334 214 L334 300 L256 346 L178 300 L178 214Z" fill={C.sidebarBg || C.bg} opacity="0.30" />
        {/* Inner highlight */}
        <path d="M256 200 L310 230 L310 284 L256 314 L202 284 L202 230Z" fill={`url(#${g1})`} opacity="0.12" />
      </g>
    </svg>
  );
}
