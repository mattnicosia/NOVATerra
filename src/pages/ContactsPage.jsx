import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useUiStore } from '@/stores/uiStore';
import Sec from '@/components/shared/Sec';
import Ic from '@/components/shared/Ic';
import CompanySwitcher from '@/components/shared/CompanySwitcher';
import { I } from '@/constants/icons';
import { inp, bt } from '@/utils/styles';

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

  // Company-scoped contacts (estimators stay global)
  const companyTag = activeCompanyId === "__all__" ? "" : activeCompanyId;
  const clients = getContactsForCompany("clients", activeCompanyId);
  const architects = getContactsForCompany("architects", activeCompanyId);
  const engineers = getContactsForCompany("engineers", activeCompanyId);
  const subcontractors = getContactsForCompany("subcontractors", activeCompanyId);

  // Resolve display name for active company profile
  const activeProfileInfo = activeCompanyId === "__all__"
    ? masterData.companyInfo
    : getCompanyInfo(activeCompanyId || undefined);

  const deleteBtn = { width: 24, height: 24, border: "none", background: "transparent", color: C.red, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" };
  const addBtn = bt(C, { background: "transparent", border: `1px dashed ${C.border}`, color: C.accent, padding: "6px 14px" });
  const headerStyle = { fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, padding: "0 0 4px", borderBottom: `1px solid ${C.border}`, marginBottom: 4 };

  return (
    <div style={{ padding: T.space[7], minHeight: "100%" }}>
      <div style={{ maxWidth: 1100 }}>
        <p style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>Manage your company info, contacts, and team. Data persists across all estimates.</p>

        {/* Company Switcher */}
        <div style={{ marginBottom: 16 }}>
          <CompanySwitcher />
        </div>

        {/* Company Info link */}
        <div style={{ padding: "12px 16px", background: C.bg2, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{activeProfileInfo?.name || "Company Profile"}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Company info, logo, and branding are managed in Settings</div>
          </div>
          <button className="ghost-btn" onClick={() => navigate("/settings")} style={bt(C, { background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, padding: "6px 14px", fontSize: 11 })}>
            <Ic d={I.settings} size={13} color={C.accent} /> Open Settings
          </button>
        </div>

        {/* Clients */}
        <Sec title={`Clients (${clients.length})`}>
          <div style={{ ...headerStyle, display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr .8fr .8fr auto", gap: 8 }}>
            <span>Company</span><span>Contact</span><span>Email</span><span>Phone</span><span>Notes</span><span></span>
          </div>
          <div style={{ marginBottom: 8 }}>
            {clients.map(c => (
              <div key={c.id} className="row" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr .8fr .8fr auto", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.bg2}`, alignItems: "center" }}>
                <input value={c.company} onChange={e => updateMasterItem("clients", c.id, "company", e.target.value)} placeholder="Company Name" style={inp(C, { padding: "5px 8px", fontSize: 12, fontWeight: 600 })} />
                <input value={c.contact || ""} onChange={e => updateMasterItem("clients", c.id, "contact", e.target.value)} placeholder="Contact Name" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={c.email || ""} onChange={e => updateMasterItem("clients", c.id, "email", e.target.value)} placeholder="Email" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={c.phone || ""} onChange={e => updateMasterItem("clients", c.id, "phone", e.target.value)} placeholder="Phone" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={c.notes || ""} onChange={e => updateMasterItem("clients", c.id, "notes", e.target.value)} placeholder="Notes" style={inp(C, { padding: "5px 8px", fontSize: 10 })} />
                <button className="icon-btn" onClick={() => removeMasterItem("clients", c.id)} style={deleteBtn}><Ic d={I.trash} size={12} /></button>
              </div>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => addMasterItem("clients", { company: "", contact: "", email: "", phone: "", address: "", notes: "", companyProfileId: companyTag })} style={addBtn}>
            <Ic d={I.plus} size={12} color={C.accent} /> Add Client
          </button>
        </Sec>

        {/* Architects */}
        <Sec title={`Architects (${architects.length})`}>
          <div style={{ marginBottom: 8 }}>
            {architects.map(a => (
              <div key={a.id} className="row" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr .8fr auto", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.bg2}`, alignItems: "center" }}>
                <input value={a.company} onChange={e => updateMasterItem("architects", a.id, "company", e.target.value)} placeholder="Firm Name" style={inp(C, { padding: "5px 8px", fontSize: 12, fontWeight: 600 })} />
                <input value={a.contact || ""} onChange={e => updateMasterItem("architects", a.id, "contact", e.target.value)} placeholder="Contact" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={a.email || ""} onChange={e => updateMasterItem("architects", a.id, "email", e.target.value)} placeholder="Email" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={a.phone || ""} onChange={e => updateMasterItem("architects", a.id, "phone", e.target.value)} placeholder="Phone" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <button className="icon-btn" onClick={() => removeMasterItem("architects", a.id)} style={deleteBtn}><Ic d={I.trash} size={12} /></button>
              </div>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => addMasterItem("architects", { company: "", contact: "", email: "", phone: "", companyProfileId: companyTag })} style={addBtn}>
            <Ic d={I.plus} size={12} color={C.accent} /> Add Architect
          </button>
        </Sec>

        {/* Engineers */}
        <Sec title={`Engineers (${engineers.length})`}>
          <div style={{ marginBottom: 8 }}>
            {engineers.map(eng => (
              <div key={eng.id} className="row" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr .8fr auto", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.bg2}`, alignItems: "center" }}>
                <input value={eng.company} onChange={e => updateMasterItem("engineers", eng.id, "company", e.target.value)} placeholder="Firm Name" style={inp(C, { padding: "5px 8px", fontSize: 12, fontWeight: 600 })} />
                <input value={eng.contact || ""} onChange={e => updateMasterItem("engineers", eng.id, "contact", e.target.value)} placeholder="Contact" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={eng.email || ""} onChange={e => updateMasterItem("engineers", eng.id, "email", e.target.value)} placeholder="Email" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={eng.phone || ""} onChange={e => updateMasterItem("engineers", eng.id, "phone", e.target.value)} placeholder="Phone" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <button className="icon-btn" onClick={() => removeMasterItem("engineers", eng.id)} style={deleteBtn}><Ic d={I.trash} size={12} /></button>
              </div>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => addMasterItem("engineers", { company: "", contact: "", email: "", phone: "", companyProfileId: companyTag })} style={addBtn}>
            <Ic d={I.plus} size={12} color={C.accent} /> Add Engineer
          </button>
        </Sec>

        {/* Estimators */}
        <Sec title={`Estimators (${masterData.estimators.length})`}>
          <div style={{ marginBottom: 8 }}>
            {masterData.estimators.map(est => (
              <div key={est.id} className="row" style={{ display: "grid", gridTemplateColumns: "1.2fr .6fr 1.5fr auto", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.bg2}`, alignItems: "center" }}>
                <input value={est.name} onChange={e => updateMasterItem("estimators", est.id, "name", e.target.value)} placeholder="Full Name" style={inp(C, { padding: "5px 8px", fontSize: 12, fontWeight: 600 })} />
                <input value={est.initials || ""} onChange={e => updateMasterItem("estimators", est.id, "initials", e.target.value)} placeholder="MN" style={inp(C, { padding: "5px 8px", fontSize: 12, textAlign: "center", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 })} />
                <input value={est.email || ""} onChange={e => updateMasterItem("estimators", est.id, "email", e.target.value)} placeholder="Email" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <button className="icon-btn" onClick={() => removeMasterItem("estimators", est.id)} style={deleteBtn}><Ic d={I.trash} size={12} /></button>
              </div>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => addMasterItem("estimators", { name: "", initials: "", email: "" })} style={addBtn}>
            <Ic d={I.plus} size={12} color={C.accent} /> Add Estimator
          </button>
        </Sec>

        {/* Subcontractors */}
        <Sec title={`Subcontractors (${subcontractors.length})`}>
          <div style={{ ...headerStyle, display: "grid", gridTemplateColumns: "1.4fr .8fr 1fr 1.2fr .7fr .6fr auto", gap: 8 }}>
            <span>Company</span><span>Trade</span><span>Contact</span><span>Email</span><span>Phone</span><span>Rating</span><span></span>
          </div>
          <div style={{ marginBottom: 8 }}>
            {subcontractors.map(s => (
              <div key={s.id} className="row" style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr 1fr 1.2fr .7fr .6fr auto", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.bg2}`, alignItems: "center" }}>
                <input value={s.company} onChange={e => updateMasterItem("subcontractors", s.id, "company", e.target.value)} placeholder="Company Name" style={inp(C, { padding: "5px 8px", fontSize: 12, fontWeight: 600 })} />
                <input value={s.trade || ""} onChange={e => updateMasterItem("subcontractors", s.id, "trade", e.target.value)} placeholder="Trade" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={s.contact || ""} onChange={e => updateMasterItem("subcontractors", s.id, "contact", e.target.value)} placeholder="Contact" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={s.email || ""} onChange={e => updateMasterItem("subcontractors", s.id, "email", e.target.value)} placeholder="Email" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <input value={s.phone || ""} onChange={e => updateMasterItem("subcontractors", s.id, "phone", e.target.value)} placeholder="Phone" style={inp(C, { padding: "5px 8px", fontSize: 11 })} />
                <select value={s.rating || ""} onChange={e => updateMasterItem("subcontractors", s.id, "rating", e.target.value)} style={inp(C, { padding: "4px 6px", fontSize: 10 })}>
                  <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                </select>
                <button className="icon-btn" onClick={() => removeMasterItem("subcontractors", s.id)} style={deleteBtn}><Ic d={I.trash} size={12} /></button>
              </div>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => addMasterItem("subcontractors", { company: "", trade: "", contact: "", email: "", phone: "", notes: "", rating: "", companyProfileId: companyTag })} style={addBtn}>
            <Ic d={I.plus} size={12} color={C.accent} /> Add Subcontractor
          </button>
        </Sec>

        {/* Footer note */}
        <div style={{ padding: 12, background: C.bg1, borderRadius: 6, border: `1px solid ${C.border}`, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            Contact data saves automatically and persists across all estimates. Clients, architects, subcontractors, and estimators appear as dropdown options.
            Company profile & branding is managed in{" "}
            <button onClick={() => navigate("/settings")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontWeight: 600, fontSize: 11, padding: 0, textDecoration: "underline" }}>Settings</button>.
          </div>
        </div>
      </div>
    </div>
  );
}
