import { useState } from "react";
import { useWidgetStore } from "@/stores/widgetStore";
import { useTheme } from "@/hooks/useTheme";

/* ────────────────────────────────────────────────────────
   PersistentMusicBar — fixed bottom bar for Spotify/Apple Music
   Lives at app shell level so it never unmounts during navigation.
   The embed iframe has built-in play/pause/skip/volume controls.
   ──────────────────────────────────────────────────────── */

function toEmbedUrl(url) {
  if (!url) return null;
  // Spotify: open.spotify.com/playlist/... → open.spotify.com/embed/playlist/...
  if (url.includes("open.spotify.com/") && !url.includes("/embed/")) {
    return url.replace("open.spotify.com/", "open.spotify.com/embed/");
  }
  // Apple Music: music.apple.com/... → embed.music.apple.com/...
  if (url.includes("music.apple.com/") && !url.includes("embed.music.apple.com/")) {
    return url.replace("music.apple.com/", "embed.music.apple.com/");
  }
  // Already an embed URL or unknown — pass through
  return url;
}

export default function PersistentMusicBar() {
  const url = useWidgetStore(s => s.musicPlayerUrl);
  const clearMusicPlayer = useWidgetStore(s => s.clearMusicPlayer);
  const C = useTheme();
  const dk = C.isDark;
  const [minimized, setMinimized] = useState(false);

  if (!url) return null;

  const embedUrl = toEmbedUrl(url);
  const isApple = url.includes("music.apple.com");

  const btnBase = {
    zIndex: 2,
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "none",
    background: dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    color: dk ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
    fontSize: 11,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  };

  /* ── Minimized: tiny pill ── */
  if (minimized) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 72,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9998,
          height: 32,
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
          background: dk ? "#0A0A0F" : "#fff",
          boxShadow: dk
            ? "0 4px 16px rgba(0,0,0,0.5)"
            : "0 2px 12px rgba(0,0,0,0.1)",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 6px 0 10px",
        }}
      >
        <span style={{ fontSize: 13, opacity: 0.5 }}>&#9835;</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: dk ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
            maxWidth: 100,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {isApple ? "Apple Music" : "Spotify"}
        </span>
        <button onClick={() => setMinimized(false)} style={{ ...btnBase, width: 20, height: 20, fontSize: 10 }} title="Expand player">
          &#9650;
        </button>
        <button onClick={clearMusicPlayer} style={{ ...btnBase, width: 20, height: 20, fontSize: 10 }} title="Close player">
          ✕
        </button>
      </div>
    );
  }

  /* ── Full player ── */
  return (
    <div
      style={{
        position: "fixed",
        bottom: 68,
        left: "50%",
        transform: "translateX(-50%)",
        width: 420,
        height: 80,
        zIndex: 9998,
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
        background: dk ? "#0A0A0F" : "#fff",
        boxShadow: dk
          ? "0 8px 32px rgba(0,0,0,0.6)"
          : "0 4px 20px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Control buttons */}
      <div style={{ position: "absolute", top: 4, right: 6, zIndex: 2, display: "flex", gap: 4 }}>
        <button onClick={() => setMinimized(true)} style={btnBase} title="Minimize player">
          &#9660;
        </button>
        <button onClick={clearMusicPlayer} style={btnBase} title="Close player">
          ✕
        </button>
      </div>

      {/* Embed iframe */}
      <iframe
        src={embedUrl}
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        style={{
          width: "100%",
          height: isApple ? 150 : "100%",
          border: "none",
          borderRadius: 14,
          display: "block",
        }}
      />
    </div>
  );
}
