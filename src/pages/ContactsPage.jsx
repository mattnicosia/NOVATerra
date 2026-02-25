import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import CompanySwitcher from '@/components/shared/CompanySwitcher';
import EmptyState from '@/components/shared/EmptyState';
import { I } from '@/constants/icons';
import { inp, bt, card, sectionLabel } from '@/utils/styles';

const TABS = [
  { key: 'clients', label: 'Clients', icon: I.folder },
  { key: 'architects', label: 'Architects', icon: I.plans },
  { key: 'engineers', label: 'Engineers', icon: I.settings },
  { key: 'estimators', label: 'Estimators', icon: I.user },
  { key: 'subcontractors', label: 'Subs', icon: I.assembly },
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

  const [activeTab, setActiveTab] = useState('clients');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const companyTag = activeCompanyId === "__all__" ? "" : activeCompanyId;
  const clients = getContactsForCompany("clients", activeCompanyId);
  const architects = getContactsForCompany("architects", activeCompanyId);
  const engineers = getContactsForCompany("engineers", activeCompanyId);
  const subcontractors = getContactsForCompany("subcontractors", activeCompanyId);
  const estimators = masterData.estimators;

  const activeProfileInfo = activeCompanyId === "__all__"
    ? masterData.companyInfo
    : getCompanyInfo(activeCompanyId || undefined);

  const counts = {
    clients: clients.length,
    architects: architects.length,
    engineers: engineers.length,
    estimators: estimators.length,
    subcontractors: subcontractors.length,
  };
  const totalContacts = Object.values(counts).reduce((a, b) => a + b, 0);

  const filterBySearch = (items, fields) => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(item => fields.some(f => (item[f] || '').toLowerCase().includes(q)));
  };

  const getActiveItems = () => {
    switch (activeTab) {
      case 'clients': return filterBySearch(clients, ['company', 'contact', 'email']);
      case 'architects': return filterBySearch(architects, ['company', 'contact', 'email']);
      case 'engineers': return filterBySearch(engineers, ['company', 'contact', 'email']);
      case 'estimators': return filterBySearch(estimators, ['name', 'email', 'initials']);
      case 'subcontractors': return filterBySearch(subcontractors, ['company', 'trade', 'contact', 'email']);
      default: return [];
    }
  };
  const activeItems = getActiveItems();

  const handleAdd = () => {
    const templates = {
      clients: { company: '', contact: '', email: '', phone: '', address: '', notes: '', companyProfileId: companyTag },
      architects: { company: '', contact: '', email: '', phone: '', companyProfileId: companyTag },
      engineers: { company: '', contact: '', email: '', phone: '', companyProfileId: companyTag },
      estimators: { name: '', initials: '', email: '' },
      subcontractors: { company: '', trade: '', contact: '', email: '', phone: '', notes: '', rating: '', companyProfileId: companyTag },
    };
    addMasterItem(activeTab, templates[activeTab]);
  };

  const handleDelete = (id) => {
    removeMasterItem(activeTab, id);
    setDeleteConfirm(null);
  };

  const getInitials = (item) => {
    if (item.initials) return item.initials;
    const name = item.contact || item.company || item.name || '';
    return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  };

  const tabColor = (key) => {
    switch (key) {
      case 'clients': return C.accent;
      case 'architects': return C.purple;
      case 'engineers': return C.green;
      case 'estimators': return C.orange;
      case 'subcontractors': return '#FF6B9D';
      default: return C.accent;
    }
  };

  const accent = tabColor(activeTab);
  const inputStyle = inp(C, { padding: '6px 10px', fontSize: 12 });
  const inputBoldStyle = inp(C, { padding: '6px 10px', fontSize: 12, fontWeight: 600 });

  return (
    <div style={{ padding: T.space[7], minHeight: '100%' }}>
      <div style={{ maxWidth: 1100 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: T.space[5] }}>
          <div>
            <h1 style={{ fontSize: T.fontSize.xl, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[1] }}>Contacts</h1>
            <p style={{ color: C.textMuted, fontSize: T.fontSize.sm }}>
              {totalContacts} contact{totalContacts !== 1 ? 's' : ''} across all categories
            </p>
          </div>
          <CompanySwitcher />
        </div>

        {/* Company info card */}
        <div style={{ ...card(C), padding: `${T.space[3]}px ${T.space[4]}px`, marginBottom: T.space[5], display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `3px solid ${accent}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: T.space[3] }}>
            <div style={{ width: 36, height: 36, borderRadius: T.radius.sm, background: `${accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic d={I.settings} size={16} color={accent} />
            </div>
            <div>
              <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.text }}>{activeProfileInfo?.name || 'Company Profile'}</div>
              <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>Logo, branding & company info managed in Settings</div>
            </div>
          </div>
          <button className="ghost-btn" onClick={() => navigate('/settings')} style={bt(C, { background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 14px', fontSize: 11, borderRadius: T.radius.sm })}>
            <Ic d={I.settings} size={12} color={C.textMuted} /> Settings
          </button>
        </div>

        {/* Tabs + Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.space[4] }}>
          <div style={{ display: 'flex', gap: 2, background: C.bg2, borderRadius: T.radius.md, padding: 3 }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              const tc = tabColor(tab.key);
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                  ...bt(C), padding: '7px 14px', fontSize: T.fontSize.sm, borderRadius: T.radius.sm,
                  background: isActive ? (C.glassBg || 'rgba(18,21,28,0.85)') : 'transparent',
                  color: isActive ? tc : C.textMuted,
                  boxShadow: isActive ? `0 0 12px ${tc}15, ${T.shadow.sm}` : 'none',
                  border: isActive ? `1px solid ${tc}25` : '1px solid transparent',
                }}>
                  <Ic d={tab.icon} size={13} color={isActive ? tc : C.textDim} />
                  {tab.label}
                  {counts[tab.key] > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, marginLeft: 2, background: isActive ? `${tc}20` : `${C.textDim}15`, color: isActive ? tc : C.textDim, lineHeight: '14px' }}>{counts[tab.key]}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: T.space[2], alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} style={inp(C, { width: 200, paddingLeft: 30, fontSize: 12, padding: '6px 10px 6px 30px' })} />
              <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}><Ic d={I.search} size={12} color={C.textDim} /></div>
            </div>
            <button onClick={handleAdd} className="accent-btn" style={bt(C, { background: C.gradient || accent, color: '#fff', padding: '6px 16px', borderRadius: T.radius.sm, boxShadow: `0 0 12px ${accent}20` })}>
              <Ic d={I.plus} size={13} color="#fff" sw={2.5} /> Add {TABS.find(t => t.key === activeTab)?.label.replace(/s$/, '')}
            </button>
          </div>
        </div>

        {/* Contact list */}
        <div style={{ ...card(C), overflow: 'hidden' }}>
          {activeItems.length === 0 ? (
            search ? (
              <EmptyState icon={I.search} title="No matches" subtitle={`No ${activeTab} match "${search}"`} color={accent} />
            ) : (
              <EmptyState icon={TABS.find(t => t.key === activeTab)?.icon} title={`No ${activeTab} yet`} subtitle={`Add your first ${activeTab.replace(/s$/, '')} to start building your contact book.`} action={handleAdd} actionLabel={`Add ${TABS.find(t => t.key === activeTab)?.label.replace(/s$/, '')}`} actionIcon={I.plus} color={accent} />
            )
          ) : (
            <>
              {/* Column headers */}
              <ColumnHeaders tab={activeTab} C={C} T={T} />

              {/* Rows */}
              {activeItems.map((item, idx) => (
                <div key={item.id} className="row" style={{ padding: `${T.space[2]}px ${T.space[4]}px`, borderBottom: `1px solid ${C.border}`, animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 30}ms both` }}>
                  <ContactRow tab={activeTab} item={item} accent={accent} T={T} C={C} inputStyle={inputStyle} inputBoldStyle={inputBoldStyle} updateMasterItem={updateMasterItem} onDelete={() => setDeleteConfirm(item.id)} getInitials={getInitials} />
                </div>
              ))}

              {/* Add row */}
              <div style={{ padding: `${T.space[3]}px ${T.space[4]}px` }}>
                <button className="ghost-btn" onClick={handleAdd} style={bt(C, { background: 'transparent', border: `1px dashed ${C.border}`, color: C.textMuted, padding: '8px 16px', borderRadius: T.radius.sm, width: '100%', justifyContent: 'center' })}>
                  <Ic d={I.plus} size={12} color={C.textDim} /> Add {TABS.find(t => t.key === activeTab)?.label.replace(/s$/, '')}
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: `${T.space[3]}px ${T.space[4]}px`, marginTop: T.space[3], fontSize: T.fontSize.xs, color: C.textDim, textAlign: 'center' }}>
          Contact data saves automatically and persists across all estimates.
        </div>
      </div>

      {/* Delete modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, animation: 'fadeIn 0.2s ease-out' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: T.radius.lg, padding: T.space[7], width: 340, boxShadow: T.shadow.xl, animation: 'modalEnter 0.3s cubic-bezier(0.16,1,0.3,1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 48, height: 48, borderRadius: T.radius.full, margin: '0 auto', marginBottom: T.space[4], background: `${C.red}15`, border: `1px solid ${C.red}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic d={I.trash} size={22} color={C.red} sw={1.7} />
            </div>
            <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.semibold, color: C.text, marginBottom: T.space[2], textAlign: 'center' }}>Delete Contact?</div>
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginBottom: T.space[5], textAlign: 'center' }}>This contact will be removed permanently.</div>
            <div style={{ display: 'flex', gap: T.space[2], justifyContent: 'center' }}>
              <button onClick={() => setDeleteConfirm(null)} style={bt(C, { background: C.bg2, color: C.textMuted, padding: `${T.space[2]}px ${T.space[5]}px`, border: `1px solid ${C.border}`, borderRadius: T.radius.sm })}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={bt(C, { background: C.red, color: '#fff', padding: `${T.space[2]}px ${T.space[5]}px`, boxShadow: `0 0 12px ${C.red}30`, borderRadius: T.radius.sm })}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Column headers per tab
function ColumnHeaders({ tab, C, T }) {
  const base = { ...sectionLabel(C), fontSize: 9, padding: `${T.space[2]}px ${T.space[4]}px`, background: C.bg2, borderBottom: `1px solid ${C.border}` };
  const grids = {
    clients: { gridTemplateColumns: '40px 1.5fr 1fr 1.2fr .8fr 1fr 36px', cols: ['', 'Company', 'Contact', 'Email', 'Phone', 'Notes', ''] },
    architects: { gridTemplateColumns: '40px 1.5fr 1fr 1.2fr .8fr 36px', cols: ['', 'Firm', 'Contact', 'Email', 'Phone', ''] },
    engineers: { gridTemplateColumns: '40px 1.5fr 1fr 1.2fr .8fr 36px', cols: ['', 'Firm', 'Contact', 'Email', 'Phone', ''] },
    estimators: { gridTemplateColumns: '40px 1.2fr .6fr 1.5fr 36px', cols: ['', 'Name', 'Initials', 'Email', ''] },
    subcontractors: { gridTemplateColumns: '40px 1.4fr .7fr 1fr 1.2fr .7fr .5fr 36px', cols: ['', 'Company', 'Trade', 'Contact', 'Email', 'Phone', 'Rating', ''] },
  };
  const g = grids[tab];
  return (
    <div style={{ ...base, display: 'grid', gridTemplateColumns: g.gridTemplateColumns, gap: 8 }}>
      {g.cols.map((c, i) => <span key={i}>{c}</span>)}
    </div>
  );
}

// Contact row per tab
function ContactRow({ tab, item, accent, T, C, inputStyle, inputBoldStyle, updateMasterItem, onDelete, getInitials }) {
  const avatar = <ContactAvatar initials={getInitials(item)} color={accent} T={T} />;
  const delBtn = <button className="icon-btn" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' }}><Ic d={I.trash} size={12} color={C.red} /></button>;

  if (tab === 'clients') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1fr 1.2fr .8fr 1fr 36px', gap: 8, alignItems: 'center' }}>
        {avatar}
        <input value={item.company} onChange={e => updateMasterItem('clients', item.id, 'company', e.target.value)} placeholder="Company" style={inputBoldStyle} />
        <input value={item.contact || ''} onChange={e => updateMasterItem('clients', item.id, 'contact', e.target.value)} placeholder="Contact" style={inputStyle} />
        <input value={item.email || ''} onChange={e => updateMasterItem('clients', item.id, 'email', e.target.value)} placeholder="Email" style={inputStyle} />
        <input value={item.phone || ''} onChange={e => updateMasterItem('clients', item.id, 'phone', e.target.value)} placeholder="Phone" style={inputStyle} />
        <input value={item.notes || ''} onChange={e => updateMasterItem('clients', item.id, 'notes', e.target.value)} placeholder="Notes" style={inp(C, { padding: '6px 10px', fontSize: 11 })} />
        {delBtn}
      </div>
    );
  }
  if (tab === 'architects' || tab === 'engineers') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1.5fr 1fr 1.2fr .8fr 36px', gap: 8, alignItems: 'center' }}>
        {avatar}
        <input value={item.company} onChange={e => updateMasterItem(tab, item.id, 'company', e.target.value)} placeholder="Firm" style={inputBoldStyle} />
        <input value={item.contact || ''} onChange={e => updateMasterItem(tab, item.id, 'contact', e.target.value)} placeholder="Contact" style={inputStyle} />
        <input value={item.email || ''} onChange={e => updateMasterItem(tab, item.id, 'email', e.target.value)} placeholder="Email" style={inputStyle} />
        <input value={item.phone || ''} onChange={e => updateMasterItem(tab, item.id, 'phone', e.target.value)} placeholder="Phone" style={inputStyle} />
        {delBtn}
      </div>
    );
  }
  if (tab === 'estimators') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1.2fr .6fr 1.5fr 36px', gap: 8, alignItems: 'center' }}>
        {avatar}
        <input value={item.name} onChange={e => updateMasterItem('estimators', item.id, 'name', e.target.value)} placeholder="Full Name" style={inputBoldStyle} />
        <input value={item.initials || ''} onChange={e => updateMasterItem('estimators', item.id, 'initials', e.target.value)} placeholder="MN" style={inp(C, { padding: '6px 10px', fontSize: 12, textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 })} />
        <input value={item.email || ''} onChange={e => updateMasterItem('estimators', item.id, 'email', e.target.value)} placeholder="Email" style={inputStyle} />
        {delBtn}
      </div>
    );
  }
  if (tab === 'subcontractors') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1.4fr .7fr 1fr 1.2fr .7fr .5fr 36px', gap: 8, alignItems: 'center' }}>
        {avatar}
        <input value={item.company} onChange={e => updateMasterItem('subcontractors', item.id, 'company', e.target.value)} placeholder="Company" style={inputBoldStyle} />
        <input value={item.trade || ''} onChange={e => updateMasterItem('subcontractors', item.id, 'trade', e.target.value)} placeholder="Trade" style={inputStyle} />
        <input value={item.contact || ''} onChange={e => updateMasterItem('subcontractors', item.id, 'contact', e.target.value)} placeholder="Contact" style={inputStyle} />
        <input value={item.email || ''} onChange={e => updateMasterItem('subcontractors', item.id, 'email', e.target.value)} placeholder="Email" style={inputStyle} />
        <input value={item.phone || ''} onChange={e => updateMasterItem('subcontractors', item.id, 'phone', e.target.value)} placeholder="Phone" style={inputStyle} />
        <RatingBadge value={item.rating} onChange={v => updateMasterItem('subcontractors', item.id, 'rating', v)} C={C} T={T} />
        {delBtn}
      </div>
    );
  }
  return null;
}

function ContactAvatar({ initials, color, T }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: T.radius.full, background: `${color}15`, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: color, letterSpacing: 0.5, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function RatingBadge({ value, onChange, C, T }) {
  const ratings = ['', 'A', 'B', 'C', 'D'];
  const colors = { A: C.green, B: C.accent, C: C.orange, D: C.red };
  const rc = colors[value] || C.textDim;
  const cycle = () => {
    const idx = ratings.indexOf(value || '');
    onChange(ratings[(idx + 1) % ratings.length]);
  };
  return (
    <button onClick={cycle} className="icon-btn" style={{ width: 28, height: 28, borderRadius: T.radius.sm, background: value ? `${rc}15` : 'transparent', border: value ? `1px solid ${rc}30` : `1px solid ${C.border}`, color: rc, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {value || '\u2014'}
    </button>
  );
}
