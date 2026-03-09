// BidTrackingStrip — Aggregate response metrics across all bid packages
import { useTheme } from "@/hooks/useTheme";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import KPI from "@/components/shared/KPI";
import { I } from "@/constants/icons";

const OPENED_STATUSES = new Set(["opened", "downloaded", "submitted", "parsed", "awarded", "not_awarded"]);
const SUBMITTED_STATUSES = new Set(["submitted", "parsed", "awarded", "not_awarded"]);

export default function BidTrackingStrip() {
  const C = useTheme();
  const T = C.T;
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const invitations = useBidPackagesStore(s => s.invitations);

  // Aggregate metrics
  let totalPackages = bidPackages.length;
  let packagesSent = 0;
  let totalInvites = 0;
  let openedCount = 0;
  let submittedCount = 0;

  for (const pkg of bidPackages) {
    const pkgInvites = invitations[pkg.id] || [];
    const sentInvites = pkgInvites.filter(inv => inv.status && inv.status !== "pending");
    if (sentInvites.length > 0) packagesSent++;
    totalInvites += sentInvites.length;
    for (const inv of sentInvites) {
      if (OPENED_STATUSES.has(inv.status)) openedCount++;
      if (SUBMITTED_STATUSES.has(inv.status)) submittedCount++;
    }
  }

  const openRate = totalInvites > 0 ? Math.round((openedCount / totalInvites) * 100) : 0;
  const responseRate = totalInvites > 0 ? Math.round((submittedCount / totalInvites) * 100) : 0;

  // Don't render if nothing has been sent
  if (packagesSent === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: T.space[4],
        marginBottom: T.space[5],
      }}
    >
      <KPI label="Packages Sent" value={packagesSent} sub={`${packagesSent} of ${totalPackages} total`} icon={I.send} />
      <KPI
        label="Invitations Out"
        value={totalInvites}
        sub={`across ${packagesSent} package${packagesSent !== 1 ? "s" : ""}`}
        icon={I.bid}
      />
      <KPI label="Opened" value={openedCount} sub={`${openRate}% open rate`} icon={I.eye} color="#30D158" />
      <KPI
        label="Proposals In"
        value={submittedCount}
        sub={`${responseRate}% response rate`}
        icon={I.check}
        color="#BF5AF2"
        accent
      />
    </div>
  );
}
