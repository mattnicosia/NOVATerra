import React from 'react';
import { useTheme } from '@/hooks/useTheme';

/* ────────────────────────────────────────────────────────
   IframeWidget — generic sandboxed iframe embed
   ──────────────────────────────────────────────────────── */

export default function IframeWidget({ config }) {
  const C = useTheme();
  const T = C.T;
  const url = config?.url || '';
  const title = config?.title || 'Embed';

  if (!url) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 6, color: C.textDim, fontFamily: T.font.display,
      }}>
        <span style={{ fontSize: 20 }}>&#128279;</span>
        <span style={{ fontSize: 10, fontWeight: 500 }}>Configure an embed URL</span>
        <span style={{ fontSize: 8.5, color: C.textMuted }}>Enter edit mode to set the URL</span>
      </div>
    );
  }

  return (
    <iframe
      src={url}
      title={title}
      width="100%"
      height="100%"
      frameBorder="0"
      sandbox="allow-scripts allow-same-origin allow-popups"
      style={{ borderRadius: 10, border: 'none', display: 'block' }}
    />
  );
}
