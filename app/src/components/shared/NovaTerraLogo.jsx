// NOVATerra Logo — uses the official transparent PNG wordmark
// Gradient: magenta → purple → cyan → blue (geometric display font)
// Usage: <NovaTerraLogo size={24} />

export default function NovaTerraLogo({ size = 24, style }) {
  // The PNG aspect ratio is roughly 3:1 (1128x376)
  const height = size;
  const width = height * 3;

  return (
    <img
      src="/novaterra-wordmark.png"
      alt="NOVATerra"
      draggable={false}
      style={{
        height,
        width,
        objectFit: "contain",
        display: "block",
        userSelect: "none",
        ...style,
      }}
    />
  );
}
