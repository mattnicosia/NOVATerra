// RomUpsell — CTA section below ROM result, driving users into NOVATerra proposal flow
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/utils/designTokens";
import { card, accentButton } from "@/utils/styles";
import { useRomStore } from "@/stores/romStore";

const FEATURES = [
  "Professional branded proposals in minutes",
  "Adjust quantities, specs, and pricing per division",
  "Add your company logo and send directly to clients",
  "AI-powered cost estimating from construction drawings",
  "Bid package creation and subcontractor management",
  "Cloud sync across your entire team",
];

export default function RomUpsell() {
  const C = useTheme();
  const T = C.T;
  const buildingType = useRomStore(s => s.buildingType);
  const projectSF = useRomStore(s => s.projectSF);
  const romResult = useRomStore(s => s.romResult);

  function handleStartProposal(e) {
    e.preventDefault();
    // Save ROM data to localStorage so the main app can pick it up
    try {
      localStorage.setItem(
        "rom_prefill",
        JSON.stringify({
          buildingType: buildingType || "commercial-office",
          projectSF: projectSF || "",
          romResult: romResult || null,
          createdAt: new Date().toISOString(),
        }),
      );
    } catch {}
    // Navigate to main app — DashboardPage will detect rom_prefill and create an estimate
    window.location.href = "/";
  }

  return (
    <div style={{ width: "100%", maxWidth: 800 }}>
      <div
        style={{
          ...card(C, { padding: 0, overflow: "hidden" }),
          position: "relative",
        }}
      >
        {/* Gradient accent border — top edge */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: C.gradient || `linear-gradient(90deg, ${C.accent}, ${C.accentAlt || C.accent})`,
            borderRadius: `${T.radius.md}px ${T.radius.md}px 0 0`,
          }}
        />

        <div style={{ padding: T.space[7] }}>
          {/* Headline */}
          <h3
            style={{
              fontSize: T.fontSize["2xl"],
              fontWeight: T.fontWeight.bold,
              color: C.text,
              fontFamily: T.font.sans,
              margin: 0,
              marginBottom: T.space[3],
            }}
          >
            Turn This Into a Proposal
          </h3>

          {/* Body */}
          <p
            style={{
              fontSize: T.fontSize.md,
              color: C.textMuted,
              fontFamily: T.font.sans,
              margin: 0,
              marginBottom: T.space[6],
              lineHeight: T.lineHeight.relaxed,
              maxWidth: 560,
            }}
          >
            Your ROM is ready to become a professional, branded budget proposal you can send directly to your client.
            NOVATerra handles the rest.
          </p>

          {/* Feature list */}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              marginBottom: T.space[6],
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: T.space[3],
            }}
          >
            {FEATURES.map((feature, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: T.space[2],
                  fontSize: T.fontSize.sm,
                  color: C.textMuted,
                  fontFamily: T.font.sans,
                  lineHeight: T.lineHeight.normal,
                }}
              >
                <span
                  style={{
                    color: C.accent,
                    fontSize: 14,
                    lineHeight: "18px",
                    flexShrink: 0,
                  }}
                >
                  {"\u2713"}
                </span>
                {feature}
              </li>
            ))}
          </ul>

          {/* CTA button */}
          <a
            href="/"
            onClick={handleStartProposal}
            style={{
              ...accentButton(C, {
                display: "inline-flex",
                padding: "14px 32px",
                fontSize: T.fontSize.lg,
                fontWeight: T.fontWeight.bold,
                textDecoration: "none",
                letterSpacing: 0.3,
              }),
            }}
          >
            Start Your Proposal
          </a>

          {/* Subtle note */}
          <div
            style={{
              marginTop: T.space[4],
              fontSize: T.fontSize.xs,
              color: C.textDim,
              fontFamily: T.font.sans,
            }}
          >
            Your account is ready — your ROM data will be pre-loaded
          </div>
        </div>
      </div>
    </div>
  );
}
