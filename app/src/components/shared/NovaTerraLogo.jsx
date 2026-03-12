// NOVA Logo — image-based wordmark with cut-through
// Usage: <NovaTerraLogo size={24} />

export default function NovaTerraLogo({ size = 24, style }) {
  const height = size;
  // SVG viewBox is 520×140 → aspect ratio ~3.7:1
  const width = Math.round(height * 3.7);

  return (
    <img
      src="/nova-logo-cut.svg"
      alt="NOVA"
      width={width}
      height={height}
      style={{ display: "block", userSelect: "none", objectFit: "contain", ...style }}
      draggable={false}
    />
  );
}
