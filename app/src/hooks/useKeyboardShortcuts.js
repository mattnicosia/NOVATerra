// useKeyboardShortcuts — Centralized keyboard shortcut handler
// Call once in App.jsx to enable all global shortcuts.
import { useEffect } from 'react';
import { useCommandPaletteStore } from '@/stores/commandPaletteStore';
import { useUndoStore } from '@/stores/undoStore';
import { useUiStore } from '@/stores/uiStore';
import { useNovaStore } from '@/stores/novaStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      const tag = (e.target.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

      // ── Cmd+K — Command Palette (always, even in inputs) ──
      if (isMod && e.key === 'k') {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
        return;
      }

      // Skip shortcuts when typing in inputs (except Escape)
      if (isInput && e.key !== 'Escape') return;

      // ── Escape — Close overlays ──
      if (e.key === 'Escape') {
        const cmdStore = useCommandPaletteStore.getState();
        if (cmdStore.open) {
          // CommandPalette handles its own Escape
          return;
        }
        const uiState = useUiStore.getState();
        if (uiState.aiChatOpen) {
          e.preventDefault();
          uiState.setAiChatOpen(false);
          return;
        }
        return;
      }

      // ── Cmd+Z — Undo ──
      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        const action = useUndoStore.getState().undo();
        if (action) {
          useNovaStore.getState().notify(`Undo: ${action}`, 'info');
        }
        return;
      }

      // ── Cmd+Shift+Z — Redo ──
      if (isMod && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        const action = useUndoStore.getState().redo();
        if (action) {
          useNovaStore.getState().notify(`Redo: ${action}`, 'info');
        }
        return;
      }

      // ── Cmd+/ — Toggle AI Chat ──
      if (isMod && e.key === '/') {
        e.preventDefault();
        const ui = useUiStore.getState();
        ui.setAiChatOpen(!ui.aiChatOpen);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
