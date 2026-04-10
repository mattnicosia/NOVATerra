import { useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useWidgetStore } from "@/stores/widgetStore";

/* ────────────────────────────────────────────────────────
   SpotifyWidget — activates the persistent music bar
   The actual iframe lives in PersistentMusicBar (app level).
   This widget shows status + controls.
   ──────────────────────────────────────────────────────── */

export default function SpotifyWidget({ config }) {
  const C = useTheme();
  const T = C.T;
  const url = config?.url || "";
  const musicPlayerUrl = useWidgetStore(s => s.musicPlayerUrl);
  const setMusicPlayerUrl = useWidgetStore(s => s.setMusicPlayerUrl);
  const clearMusicPlayer = useWidgetStore(s => s.clearMusicPlayer);

  // When this widget has a URL, activate the persistent player
  useEffect(() => {
    if (url && url !== musicPlayerUrl) {
      setMusicPlayerUrl(url);
    }
  }, [url, musicPlayerUrl, setMusicPlayerUrl]);

  if (!url) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 6,
          color: C.textDim,
          fontFamily: T.font.display,
        }}
      >
        <span style={{ fontSize: 20 }}>&#9835;</span>
        <span style={{ fontSize: 10, fontWeight: 500 }}>Embed a Spotify Playlist</span>
        <span style={{ fontSize: 8.5, color: C.textMuted }}>Enter edit mode → paste a playlist or album URL</span>
      </div>
    );
  }

  const isPlaying = musicPlayerUrl === url;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 10,
        fontFamily: T.font.display,
        padding: "12px 16px",
      }}
    >
      <div style={{ fontSize: 28, opacity: 0.6 }}>&#9835;</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.text, textAlign: "center" }}>
        {isPlaying ? "Now Playing" : "Music Paused"}
      </div>
      <div
        style={{
          fontSize: 9,
          color: C.textMuted,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {url.split("/").pop()?.replace(/-/g, " ") || "Spotify"}
      </div>
      <button
        onClick={() => (isPlaying ? clearMusicPlayer() : setMusicPlayerUrl(url))}
        style={{
          padding: "5px 16px",
          borderRadius: 20,
          border: `1px solid ${C.border}`,
          background: isPlaying ? "rgba(239,68,68,0.1)" : C.accentBg,
          color: isPlaying ? C.red || "#EF4444" : C.accent,
          fontSize: 10,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: T.font.display,
        }}
      >
        {isPlaying ? "Stop" : "Play"}
      </button>
    </div>
  );
}
