import { memo } from 'react';

export default memo(function Ic({ d, size = 18, color = "currentColor", sw = 1.7, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d={d} />
    </svg>
  );
});
