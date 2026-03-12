// NOVA Logo — image-based wordmark
// Usage: <NovaTerraLogo size={24} />

export default function NovaTerraLogo({ size = 24, style }) {
  const height = size;
  // Original image is 1128×376 → aspect ratio ~3:1
  const width = height * 3;

  return (
    <img
      src="/nova-logo.png"
      alt="NOVA"
      width={width}
      height={height}
      style={{ display: "block", userSelect: "none", objectFit: "contain", ...style }}
      draggable={false}
    />
  );
}
