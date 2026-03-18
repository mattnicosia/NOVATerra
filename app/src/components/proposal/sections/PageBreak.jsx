export default function PageBreak() {
  return (
    <div style={{ pageBreakBefore: "always", breakBefore: "page" }}>
      <div className="no-print" style={{
        borderTop: "2px dashed #ccc", margin: "16px 0", position: "relative", textAlign: "center",
      }}>
        <span style={{
          position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
          background: "#fff", padding: "0 8px", fontSize: 9, color: "#aaa",
          textTransform: "uppercase", letterSpacing: 1,
        }}>
          Page Break
        </span>
      </div>
    </div>
  );
}
