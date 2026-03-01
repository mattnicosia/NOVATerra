// NOVATerra Logo — horizontal wordmark with gradient accent dots
// Usage: <NovaTerraLogo size={24} />

import { useMemo } from 'react';

export default function NovaTerraLogo({ size = 24, color, style }) {
  const uid = useMemo(() => `ntl-${Math.random().toString(36).slice(2, 8)}`, []);
  const fontFamily = "'DM Sans', 'Inter', -apple-system, sans-serif";

  const fontSize = size * 0.78;
  return (
    <svg
      width={fontSize * 6.0}
      height={fontSize * 1.55}
      viewBox="0 0 460 100"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', userSelect: 'none', ...style }}
    >
      <defs>
        <linearGradient id={`${uid}-h`} x1="0" y1="0" x2="460" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="40%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      {/* Accent dot above N */}
      <circle cx={44} cy={10} r={2.5} fill="#8B5CF6" opacity="0.85" />
      {/* NOVA */}
      <text
        x="21" y="78"
        fill={color || `url(#${uid}-h)`}
        fontSize="72"
        fontFamily={fontFamily}
        fontWeight="700"
        letterSpacing="4"
      >NOVA</text>
      {/* Accent dot above T */}
      <circle cx={249} cy={10} r={2.5} fill="#10B981" opacity="0.85" />
      {/* Terra */}
      <text
        x="231" y="78"
        fill={color || `url(#${uid}-h)`}
        fontSize="72"
        fontFamily={fontFamily}
        fontWeight="600"
        letterSpacing="2"
      >Terra</text>
    </svg>
  );
}
