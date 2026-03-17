import { useTheme } from "@/hooks/useTheme";

/* ────────────────────────────────────────────────────────
   SpotifyWidget — embedded Spotify player
   ──────────────────────────────────────────────────────── */

export default function SpotifyWidget({ config }) {
  const C = useTheme();
  const T = C.T;
  const url = config?.url || "";

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
        <span style={{ fontSize: 10, fontWeight: 500 }}>Configure a Spotify URL</span>
        <span style={{ fontSize: 8.5, color: C.textMuted }}>Enter edit mode to set the URL</span>
      </div>
    );
  }

  // Convert standard Spotify URL to embed URL
  const embedUrl = url.includes("/embed/") ? url : url.replace("open.spotify.com/", "open.spotify.com/embed/");

  return (
    <iframe
      src={embedUrl}
      width="100%"
      height="100%"
      frameBorder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      style={{ borderRadius: 10, border: "none", display: "block" }}
    />
  );
}
