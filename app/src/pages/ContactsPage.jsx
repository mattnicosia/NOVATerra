import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import CompanySwitcher from "@/components/shared/CompanySwitcher";
import EmptyState from "@/components/shared/EmptyState";
import { I } from "@/constants/icons";
import { inp, bt, card, sectionLabel } from "@/utils/styles";

const TABS = [
  { key: "clients", label: "Clients", icon: I.folder },
  { key: "architects", label: "Architects", icon: I.plans },
  { key: "engineers", label: "Engineers", icon: I.settings },
  { key: "estimators", label: "Estimators", icon: I.user },
  { key: "subcontractors", label: "Subs", icon: I.assembly },
];

export default function ContactsPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const masterData = useMasterDataStore(s => s.masterData);
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const updateMasterItem = useMasterDataStore(s => s.updateMasterItem);
  const removeMasterItem = useMasterDataStore(s => s.removeMasterItem);
  const getContactsForCompany = useMasterDataStore(s => s.getContactsForCompany);
  const getCompanyInfo = useMasterDataStore(s => s.getCompanyInfo);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const showToast = useUiStore(s => s.showToast);

  const [activeTab, setActiveTab] = useState("clients");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dupWarning, setDupWarning] = useState(null);
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);

  const companyTag = activeCompanyId === "__all__" ? "" : activeCompanyId;
  const clients = getContactsForCompany("clients", activeCompanyId);
  const architects = getContactsForCompany("architects", activeCompanyId);
  const engineers = getContactsForCompany("engineers", activeCompanyId);
  const subcontractors = getContactsForCompany("subcontractors", activeCompanyId);
  const estimators = masterData.estimators || [];

  const activeProfileInfo =
    activeCompanyId === "__all__" ? masterData.companyInfo : getCompanyInfo(activeCompanyId || undefined);

  const counts = {
    clients: clients.length,
    architects: architects.length,
    engineers: engineers.length,
    estimators: estimators.length,
    subcontractors: subcontractors.length,
  };
  const totalContacts = Object.values(counts).reduce((a, b) => a + b, 0);

  // ── Get all items for current tab ──
  const getAllItems = () => {
    switch (activeTab) {
      case "clients":
        return clients;
      case "architects":
        return architects;
      case "engineers":
        return engineers;
      case "estimators":
        return estimators;
      case "subcontractors":
        return subcontractors;
      default:
        return [];
    }
  };
  const allItems = getAllItems();

  // ── Group by company ──
  const grouped = useMemo(() => {
    if (activeTab === "estimators") return null; // estimators are flat (no company)
    const map = new Map();
    const q = search.toLowerCase();
    allItems.forEach(item => {
      // search filter
      if (q) {
        const fields = ["company", "contact", "email", "trade", "phone", "name"];
        const match = fields.some(f => (item[f] || "").toLowerCase().includes(q));
        if (!match) return;
      }
      const key = (item.company || "").trim() || "__unnamed__";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [allItems, search, activeTab]);

  // ── Filtered estimators (flat) ──
  const filteredEstimators = useMemo(() => {
    if (activeTab !== "estimators") return [];
    const q = search.toLowerCase();
    return q
      ? estimators.filter(e => ["name", "email", "initials"].some(f => (e[f] || "").toLowerCase().includes(q)))
      : estimators;
  }, [estimators, search, activeTab]);

  // ── Duplicate detection ──
  const checkDuplicate = (companyName, contactName, email) => {
    const items = getAllItems();
    const cn = (companyName || "").trim().toLowerCase();
    const ct = (contactName || "").trim().toLowerCase();
    const em = (email || "").trim().toLowerCase();

    for (const item of items) {
      const isCo = (item.company || "").trim().toLowerCase() === cn && cn;
      const isCt = (item.contact || item.name || "").trim().toLowerCase() === ct && ct;
      const isEm = (item.email || "").trim().toLowerCase() === em && em;

      if (isEm) return { match: item, reason: `Email "${email}" already exists` };
      if (isCo && isCt) return { match: item, reason: `"${contactName}" at "${companyName}" already exists` };
    }
    return null;
  };

  // ── Add person to existing company ──
  const handleAddPerson = companyName => {
    const templates = {
      clients: {
        company: companyName,
        contact: "",
        email: "",
        phone: "",
        address: "",
        notes: "",
        companyProfileId: companyTag,
      },
      architects: { company: companyName, contact: "", email: "", phone: "", companyProfileId: companyTag },
      engineers: { company: companyName, contact: "", email: "", phone: "", companyProfileId: companyTag },
      subcontractors: {
        company: companyName,
        trade: "",
        contact: "",
        email: "",
        phone: "",
        notes: "",
        rating: "",
        companyProfileId: companyTag,
      },
    };
    addMasterItem(activeTab, templates[activeTab]);
    showToast(`Person added to ${companyName}`);
  };

  // ── Add new company or estimator ──
  const handleAddNew = () => {
    if (activeTab === "estimators") {
      addMasterItem("estimators", { name: "", initials: "", email: "" });
      return;
    }
    setShowNewCompanyModal(true);
  };

  const handleDelete = id => {
    removeMasterItem(activeTab, id);
    setDeleteConfirm(null);
  };

  // ── Duplicate-aware field update ──
  const handleFieldUpdate = (tab, id, field, value) => {
    // Check for duplicate on key fields
    if (field === "email" && value.includes("@")) {
      const dup = checkDuplicate("", "", value);
      if (dup && dup.match.id !== id) {
        setDupWarning({ id, msg: dup.reason });
        setTimeout(() => setDupWarning(prev => (prev?.id === id ? null : prev)), 4000);
      }
    }
    if (field === "contact" || field === "name") {
      const item = allItems.find(i => i.id === id);
      if (item) {
        const dup = checkDuplicate(item.company || "", value, "");
        if (dup && dup.match.id !== id) {
          setDupWarning({ id, msg: dup.reason });
          setTimeout(() => setDupWarning(prev => (prev?.id === id ? null : prev)), 4000);
        }
      }
    }
    updateMasterItem(tab, id, field, value);
  };

  const getInitials = item => {
    if (item.initials) return item.initials;
    const name = item.contact || item.company || item.name || "";
    if (!name.trim()) return "?";
    return (
      name
        .trim()
        .split(/\s+/)
        .map(w => w[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?"
    );
  };

  const tabColor = key => {
    switch (key) {
      case "clients":
        return C.accent;
      case "architects":
        return C.purple;
      case "engineers":
        return C.green;
      case "estimators":
        return C.orange;
      case "subcontractors":
        return "#FF6B9D";
      default:
        return C.accent;
    }
  };

  const accent = tabColor(activeTab);
  const inputStyle = inp(C, { padding: "6px 10px", fontSize: 12 });
  const inputBoldStyle = inp(C, { padding: "6px 10px", fontSize: 12, fontWeight: 600 });
  const tabLabel = TABS.find(t => t.key === activeTab)?.label || "";
  const singularLabel = tabLabel.replace(/s$/, "");

  return (
    <div style={{ padding: T.space[7], minHeight: "100%" }}>
      <div style={{ maxWidth: 1100 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: T.space[5],
          }}
        >
          <div>
            <h1
              style={{
                fontSize: T.fontSize.xl,
                fontWeight: T.fontWeight.bold,
                color: C.text,
                marginBottom: T.space[1],
              }}
            >
              People
            </h1>
            <p style={{ color: C.textMuted, fontSize: T.fontSize.sm }}>
              {totalContacts} {totalContacts === 1 ? "person" : "people"} across all categories
            </p>
          </div>
          <CompanySwitcher />
        </div>

        {/* Company logo card */}
        <div
          style={{
            ...card(C),
            padding: `${T.space[3]}px ${T.space[4]}px`,
            marginBottom: T.space[5],
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderLeft: `3px solid ${accent}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
            {activeProfileInfo?.logo ? (
              <img src={activeProfileInfo.logo} style={{ height: 36, maxWidth: 80, objectFit: "contain" }} />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: T.radius.sm,
                  background: `${accent}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ic d={I.folder} size={18} color={accent} />
              </div>
            )}
          </div>
          <button
            className="ghost-btn"
            onClick={() => navigate("/settings")}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textMuted,
              padding: "6px 14px",
              fontSize: 11,
              borderRadius: T.radius.sm,
            })}
          >
            <Ic d={I.settings} size={12} color={C.textMuted} /> Settings
          </button>
        </div>

        {/* Tabs + Search */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: T.space[4],
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: T.radius.md, padding: 3 }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              const tc = tabColor(tab.key);
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    ...bt(C),
                    padding: "7px 14px",
                    fontSize: T.fontSize.sm,
                    borderRadius: T.radius.sm,
                    background: isActive ? C.glassBg || "rgba(18,21,28,0.85)" : "transparent",
                    color: isActive ? tc : C.textMuted,
                    boxShadow: isActive ? `0 0 12px ${tc}15, ${T.shadow.sm}` : "none",
                    border: isActive ? `1px solid ${tc}25` : "1px solid transparent",
                  }}
                >
                  <Ic d={tab.icon} size={13} color={isActive ? tc : C.textDim} />
                  {tab.label}
                  {counts[tab.key] > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 8,
                        marginLeft: 2,
                        background: isActive ? `${tc}20` : `${C.textDim}15`,
                        color: isActive ? tc : C.textDim,
                        lineHeight: "14px",
                      }}
                    >
                      {counts[tab.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: T.space[2], alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <input
                placeholder="Search people..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={inp(C, { width: 200, paddingLeft: 30, fontSize: 12, padding: "6px 10px 6px 30px" })}
              />
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                <Ic d={I.search} size={12} color={C.textDim} />
              </div>
            </div>
            <button
              onClick={handleAddNew}
              className="accent-btn"
              style={bt(C, {
                background: C.gradient || accent,
                color: "#fff",
                padding: "6px 16px",
                borderRadius: T.radius.sm,
                boxShadow: `0 0 12px ${accent}20`,
              })}
            >
              <Ic d={I.plus} size={13} color="#fff" sw={2.5} />{" "}
              {activeTab === "estimators" ? "Add Estimator" : "Add Company"}
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ ...card(C), overflow: "hidden" }}>
          {activeTab === "estimators" ? (
            /* ── Estimators: flat list (no company grouping) ── */
            filteredEstimators.length === 0 ? (
              search ? (
                <EmptyState
                  icon={I.search}
                  title="No matches"
                  subtitle={`No estimators match "${search}"`}
                  color={accent}
                />
              ) : (
                <EmptyState
                  icon={I.user}
                  title="No estimators yet"
                  subtitle="Add your first estimator."
                  action={handleAddNew}
                  actionLabel="Add Estimator"
                  actionIcon={I.plus}
                  color={accent}
                />
              )
            ) : (
              <>
                <div
                  style={{
                    ...sectionLabel(C),
                    fontSize: 9,
                    padding: `${T.space[2]}px ${T.space[4]}px`,
                    background: C.bg2,
                    borderBottom: `1px solid ${C.border}`,
                    display: "grid",
                    gridTemplateColumns: "40px 1.2fr .6fr 1.5fr 36px",
                    gap: 8,
                  }}
                >
                  <span />
                  <span>Name</span>
                  <span>Initials</span>
                  <span>Email</span>
                  <span />
                </div>
                {filteredEstimators.map((item, idx) => (
                  <div
                    key={item.id}
                    className="row"
                    style={{
                      padding: `${T.space[2]}px ${T.space[4]}px`,
                      borderBottom: `1px solid ${C.border}`,
                      animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 30}ms both`,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 1.2fr .6fr 1.5fr 36px",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <ContactAvatar initials={getInitials(item)} color={accent} T={T} />
                      <input
                        value={item.name}
                        onChange={e => handleFieldUpdate("estimators", item.id, "name", e.target.value)}
                        placeholder="Full Name"
                        style={inputBoldStyle}
                      />
                      <input
                        value={item.initials || ""}
                        onChange={e => handleFieldUpdate("estimators", item.id, "initials", e.target.value)}
                        placeholder="MN"
                        style={inp(C, {
                          padding: "6px 10px",
                          fontSize: 12,
                          textAlign: "center",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 2,
                        })}
                      />
                      <input
                        value={item.email || ""}
                        onChange={e => handleFieldUpdate("estimators", item.id, "email", e.target.value)}
                        placeholder="Email"
                        style={inputStyle}
                      />
                      <button
                        className="icon-btn"
                        onClick={() => setDeleteConfirm(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          borderRadius: 4,
                          display: "flex",
                        }}
                      >
                        <Ic d={I.trash} size={12} color={C.red} />
                      </button>
                    </div>
                    {dupWarning?.id === item.id && <DupBanner msg={dupWarning.msg} C={C} T={T} />}
                  </div>
                ))}
                <div style={{ padding: `${T.space[3]}px ${T.space[4]}px` }}>
                  <button
                    className="ghost-btn"
                    onClick={handleAddNew}
                    style={bt(C, {
                      background: "transparent",
                      border: `1px dashed ${C.border}`,
                      color: C.textMuted,
                      padding: "8px 16px",
                      borderRadius: T.radius.sm,
                      width: "100%",
                      justifyContent: "center",
                    })}
                  >
                    <Ic d={I.plus} size={12} color={C.textDim} /> Add Estimator
                  </button>
                </div>
              </>
            )
          ) : /* ── Company-grouped tabs ── */
          !grouped || grouped.size === 0 ? (
            search ? (
              <EmptyState
                icon={I.search}
                title="No matches"
                subtitle={`No ${activeTab} match "${search}"`}
                color={accent}
              />
            ) : (
              <EmptyState
                icon={TABS.find(t => t.key === activeTab)?.icon}
                title={`No ${activeTab} yet`}
                subtitle={`Add your first ${singularLabel.toLowerCase()} company to start building your directory.`}
                action={handleAddNew}
                actionLabel={`Add ${singularLabel} Company`}
                actionIcon={I.plus}
                color={accent}
              />
            )
          ) : (
            <>
              {[...grouped.entries()].map(([companyName, people], gIdx) => (
                <CompanyGroup
                  key={people[0]?.id || `group-${gIdx}`}
                  companyName={companyName}
                  people={people}
                  tab={activeTab}
                  accent={accent}
                  C={C}
                  T={T}
                  inputStyle={inputStyle}
                  inputBoldStyle={inputBoldStyle}
                  handleFieldUpdate={handleFieldUpdate}
                  onDeletePerson={setDeleteConfirm}
                  onAddPerson={handleAddPerson}
                  getInitials={getInitials}
                  dupWarning={dupWarning}
                  isLast={gIdx === grouped.size - 1}
                />
              ))}
              <div style={{ padding: `${T.space[3]}px ${T.space[4]}px` }}>
                <button
                  className="ghost-btn"
                  onClick={handleAddNew}
                  style={bt(C, {
                    background: "transparent",
                    border: `1px dashed ${C.border}`,
                    color: C.textMuted,
                    padding: "8px 16px",
                    borderRadius: T.radius.sm,
                    width: "100%",
                    justifyContent: "center",
                  })}
                >
                  <Ic d={I.plus} size={12} color={C.textDim} /> Add {singularLabel} Company
                </button>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            padding: `${T.space[3]}px ${T.space[4]}px`,
            marginTop: T.space[3],
            fontSize: T.fontSize.xs,
            color: C.textDim,
            textAlign: "center",
          }}
        >
          People data saves automatically and persists across all estimates.
        </div>
      </div>

      {/* New Company modal */}
      {showNewCompanyModal && (
        <NewCompanyModal
          tab={activeTab}
          companyTag={companyTag}
          onSave={data => {
            addMasterItem(activeTab, { ...data, companyProfileId: companyTag });
            showToast(`${data.company} added`);
            setShowNewCompanyModal(false);
          }}
          onClose={() => setShowNewCompanyModal(false)}
          C={C}
          T={T}
        />
      )}

      {/* Delete modal */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            style={{
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.lg,
              padding: T.space[7],
              width: 340,
              boxShadow: T.shadow.xl,
              animation: "modalEnter 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: T.radius.full,
                margin: "0 auto",
                marginBottom: T.space[4],
                background: `${C.red}15`,
                border: `1px solid ${C.red}25`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ic d={I.trash} size={22} color={C.red} sw={1.7} />
            </div>
            <div
              style={{
                fontSize: T.fontSize.md,
                fontWeight: T.fontWeight.semibold,
                color: C.text,
                marginBottom: T.space[2],
                textAlign: "center",
              }}
            >
              Remove Person?
            </div>
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginBottom: T.space[5], textAlign: "center" }}>
              This person will be removed from the directory.
            </div>
            <div style={{ display: "flex", gap: T.space[2], justifyContent: "center" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={bt(C, {
                  background: C.bg2,
                  color: C.textMuted,
                  padding: `${T.space[2]}px ${T.space[5]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: T.radius.sm,
                })}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={bt(C, {
                  background: C.red,
                  color: "#fff",
                  padding: `${T.space[2]}px ${T.space[5]}px`,
                  boxShadow: `0 0 12px ${C.red}30`,
                  borderRadius: T.radius.sm,
                })}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Company Group ── */
function CompanyGroup({
  companyName,
  people,
  tab,
  accent,
  C,
  T,
  inputStyle,
  inputBoldStyle,
  handleFieldUpdate,
  onDeletePerson,
  onAddPerson,
  getInitials,
  dupWarning,
  isLast,
}) {
  const isUnnamed = companyName === "__unnamed__";
  const personCount = people.length;
  const firstPerson = people[0];

  // Local state for debounced company name editing
  const [localName, setLocalName] = useState(isUnnamed ? "" : companyName);
  const debounceRef = useRef(null);
  const isLocalEdit = useRef(false);

  // Sync prop → local when changed externally (not from our own typing)
  useEffect(() => {
    if (!isLocalEdit.current) {
      setLocalName(isUnnamed ? "" : companyName);
    }
    isLocalEdit.current = false;
  }, [companyName, isUnnamed]);

  const handleCompanyNameChange = (e) => {
    const newName = e.target.value;
    isLocalEdit.current = true;
    setLocalName(newName);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      people.forEach(p => handleFieldUpdate(tab, p.id, "company", newName));
    }, 400);
  };

  const handleCompanyNameBlur = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    people.forEach(p => handleFieldUpdate(tab, p.id, "company", localName));
  };

  // For the company header, use the first person's company field
  const companyDisplayName = isUnnamed ? "New Company" : (localName || "New Company");

  // Fields specific to sub tab
  const isSub = tab === "subcontractors";

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
      {/* Company header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${T.space[3]}px ${T.space[4]}px`,
          background: C.bg2,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: T.radius.sm,
              background: `${accent}12`,
              border: `1px solid ${accent}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: accent,
            }}
          >
            {companyDisplayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            {/* Editable company name — debounced to prevent re-render on every keystroke */}
            <input
              value={localName}
              onChange={handleCompanyNameChange}
              onBlur={handleCompanyNameBlur}
              placeholder="Company Name"
              style={inp(C, {
                padding: "3px 8px",
                fontSize: 13,
                fontWeight: 600,
                background: "transparent",
                border: "none",
                color: C.text,
                minWidth: 180,
              })}
            />
            <div style={{ fontSize: 10, color: C.textDim, paddingLeft: 8 }}>
              {personCount} {personCount === 1 ? "person" : "people"}
              {isSub && firstPerson?.trade && <span> · {firstPerson.trade}</span>}
            </div>
          </div>
        </div>
        <button
          className="ghost-btn"
          onClick={() => onAddPerson(companyName === "__unnamed__" ? "" : companyName)}
          style={bt(C, {
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            padding: "4px 12px",
            fontSize: 10,
            borderRadius: T.radius.sm,
          })}
        >
          <Ic d={I.plus} size={10} color={C.textDim} /> Add Person
        </button>
      </div>

      {/* People rows */}
      {people.map((item, idx) => (
        <div
          key={item.id}
          style={{
            padding: `${T.space[2]}px ${T.space[4]}px ${T.space[2]}px ${T.space[4] + 44}px`,
            borderBottom: idx < people.length - 1 ? `1px solid ${C.border}40` : "none",
            animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 30}ms both`,
          }}
        >
          <PersonRow
            tab={tab}
            item={item}
            accent={accent}
            C={C}
            T={T}
            inputStyle={inputStyle}
            handleFieldUpdate={handleFieldUpdate}
            onDelete={() => onDeletePerson(item.id)}
            getInitials={getInitials}
          />
          {dupWarning?.id === item.id && <DupBanner msg={dupWarning.msg} C={C} T={T} />}
        </div>
      ))}
    </div>
  );
}

/* ── Person Row (indented under company) ── */
function PersonRow({ tab, item, accent, C, T, inputStyle, handleFieldUpdate, onDelete, getInitials }) {
  const avatar = <ContactAvatar initials={getInitials(item)} color={accent} T={T} />;
  const delBtn = (
    <button
      className="icon-btn"
      onClick={onDelete}
      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex" }}
    >
      <Ic d={I.trash} size={12} color={C.red} />
    </button>
  );

  if (tab === "clients") {
    return (
      <div
        style={{ display: "grid", gridTemplateColumns: "32px 1.2fr 1.2fr .8fr 1fr 36px", gap: 8, alignItems: "center" }}
      >
        {avatar}
        <input
          value={item.contact || ""}
          onChange={e => handleFieldUpdate("clients", item.id, "contact", e.target.value)}
          placeholder="Person Name"
          style={inputStyle}
        />
        <input
          value={item.email || ""}
          onChange={e => handleFieldUpdate("clients", item.id, "email", e.target.value)}
          placeholder="Email"
          style={inputStyle}
        />
        <input
          value={item.phone || ""}
          onChange={e => handleFieldUpdate("clients", item.id, "phone", e.target.value)}
          placeholder="Phone"
          style={inputStyle}
        />
        <input
          value={item.notes || ""}
          onChange={e => handleFieldUpdate("clients", item.id, "notes", e.target.value)}
          placeholder="Notes / Role"
          style={inp(C, { padding: "6px 10px", fontSize: 11 })}
        />
        {delBtn}
      </div>
    );
  }
  if (tab === "architects" || tab === "engineers") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "32px 1.2fr 1.5fr 1fr 36px", gap: 8, alignItems: "center" }}>
        {avatar}
        <input
          value={item.contact || ""}
          onChange={e => handleFieldUpdate(tab, item.id, "contact", e.target.value)}
          placeholder="Person Name"
          style={inputStyle}
        />
        <input
          value={item.email || ""}
          onChange={e => handleFieldUpdate(tab, item.id, "email", e.target.value)}
          placeholder="Email"
          style={inputStyle}
        />
        <input
          value={item.phone || ""}
          onChange={e => handleFieldUpdate(tab, item.id, "phone", e.target.value)}
          placeholder="Phone"
          style={inputStyle}
        />
        {delBtn}
      </div>
    );
  }
  if (tab === "subcontractors") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px .6fr 1fr 1.2fr .8fr .4fr 36px",
          gap: 8,
          alignItems: "center",
        }}
      >
        {avatar}
        <input
          value={item.trade || ""}
          onChange={e => handleFieldUpdate("subcontractors", item.id, "trade", e.target.value)}
          placeholder="Trade"
          style={inputStyle}
        />
        <input
          value={item.contact || ""}
          onChange={e => handleFieldUpdate("subcontractors", item.id, "contact", e.target.value)}
          placeholder="Person Name"
          style={inputStyle}
        />
        <input
          value={item.email || ""}
          onChange={e => handleFieldUpdate("subcontractors", item.id, "email", e.target.value)}
          placeholder="Email"
          style={inputStyle}
        />
        <input
          value={item.phone || ""}
          onChange={e => handleFieldUpdate("subcontractors", item.id, "phone", e.target.value)}
          placeholder="Phone"
          style={inputStyle}
        />
        <RatingBadge
          value={item.rating}
          onChange={v => handleFieldUpdate("subcontractors", item.id, "rating", v)}
          C={C}
          T={T}
        />
        {delBtn}
      </div>
    );
  }
  return null;
}

/* ── Duplicate warning banner ── */
function DupBanner({ msg, C, T }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        marginTop: 4,
        background: `${C.orange}12`,
        border: `1px solid ${C.orange}25`,
        borderRadius: T.radius.sm,
        fontSize: 10,
        color: C.orange,
        fontWeight: 500,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <Ic d={I.alertTriangle || I.x} size={11} color={C.orange} />
      Possible duplicate: {msg}
    </div>
  );
}

function ContactAvatar({ initials, color, T }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: T.radius.full,
        background: `${color}15`,
        border: `1px solid ${color}20`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 700,
        color: color,
        letterSpacing: 0.5,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

/* ── New Company Modal ── */
function NewCompanyModal({ tab, companyTag, onSave, onClose, C, T }) {
  const FIELD_MAP = {
    subcontractors: ["company", "trade", "contact", "email", "phone", "notes"],
    clients: ["company", "contact", "email", "phone", "address", "notes"],
    architects: ["company", "contact", "email", "phone"],
    engineers: ["company", "contact", "email", "phone"],
  };
  const LABELS = {
    company: "Company Name *",
    trade: "Trade / Specialty",
    contact: "Contact Name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    notes: "Notes",
  };
  const PLACEHOLDERS = {
    company: "Acme Mechanical, Inc.",
    trade: "HVAC, Plumbing, Electrical...",
    contact: "John Smith",
    email: "john@acme.com",
    phone: "(555) 123-4567",
    address: "123 Main St, City, ST 12345",
    notes: "Additional notes...",
  };
  const TAB_LABELS = {
    subcontractors: "Subcontractor",
    clients: "Client",
    architects: "Architect",
    engineers: "Engineer",
  };

  const fields = FIELD_MAP[tab] || [];
  const [form, setForm] = useState(
    Object.fromEntries(fields.map(f => [f, ""])),
  );
  const update = (f, v) => setForm(prev => ({ ...prev, [f]: v }));
  const canSave = (form.company || "").trim().length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        animation: "fadeIn 0.2s ease-out",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.bg1,
          border: `1px solid ${C.border}`,
          borderRadius: T.radius.lg,
          padding: T.space[7],
          width: 420,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: T.shadow.xl,
          animation: "modalEnter 0.3s cubic-bezier(0.16,1,0.3,1)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.semibold,
            color: C.text,
            marginBottom: T.space[1],
          }}
        >
          Add {TAB_LABELS[tab] || "Company"}
        </div>
        <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginBottom: T.space[5] }}>
          Fill in the details below. Company name is required.
        </div>

        {fields.map(f => (
          <div key={f} style={{ marginBottom: T.space[3] }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                marginBottom: 3,
              }}
            >
              {LABELS[f]}
            </label>
            {f === "notes" ? (
              <textarea
                value={form[f] || ""}
                onChange={e => update(f, e.target.value)}
                placeholder={PLACEHOLDERS[f]}
                rows={3}
                style={inp(C, {
                  padding: "8px 12px",
                  fontSize: 13,
                  width: "100%",
                  resize: "vertical",
                  boxSizing: "border-box",
                })}
              />
            ) : (
              <input
                value={form[f] || ""}
                onChange={e => update(f, e.target.value)}
                placeholder={PLACEHOLDERS[f]}
                autoFocus={f === "company"}
                style={inp(C, {
                  padding: "8px 12px",
                  fontSize: 13,
                  width: "100%",
                  boxSizing: "border-box",
                })}
              />
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: T.space[2], justifyContent: "flex-end", marginTop: T.space[5] }}>
          <button
            onClick={onClose}
            style={bt(C, {
              background: C.bg2,
              color: C.textMuted,
              padding: `${T.space[2]}px ${T.space[5]}px`,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.sm,
            })}
          >
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave(form)}
            disabled={!canSave}
            style={bt(C, {
              background: canSave ? C.accent : C.bg2,
              color: canSave ? "#fff" : C.textDim,
              padding: `${T.space[2]}px ${T.space[5]}px`,
              borderRadius: T.radius.sm,
              opacity: canSave ? 1 : 0.5,
              cursor: canSave ? "pointer" : "not-allowed",
            })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingBadge({ value, onChange, C, T }) {
  const ratings = ["", "A", "B", "C", "D"];
  const colors = { A: C.green, B: C.accent, C: C.orange, D: C.red };
  const rc = colors[value] || C.textDim;
  const cycle = () => {
    const idx = ratings.indexOf(value || "");
    onChange(ratings[(idx + 1) % ratings.length]);
  };
  return (
    <button
      onClick={cycle}
      className="icon-btn"
      style={{
        width: 28,
        height: 28,
        borderRadius: T.radius.sm,
        background: value ? `${rc}15` : "transparent",
        border: value ? `1px solid ${rc}30` : `1px solid ${C.border}`,
        color: rc,
        fontSize: 11,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {value || "\u2014"}
    </button>
  );
}
