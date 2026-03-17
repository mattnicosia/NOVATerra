import { useState, useRef, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";

/**
 * Avatar — Shared avatar component with headshot + initials fallback.
 *
 * Cascade: headshot image → initials circle → default icon
 *
 * Props:
 *   name      — display name (used for initials)
 *   src       — avatar image URL (headshot)
 *   color     — background color for initials (default: #6366F1)
 *   size      — diameter in px (default: 32)
 *   fontSize  — override font size for initials
 *   onClick   — click handler
 *   editable  — show camera overlay on hover + file input trigger
 *   onUpload  — async (dataUrl) => void — called with processed image data URL
 *   style     — additional style overrides
 */
export default function Avatar({
  name = "",
  src,
  color = "#6366F1",
  size = 32,
  fontSize: fontSizeProp,
  onClick,
  editable = false,
  onUpload,
  style: styleProp,
}) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const initial = (name || "?")[0].toUpperCase();
  const fs = fontSizeProp || Math.round(size * 0.42);
  const showImage = src && !imgError;

  const handleFileChange = useCallback(
    async e => {
      const file = e.target.files?.[0];
      if (!file || !onUpload) return;

      try {
        setUploading(true);
        const dataUrl = await processAvatar(file);
        await onUpload(dataUrl);
      } catch (err) {
        console.error("[Avatar] upload failed:", err);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [onUpload],
  );

  return (
    <div
      onClick={e => {
        if (editable && onUpload) {
          fileRef.current?.click();
        } else if (onClick) {
          onClick(e);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: showImage ? "transparent" : color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        cursor: editable || onClick ? "pointer" : "default",
        flexShrink: 0,
        ...styleProp,
      }}
    >
      {/* Image layer */}
      {showImage && (
        <img
          src={src}
          alt={name}
          onError={() => setImgError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      )}

      {/* Initials fallback */}
      {!showImage && (
        <span
          style={{
            fontSize: fs,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {initial}
        </span>
      )}

      {/* Edit overlay on hover */}
      {editable && hovered && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
          }}
        >
          {uploading ? (
            <span style={{ fontSize: Math.round(size * 0.3), color: "#fff" }}>...</span>
          ) : (
            <svg
              width={Math.round(size * 0.4)}
              height={Math.round(size * 0.4)}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </div>
      )}

      {/* Hidden file input for upload */}
      {editable && (
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
      )}
    </div>
  );
}

/**
 * Process an avatar image file — resize to max 200px, compress as JPEG.
 * Returns a data URL string.
 */
export function processAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const MAX = 200;
        let w = img.width,
          h = img.height;

        // Crop to square (center crop)
        const min = Math.min(w, h);
        const sx = (w - min) / 2;
        const sy = (h - min) / 2;

        const outSize = Math.min(min, MAX);
        const canvas = document.createElement("canvas");
        canvas.width = outSize;
        canvas.height = outSize;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, min, min, 0, 0, outSize, outSize);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * AvatarRow — Compact avatar + name row for lists.
 *
 * Props:
 *   name, src, color, size — passed to Avatar
 *   label — text to display (defaults to name)
 *   sub — subtitle text
 *   right — right-aligned node
 *   onClick — click handler
 */
export function AvatarRow({ name, src, color, size = 24, label, sub, right, onClick, style: styleProp }) {
  const C = useTheme();
  const T = C.T;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: T.space[2],
        cursor: onClick ? "pointer" : "default",
        ...styleProp,
      }}
    >
      <Avatar name={name} src={src} color={color} size={size} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: T.fontSize.xs,
            fontWeight: 600,
            color: C.text,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {label || name}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 9,
              color: C.textDim,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
