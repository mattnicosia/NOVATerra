import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: 40,
        background: '#0D0F14', color: '#EEE',
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}>
        <div style={{
          maxWidth: 440, width: '100%', textAlign: 'center',
          background: 'linear-gradient(145deg, rgba(18,16,28,0.95) 0%, rgba(10,9,18,0.92) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: 40,
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        }}>
          {/* Error icon */}
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h2 style={{
            fontSize: 18, fontWeight: 700, margin: '0 0 8px',
            color: 'rgba(238,237,245,0.9)',
          }}>Something went wrong</h2>

          <p style={{
            fontSize: 13, color: 'rgba(238,237,245,0.45)',
            margin: '0 0 24px', lineHeight: 1.6,
          }}>
            An unexpected error occurred. Your data is safe — try reloading the page.
          </p>

          {isDev && this.state.error && (
            <div style={{
              textAlign: 'left', marginBottom: 24,
              padding: 12, borderRadius: 8,
              background: 'rgba(248,113,113,0.06)',
              border: '1px solid rgba(248,113,113,0.1)',
              fontSize: 11, color: '#F87171',
              fontFamily: "'DM Sans', sans-serif",
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 120, overflow: 'auto',
            }}>
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', borderRadius: 8,
                background: 'linear-gradient(135deg, #7C5CFC, #6D28D9)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'opacity 0.15s',
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              Reload Page
            </button>
            <button
              onClick={() => { window.location.hash = ''; window.location.pathname = '/'; }}
              style={{
                padding: '10px 24px', borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(238,237,245,0.7)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'background 0.15s',
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
