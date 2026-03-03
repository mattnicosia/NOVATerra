import { useState, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useProjectStore } from '@/stores/projectStore';
import { useBidPackagesStore } from '@/stores/bidPackagesStore';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { getTradeLabel, getTradeSortOrder, autoTradeFromCode, TRADE_GROUPINGS } from '@/constants/tradeGroupings';
import { CSI } from '@/constants/csi';
import { generateScopeSheet } from '@/utils/scopeSheetGenerator';

const STEPS = [
  { key: 'scope', label: 'Select Scope', icon: I.estimate },
  { key: 'drawings', label: 'Select Drawings', icon: I.plans },
  { key: 'subs', label: 'Select Subs', icon: I.user },
  { key: 'details', label: 'Details', icon: I.edit },
  { key: 'review', label: 'Review & Send', icon: I.send },
];

export default function CreateBidPackageModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const [step, setStep] = useState(0);

  // Store data
  const items = useItemsStore(s => s.items);
  const drawings = useDrawingsStore(s => s.drawings);
  const subs = useMasterDataStore(s => s.masterData.subcontractors);
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const addBidPackage = useBidPackagesStore(s => s.addBidPackage);
  const setPackageInvitations = useBidPackagesStore(s => s.setPackageInvitations);
  const user = useAuthStore(s => s.user);
  const showToast = useUiStore(s => s.showToast);

  // Form state
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedDrawings, setSelectedDrawings] = useState(() => drawings.map(d => d.id));
  const [selectedSubs, setSelectedSubs] = useState([]);
  const [packageName, setPackageName] = useState(project.name || '');
  const [dueDate, setDueDate] = useState(project.bidDue || '');
  const [coverMessage, setCoverMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [subSearch, setSubSearch] = useState('');
  const [groupMode, setGroupMode] = useState('trade');
  const [autoSelectedSubs, setAutoSelectedSubs] = useState(false);

  // Derive selected trades/divisions from scope selection for auto-matching subs
  const selectedTrades = useMemo(() => {
    const trades = new Set();
    const selectedSet = new Set(selectedItems);
    for (const item of items) {
      if (!selectedSet.has(item.id)) continue;
      const trade = item.trade || autoTradeFromCode(item.code);
      if (trade) trades.add(trade);
      // Also collect division names for fuzzy matching
      const div = item.division || item.code?.slice(0, 2);
      if (div) {
        const divName = CSI[div]?.name;
        if (divName) trades.add(divName.toLowerCase());
      }
    }
    return trades;
  }, [selectedItems, items]);

  // Group items by the active grouping mode
  const groups = useMemo(() => {
    const map = {};
    for (const item of items) {
      let key, label, sort;
      if (groupMode === 'trade') {
        key = item.trade || autoTradeFromCode(item.code) || '_unassigned';
        label = getTradeLabel(item);
        sort = getTradeSortOrder(item);
      } else if (groupMode === 'subdivision') {
        key = item.code || '00.000';
        const div = key.split('.')[0];
        const subName = CSI[div]?.subs?.[key];
        label = `${key} — ${subName || 'Unknown'}`;
        sort = key;
      } else {
        // division mode (original behavior)
        key = item.division || item.code?.slice(0, 2) || '00';
        label = item.divisionLabel || CSI[key]?.name || `Division ${key}`;
        sort = key;
      }
      if (!map[key]) map[key] = { key, label, sort, items: [] };
      map[key].items.push(item);
    }
    return Object.values(map).sort((a, b) =>
      typeof a.sort === 'number' && typeof b.sort === 'number'
        ? a.sort - b.sort
        : String(a.sort).localeCompare(String(b.sort))
    );
  }, [items, groupMode]);

  // Filter subs by search
  const filteredSubs = useMemo(() => {
    if (!subSearch) return subs;
    const q = subSearch.toLowerCase();
    return subs.filter(s =>
      (s.company || '').toLowerCase().includes(q) ||
      (s.trade || '').toLowerCase().includes(q) ||
      (s.contact || '').toLowerCase().includes(q)
    );
  }, [subs, subSearch]);

  const toggleItem = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleGroup = (groupKey) => {
    const groupItems = groups.find(g => g.key === groupKey)?.items || [];
    const groupIds = groupItems.map(i => i.id);
    const allSelected = groupIds.every(id => selectedItems.includes(id));
    if (allSelected) {
      setSelectedItems(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setSelectedItems(prev => [...new Set([...prev, ...groupIds])]);
    }
  };

  const toggleDrawing = (drawingId) => {
    setSelectedDrawings(prev =>
      prev.includes(drawingId) ? prev.filter(id => id !== drawingId) : [...prev, drawingId]
    );
  };

  const toggleSub = (subId) => {
    setSelectedSubs(prev =>
      prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]
    );
  };

  const handleSend = async () => {
    if (!packageName.trim()) {
      showToast('Please enter a package name', 'error');
      return;
    }
    if (selectedSubs.length === 0) {
      showToast('Please select at least one subcontractor', 'error');
      return;
    }

    setSending(true);
    try {
      const selectedEstItems = items.filter(i => selectedItems.includes(i.id));
      const scopeItems = selectedEstItems
        .map(i => ({ id: i.id, code: i.code, description: i.description, division: i.division }));
      const scopeSheet = generateScopeSheet(selectedEstItems, CSI);

      const subsToInvite = subs
        .filter(s => selectedSubs.includes(s.id))
        .map(s => ({ company: s.company, contact: s.contact, email: s.email, phone: s.phone, trade: s.trade }));

      // Create package in store (local-first)
      const pkgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      addBidPackage({
        id: pkgId,
        estimateId,
        name: packageName,
        scopeItems,
        scopeSheet: scopeSheet.plainText,
        drawingIds: selectedDrawings,
        coverMessage,
        dueDate: dueDate || null,
      });

      // Create local invitations
      const localInvites = subsToInvite.map(sub => ({
        id: Math.random().toString(36).slice(2, 11),
        subCompany: sub.company,
        subContact: sub.contact,
        subEmail: sub.email,
        subPhone: sub.phone,
        subTrade: sub.trade,
        status: 'pending',
      }));
      setPackageInvitations(pkgId, localInvites);

      // Call API to create in Supabase + generate tokens
      const token = useAuthStore.getState().session?.access_token;
      const resp = await fetch('/api/bid-package', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          estimateId,
          name: packageName,
          scopeItems,
          scopeSheet: scopeSheet.html,
          drawingIds: selectedDrawings,
          coverMessage,
          dueDate: dueDate || null,
          subs: subsToInvite,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create bid package');
      }

      const { package: serverPkg, invitations: serverInvites } = await resp.json();

      // Send invite emails — await all, track failures
      const sendResults = await Promise.allSettled(
        serverInvites.map(inv =>
          fetch('/api/send-bid-invite', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              invitationId: inv.id,
              packageId: serverPkg.id,
            }),
          }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        )
      );

      const failed = sendResults.filter(r => r.status === 'rejected').length;
      const sent = sendResults.length - failed;
      if (failed > 0) {
        showToast(`Sent to ${sent} sub${sent !== 1 ? 's' : ''}, ${failed} failed to send`, 'warning');
      } else {
        showToast(`Bid package sent to ${sent} sub${sent !== 1 ? 's' : ''}`, 'success');
      }
      onClose();
    } catch (err) {
      console.error('Create bid package error:', err);
      showToast(err.message || 'Failed to create bid package', 'error');
    } finally {
      setSending(false);
    }
  };

  const canNext = () => {
    if (step === 0) return selectedItems.length > 0;
    if (step === 2) return selectedSubs.length > 0;
    if (step === 3) return packageName.trim().length > 0;
    return true;
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)',
    color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
    fontFamily: "'DM Sans', sans-serif",
  };

  const checkboxStyle = (checked) => ({
    width: 18, height: 18, borderRadius: 4,
    border: `2px solid ${checked ? C.accent : C.border}`,
    background: checked ? C.accent : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0, transition: 'all 150ms',
  });

  return (
    <Modal onClose={onClose} extraWide>
      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            cursor: i < step ? 'pointer' : 'default',
            opacity: i <= step ? 1 : 0.4,
          }} onClick={() => i < step && setStep(i)}>
            <div style={{
              height: 3, width: '100%', borderRadius: 2,
              background: i <= step ? C.accent : C.border,
              transition: 'background 200ms',
            }} />
            <span style={{ fontSize: 10, color: i === step ? C.accent : C.textMuted, fontWeight: 600 }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div style={{ minHeight: 340, maxHeight: 440, overflowY: 'auto' }}>
        {/* Step 1: Select Scope */}
        {step === 0 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Select Scope Items</h3>
            <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 12px' }}>
              Choose scope items to include in this bid package.
            </p>
            {/* Grouping mode segmented control */}
            <div style={{
              display: 'inline-flex', borderRadius: 8, overflow: 'hidden',
              border: `1px solid ${C.border}`, marginBottom: 14,
            }}>
              {[
                { key: 'trade', label: 'Trade Bundles' },
                { key: 'subdivision', label: 'Subdivision' },
                { key: 'division', label: 'Division' },
              ].map((mode, i) => (
                <button
                  key={mode.key}
                  onClick={() => setGroupMode(mode.key)}
                  style={{
                    padding: '5px 14px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                    background: groupMode === mode.key ? C.accent : 'transparent',
                    color: groupMode === mode.key ? '#fff' : C.textMuted,
                    transition: 'all 150ms',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {groups.map(group => {
              const groupIds = group.items.map(i => i.id);
              const allSel = groupIds.every(id => selectedItems.includes(id));
              const someSel = groupIds.some(id => selectedItems.includes(id));
              return (
                <div key={group.key} style={{ marginBottom: 8 }}>
                  <div
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 0', cursor: 'pointer',
                    }}
                  >
                    <div style={checkboxStyle(allSel)}>
                      {allSel && <Ic d={I.check} size={12} color="#fff" />}
                      {!allSel && someSel && <div style={{ width: 8, height: 2, background: C.accent, borderRadius: 1 }} />}
                    </div>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
                      {group.label}
                    </span>
                    <span style={{ color: C.textDim, fontSize: 11 }}>({group.items.length})</span>
                  </div>
                  {(allSel || someSel) && (
                    <div style={{ paddingLeft: 28 }}>
                      {group.items.map(item => (
                        <div
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '4px 0', cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          <div style={checkboxStyle(selectedItems.includes(item.id))}>
                            {selectedItems.includes(item.id) && <Ic d={I.check} size={10} color="#fff" />}
                          </div>
                          <span style={{ color: C.textMuted }}>
                            {item.code} — {item.description || 'Untitled'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {groups.length === 0 && (
              <p style={{ color: C.textDim, fontSize: 13, textAlign: 'center', padding: 40 }}>
                No items in this estimate yet. Add line items first.
              </p>
            )}
          </div>
        )}

        {/* Step 2: Select Drawings */}
        {step === 1 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Select Drawings</h3>
            <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 16px' }}>
              Choose which drawings to share with subcontractors. They'll be able to download these.
            </p>
            {drawings.length === 0 ? (
              <p style={{ color: C.textDim, fontSize: 13, textAlign: 'center', padding: 40 }}>
                No drawings uploaded yet. You can skip this step.
              </p>
            ) : (<>
              <button
                onClick={() => {
                  const allIds = drawings.map(d => d.id);
                  setSelectedDrawings(selectedDrawings.length === allIds.length ? [] : allIds);
                }}
                style={{
                  background: 'none', border: `1px solid ${C.border}`, color: C.accent,
                  borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', marginBottom: 10,
                }}
              >
                {selectedDrawings.length === drawings.length ? 'Deselect All' : 'Select All'}
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {drawings.map(d => {
                  const sel = selectedDrawings.includes(d.id);
                  return (
                    <div
                      key={d.id}
                      onClick={() => toggleDrawing(d.id)}
                      style={{
                        border: `2px solid ${sel ? C.accent : C.border}`,
                        borderRadius: 10, padding: 8, cursor: 'pointer',
                        background: sel ? `${C.accent}10` : 'transparent',
                        transition: 'all 150ms',
                      }}
                    >
                      {d.data && (
                        <img src={d.data} alt="" style={{
                          width: '100%', height: 80, objectFit: 'cover',
                          borderRadius: 6, marginBottom: 6,
                        }} />
                      )}
                      <div style={{ fontSize: 11, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.label || d.name || 'Drawing'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>)}
          </div>
        )}

        {/* Step 3: Select Subs */}
        {step === 2 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Select Subcontractors</h3>
            <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 12px' }}>
              Choose which subs to invite. They'll receive an email with a link to view details and submit a proposal.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                placeholder="Search subs..."
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  const allIds = filteredSubs.map(s => s.id);
                  const allSelected = allIds.every(id => selectedSubs.includes(id));
                  if (allSelected) {
                    setSelectedSubs(prev => prev.filter(id => !allIds.includes(id)));
                  } else {
                    setSelectedSubs(prev => [...new Set([...prev, ...allIds])]);
                  }
                }}
                style={{
                  background: 'none', border: `1px solid ${C.border}`, color: C.accent,
                  borderRadius: 8, padding: '0 12px', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {filteredSubs.every(s => selectedSubs.includes(s.id)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            {filteredSubs.length === 0 ? (
              <p style={{ color: C.textDim, fontSize: 13, textAlign: 'center', padding: 40 }}>
                {subs.length === 0 ? 'No subcontractors in contacts. Add subs in the Contacts page first.' : 'No matches found.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredSubs.map(sub => {
                  const sel = selectedSubs.includes(sub.id);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => toggleSub(sub.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        background: sel ? `${C.accent}10` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${sel ? C.accent + '40' : 'transparent'}`,
                        transition: 'all 150ms',
                      }}
                    >
                      <div style={checkboxStyle(sel)}>
                        {sel && <Ic d={I.check} size={10} color="#fff" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>
                          {sub.company || 'Unknown Company'}
                        </div>
                        <div style={{ color: C.textMuted, fontSize: 11 }}>
                          {[sub.contact, sub.trade, sub.email].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Details */}
        {step === 3 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Package Details</h3>
            <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 16px' }}>
              Set the name, due date, and optional cover message.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Package Name *
              </label>
              <input
                value={packageName}
                onChange={e => setPackageName(e.target.value)}
                placeholder="e.g., MEP Bid Package"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Cover Message (optional)
              </label>
              <textarea
                value={coverMessage}
                onChange={e => setCoverMessage(e.target.value)}
                placeholder="Add any special instructions or notes for the subs..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* Auto-generated scope sheet preview */}
            {selectedItems.length > 0 && (() => {
              const scopeSheet = generateScopeSheet(
                items.filter(i => selectedItems.includes(i.id)),
                CSI,
              );
              return scopeSheet.divisions.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Scope Summary (auto-generated, included in invite)
                  </label>
                  <div style={{
                    maxHeight: 180, overflowY: 'auto',
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${C.border}`,
                    fontSize: 12, color: C.textMuted,
                    whiteSpace: 'pre-wrap', lineHeight: 1.6,
                  }}>
                    {scopeSheet.plainText}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* Step 5: Review */}
        {step === 4 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Review & Send</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ReviewRow label="Package Name" value={packageName} />
              <ReviewRow label="Due Date" value={dueDate ? new Date(dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : 'None'} />
              <ReviewRow label="Scope Items" value={`${selectedItems.length} items selected`} />
              <ReviewRow label="Drawings" value={`${selectedDrawings.length} drawings included`} />
              <ReviewRow label="Subcontractors" value={
                subs.filter(s => selectedSubs.includes(s.id)).map(s => s.company || s.email).join(', ')
              } />
              {coverMessage && <ReviewRow label="Cover Message" value={coverMessage} />}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}`,
      }}>
        <button
          onClick={step === 0 ? onClose : () => setStep(step - 1)}
          style={{
            background: 'none', border: `1px solid ${C.border}`,
            color: C.textMuted, borderRadius: 8, padding: '8px 20px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          {step === 1 && selectedDrawings.length === 0 && (
            <button
              onClick={() => setStep(step + 1)}
              style={{
                background: 'none', border: 'none', color: C.textMuted,
                fontSize: 13, cursor: 'pointer', fontWeight: 500,
              }}
            >
              Skip
            </button>
          )}
          <button
            onClick={step === 4 ? handleSend : () => {
              const next = step + 1;
              // Auto-select subs by trade match when entering step 3
              if (next === 2 && !autoSelectedSubs && selectedTrades.size > 0) {
                const TRADE_LABEL_MAP = {};
                for (const g of TRADE_GROUPINGS) {
                  TRADE_LABEL_MAP[g.key] = g.label.toLowerCase();
                }
                const matched = subs.filter(s => {
                  const subTrade = (s.trade || '').toLowerCase();
                  if (!subTrade) return false;
                  for (const t of selectedTrades) {
                    const tradeLabel = TRADE_LABEL_MAP[t] || t;
                    if (subTrade.includes(tradeLabel) || tradeLabel.includes(subTrade)) return true;
                  }
                  return false;
                });
                if (matched.length > 0) {
                  setSelectedSubs(prev => [...new Set([...prev, ...matched.map(s => s.id)])]);
                }
                setAutoSelectedSubs(true);
              }
              setStep(next);
            }}
            disabled={!canNext() || sending}
            style={{
              background: canNext() ? `linear-gradient(135deg, ${C.accent}, #BF5AF2)` : C.border,
              color: canNext() ? '#fff' : C.textDim,
              border: 'none', borderRadius: 8, padding: '8px 24px',
              fontSize: 13, fontWeight: 600, cursor: canNext() ? 'pointer' : 'not-allowed',
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? 'Sending...' : step === 4 ? 'Send Invitations' : 'Next'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReviewRow({ label, value }) {
  const C = useTheme();
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '8px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
    }}>
      <div style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, minWidth: 120 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 13, flex: 1, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
