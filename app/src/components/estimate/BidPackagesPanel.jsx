import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useBidPackagesStore } from '@/stores/bidPackagesStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

const STATUS_COLORS = {
  pending: { bg: '#48484A', text: '#AEAEB2', label: 'Pending' },
  sent: { bg: '#1C3D5A', text: '#64D2FF', label: 'Sent' },
  opened: { bg: '#4A3D1C', text: '#FFD60A', label: 'Opened' },
  downloaded: { bg: '#4A2D1C', text: '#FF9F0A', label: 'Downloaded' },
  submitted: { bg: '#1C3D2A', text: '#30D158', label: 'Submitted' },
  parsed: { bg: '#2D1C4A', text: '#BF5AF2', label: 'Parsed' },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 6,
      fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text,
    }}>
      {s.label}
    </span>
  );
}

function InvitationRow({ inv, onResend }) {
  const C = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      fontSize: 13,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {inv.subCompany || inv.sub_company || 'Unknown'}
        </div>
        <div style={{ color: C.textMuted, fontSize: 11 }}>
          {inv.subEmail || inv.sub_email || ''}
          {inv.subTrade || inv.sub_trade ? ` · ${inv.subTrade || inv.sub_trade}` : ''}
        </div>
      </div>
      <StatusPill status={inv.status} />
      {(inv.status === 'sent' || inv.status === 'pending') && (
        <button
          onClick={() => onResend(inv)}
          style={{
            background: 'none', border: 'none', color: C.accent,
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
            padding: '4px 8px', borderRadius: 6,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,92,252,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          Resend
        </button>
      )}
    </div>
  );
}

export default function BidPackagesPanel({ onCreateNew, onViewProposal }) {
  const C = useTheme();
  const T = C.T;
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const invitations = useBidPackagesStore(s => s.invitations);
  const getPackageStats = useBidPackagesStore(s => s.getPackageStats);
  const [expandedId, setExpandedId] = useState(null);

  const handleResend = async (inv) => {
    // TODO: call send-bid-invite API to resend
    console.log('Resend invite to', inv.subEmail || inv.sub_email);
  };

  if (bidPackages.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(124,92,252,0.15), rgba(191,90,242,0.08))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Ic d={I.send} size={28} color={C.accent} />
        </div>
        <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
          No bid packages yet
        </h3>
        <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
          Create a bid package to send scope, drawings, and invitations to subcontractors.
        </p>
        <button
          onClick={onCreateNew}
          style={{
            background: `linear-gradient(135deg, ${C.accent}, #BF5AF2)`,
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 24px', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Ic d={I.plus} size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Create Bid Package
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {bidPackages.map(pkg => {
        const stats = getPackageStats(pkg.id);
        const isExpanded = expandedId === pkg.id;
        const pkgInvites = invitations[pkg.id] || [];

        return (
          <div key={pkg.id} style={{
            background: C.glassBg || 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.glassBorder || C.border}`,
            borderRadius: T.radius.lg,
            overflow: 'hidden',
          }}>
            {/* Card Header */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : pkg.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', cursor: 'pointer',
                borderBottom: isExpanded ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(124,92,252,0.2), rgba(191,90,242,0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Ic d={I.send} size={16} color={C.accent} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>
                  {pkg.name}
                </div>
                <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                  {pkg.dueDate ? `Due ${new Date(pkg.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'No due date'}
                  {' · '}
                  {stats.total} sub{stats.total !== 1 ? 's' : ''} invited
                </div>
              </div>

              {/* Mini status summary */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {stats.submitted > 0 && (
                  <span style={{
                    background: '#1C3D2A', color: '#30D158',
                    padding: '2px 8px', borderRadius: 6,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    {stats.submitted} received
                  </span>
                )}
              </div>

              <Ic d={I.chevron} size={14} color={C.textMuted}
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
              />
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: '12px 16px' }}>
                {/* Scope summary */}
                {Array.isArray(pkg.scopeItems) && pkg.scopeItems.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Scope
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {pkg.scopeItems.slice(0, 8).map((s, i) => (
                        <span key={i} style={{
                          padding: '2px 8px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.06)',
                          color: C.textMuted, fontSize: 11,
                        }}>
                          {typeof s === 'string' ? s : s.description || s.name || ''}
                        </span>
                      ))}
                      {pkg.scopeItems.length > 8 && (
                        <span style={{ color: C.textDim, fontSize: 11 }}>+{pkg.scopeItems.length - 8} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Invitations list */}
                <div style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Subcontractors ({pkgInvites.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pkgInvites.map(inv => (
                    <InvitationRow
                      key={inv.id}
                      inv={inv}
                      onResend={handleResend}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
