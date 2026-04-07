// useKeyboardShortcuts — Centralized keyboard shortcut handler
// Call once in App.jsx to enable all global shortcuts.
import { useEffect } from 'react';
import { useUndoStore } from '@/stores/undoStore';
import { useUiStore } from '@/stores/uiStore';
import { useNovaStore } from '@/stores/novaStore';
import { useDrawingPipelineStore } from '@/stores/drawingPipelineStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      const tag = (e.target.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

      // ── Cmd+K — Command Palette (always, even in inputs) ──
      if (isMod && e.key === 'k') {
        e.preventDefault();
        useUiStore.getState().cmdToggle();
        return;
      }

      // Skip shortcuts when typing in inputs (except Escape)
      if (isInput && e.key !== 'Escape') return;

      // ── Escape — Close overlays ──
      if (e.key === 'Escape') {
        const cmdState = useUiStore.getState();
        if (cmdState.cmdOpen) {
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

      // ── Cmd+Z — Undo (takeoff-aware) ──
      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        // If on Takeoffs page with active/selected takeoff, undo last measurement
        const dps = useDrawingPipelineStore.getState();
        const tkId = dps.tkActiveTakeoffId || dps.tkSelectedTakeoffId;
        if (tkId && window.location.pathname.includes('takeoff')) {
          const to = dps.takeoffs.find(t => t.id === tkId);
          if (to && (to.measurements || []).length > 0) {
            const ms = to.measurements;
            const removed = ms[ms.length - 1];
            dps.setTakeoffs(
              dps.takeoffs.map(t =>
                t.id === tkId ? { ...t, measurements: ms.slice(0, -1) } : t
              )
            );
            useNovaStore.getState().notify(`Undo: removed last ${removed?.type || 'measurement'}`, 'info');
            return;
          }
          // If measuring with active points, pop the last point
          if (dps.tkMeasureState === 'measuring' && (dps.tkActivePoints || []).length > 0) {
            dps.setTkActivePoints(dps.tkActivePoints.slice(0, -1));
            useNovaStore.getState().notify('Undo: removed last point', 'info');
            return;
          }
        }
        // Fall through to estimate-level undo
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
