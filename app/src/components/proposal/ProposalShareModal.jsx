import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useReportsStore } from "@/stores/reportsStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { supabase } from "@/utils/supabase";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, inp } from "@/utils/styles";

export default function ProposalShareModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const alternates = useAlternatesStore(s => s.alternates);
  const exclusions = useSpecsStore(s => s.exclusions);
  const clarifications = useSpecsStore(s => s.clarifications);
  const masterData = useMasterDataStore(s => s.masterData);
  const getCompanyInfo = useMasterDataStore(s => s.getCompanyInfo);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const { sectionOrder, sectionVisibility, proposalDesign } = useReportsStore.getState();

  const [recipientName, setRecipientName] = useState(project?.client || "");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [password, setPassword] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const companyInfo = getCompanyInfo(project?.companyProfileId);

  const handleCreate = async () => {
    setLoading(true);
    try {
      // Build totals
      const totals = useItemsStore.getState().getTotals?.() || {};

      // Build div totals
      const divTotals = {};
      items.forEach(it => {
        const div = (it.code || "").substring(0, 2) || (it.division || "").substring(0, 2);
        if (!div) return;
        const cost = ((it.material || 0) + (it.labor || 0) + (it.equipment || 0) + (it.subcontractor || 0)) * (it.quantity || 0);
        divTotals[div] = (divTotals[div] || 0) + cost;
      });

      // Visible sections
      const visibleSections = sectionOrder.filter(id => sectionVisibility[id]);

      // Snapshot proposal data
      const proposalData = {
        items: items.map(i => ({ id: i.id, description: i.description, code: i.code, unit: i.unit, quantity: i.quantity, material: i.material, labor: i.labor, equipment: i.equipment, subcontractor: i.subcontractor, division: i.division, trade: i.trade, allowanceOf: i.allowanceOf })),
        totals,
        divTotals,
        alternates,
        exclusions,
        clarifications,
        allowanceItems: items.filter(i => i.allowanceOf),
        allowanceGrandTotal: items.filter(i => i.allowanceOf).reduce((s, i) => s + (i.quantity || 0) * ((i.material || 0) + (i.labor || 0) + (i.equipment || 0) + (i.subcontractor || 0)), 0),
        visibleSections,
        usedDivisions: [...new Set(items.map(i => i.division).filter(Boolean))],
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not logged in — please refresh and try again");

      // Limit items to prevent payload too large (keep first 200)
      const limitedProposalData = {
        ...proposalData,
        items: proposalData.items.slice(0, 200),
      };

      const res = await fetch("/api/create-living-proposal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          estimateId: activeEstimateId,
          proposalData: limitedProposalData,
          designConfig: proposalDesign,
          companyInfo: companyInfo || {},
          projectInfo: { name: project?.name, projectName: project?.projectName, client: project?.client, projectSF: project?.projectSF, buildingType: project?.buildingType, address: project?.address, bidDate: project?.bidDate, workType: project?.workType, laborType: project?.laborType },
          recipientName,
          recipientEmail: recipientEmail || null,
          password: password || null,
          expiresInDays,
        }),
      });

      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setResult(json);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal onClose={onClose} wide>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
          <Ic d={I.send} size={16} color={C.accent} /> Share as Living Proposal
        </h3>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
          Create an interactive web link. Recipients can view, navigate, and accept online.
        </div>
      </div>

      {!result ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Recipient Name</label>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)} style={inp(C, { width: "100%", marginTop: 4 })} placeholder="Client name" />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Recipient Email (optional)</label>
              <input value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} style={inp(C, { width: "100%", marginTop: 4 })} placeholder="client@example.com" />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Password (optional)</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inp(C, { width: "100%", marginTop: 4 })} placeholder="Leave blank for no password" />
              </div>
              <div style={{ width: 120 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Expires in</label>
                <select value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} style={inp(C, { width: "100%", marginTop: 4 })}>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
              </div>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={loading}
            style={bt(C, {
              width: "100%",
              background: loading ? C.bg2 : (C.gradient || C.accent),
              color: loading ? C.textDim : "#fff",
              padding: "12px 20px",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
            })}
          >
            {loading ? "Creating..." : "Create Living Proposal"}
          </button>
        </>
      ) : (
        <div>
          <div style={{ padding: 16, background: `${C.accent}08`, border: `1px solid ${C.accent}30`, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginBottom: 8 }}>Your Living Proposal is ready!</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                readOnly
                value={result.url}
                style={inp(C, { flex: 1, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" })}
                onClick={e => e.target.select()}
              />
              <button onClick={handleCopy} style={bt(C, { background: C.accent, color: "#fff", padding: "8px 14px", fontSize: 11, fontWeight: 700 })}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {result.expiresAt && (
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
                Expires: {new Date(result.expiresAt).toLocaleDateString()}
              </div>
            )}
          </div>
          <button onClick={onClose} style={bt(C, { width: "100%", background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "10px 16px", fontSize: 12 })}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
