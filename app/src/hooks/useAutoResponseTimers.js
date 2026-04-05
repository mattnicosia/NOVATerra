// Hook: fires deadline-based auto-response triggers (48h / 24h reminders)
// Runs on an interval, checks all active bid packages for approaching due dates
import { useEffect, useRef } from "react";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useProjectStore } from "@/stores/projectStore";
import { fireAutoResponse } from "@/utils/autoResponseEngine";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export default function useAutoResponseTimers() {
  const ranRef = useRef(false);

  useEffect(() => {
    const checkDeadlines = () => {
      const { bidPackages, invitations } = useBidManagementStore.getState();
      const { hasDraft, triggerConfig } = useCollaborationStore.getState();
      const project = useProjectStore.getState().project;

      const hasDeadlineTriggers = triggerConfig.bidDue48h?.enabled || triggerConfig.bidDue24h?.enabled;
      const hasNoResponseTrigger = triggerConfig.noResponse72h?.enabled;

      if (!hasDeadlineTriggers && !hasNoResponseTrigger) return;

      const now = Date.now();

      for (const pkg of bidPackages) {
        if (pkg.status === "awarded" || pkg.status === "closed") continue;

        const pkgInvites = invitations[pkg.id] || [];

        // ── Deadline-based triggers (48h / 24h) ──
        if (hasDeadlineTriggers && pkg.dueDate) {
          const due = new Date(pkg.dueDate + "T17:00:00"); // 5pm on due date
          const hoursLeft = (due - now) / 3600000;

          if (hoursLeft > 0 && hoursLeft <= 48) {
            for (const inv of pkgInvites) {
              // Only remind subs who haven't submitted yet
              if (!["sent", "opened", "downloaded"].includes(inv.status)) continue;

              const ctx = {
                packageId: pkg.id,
                invitationId: inv.id,
                recipientEmail: inv.subEmail || "",
                subCompany: inv.subCompany || inv.subContact || "",
                projectName: pkg.name || project?.name || "",
                dueDate: due.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }),
              };

              // 48h trigger
              if (hoursLeft > 24 && !hasDraft("bidDue48h", inv.id)) {
                fireAutoResponse("bidDue48h", ctx);
              }

              // 24h trigger
              if (hoursLeft <= 24 && !hasDraft("bidDue24h", inv.id)) {
                fireAutoResponse("bidDue24h", ctx);
              }
            }
          }
        }

        // ── No-response 72h check ──
        if (hasNoResponseTrigger) {
          for (const inv of pkgInvites) {
            if (inv.status !== "sent") continue; // only subs who haven't opened
            if (!inv.sentAt) continue;
            const hoursSinceSent = (now - new Date(inv.sentAt).getTime()) / 3600000;
            if (hoursSinceSent >= 72 && !hasDraft("noResponse72h", inv.id)) {
              fireAutoResponse("noResponse72h", {
                packageId: pkg.id,
                invitationId: inv.id,
                recipientEmail: inv.subEmail || "",
                subCompany: inv.subCompany || inv.subContact || "",
                projectName: pkg.name || project?.name || "",
                dueDate: pkg.dueDate || "",
                sentAt: inv.sentAt,
              });
            }
          }
        }
      }
    };

    // Run once on mount (with short delay so stores are hydrated)
    const initTimer = setTimeout(() => {
      if (!ranRef.current) {
        ranRef.current = true;
        checkDeadlines();
      }
    }, 5000);

    // Set interval
    const interval = setInterval(checkDeadlines, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, []);
}
