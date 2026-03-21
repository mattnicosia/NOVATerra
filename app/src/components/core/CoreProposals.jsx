// CoreProposals — Wraps HistoricalProposalsPanel with company profile filtering
// The HistoricalProposalsPanel already handles PDF/Excel upload, AI extraction,
// outcome tracking, calibration, and analytics. We just give it a proper home.

import { useTheme } from "@/hooks/useTheme";
import HistoricalProposalsPanel from "@/components/settings/HistoricalProposalsPanel";

export default function CoreProposals() {
  const C = useTheme();
  const T = C.T;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Context banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderRadius: T.radius.md,
          background: `linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(109,40,217,0.03) 100%)`,
          border: `1px solid rgba(139,92,246,0.12)`,
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2l2.09 6.26L20 10l-4.69 3.98L16.91 20 12 16.27 7.09 20l1.6-6.02L4 10l5.91-1.74L12 2z" />
        </svg>
        <span style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.4 }}>
          Upload proposals and historical bids to train NOVA's cost intelligence. Every proposal makes NOVA
          smarter at ROM estimates and pricing.
        </span>
      </div>

      {/* The actual panel — full proposal management */}
      <HistoricalProposalsPanel />
    </div>
  );
}
