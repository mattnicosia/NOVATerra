import { useEffect, useRef } from 'react';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useAuthStore } from '@/stores/authStore';
import { embedAndStore } from '@/utils/vectorSearch';
import { buildNotesEmbeddingText } from '@/utils/notesExtractor';

/**
 * Background embedding sync — watches Zustand stores for new user-created
 * elements, assemblies, and proposals, and generates pgvector embeddings
 * for them automatically.
 *
 * Uses previous-vs-current diffing to detect additions.
 * All embedding operations are fire-and-forget (never block UI).
 */
export function useEmbeddingSync() {
  const user = useAuthStore(s => s.user);
  const prevElementsRef = useRef(null);
  const prevAssembliesRef = useRef(null);
  const prevProposalsRef = useRef(null);
  const embeddedNotesRef = useRef(new Set()); // Track which drawings have been embedded

  // Watch database elements for additions
  useEffect(() => {
    if (!user) return;

    const unsub = useDatabaseStore.subscribe((state) => {
      const elements = state.elements;
      const prev = prevElementsRef.current;

      if (prev && elements.length > prev.length) {
        // Find newly added elements (not seeds)
        const prevIds = new Set(prev.map(e => e.id));
        const newElements = elements.filter(e => !prevIds.has(e.id) && !e.id.startsWith('s'));

        if (newElements.length > 0) {
          const texts = newElements.map(el =>
            `${el.code || ''} ${el.name || ''} (${el.unit || ''}) — Trade: ${el.trade || 'general'}`
          );
          const metadata = newElements.map(el => ({
            sourceId: el.id,
            code: el.code,
            name: el.name,
            unit: el.unit,
            trade: el.trade,
            material: el.material || 0,
            labor: el.labor || 0,
            equipment: el.equipment || 0,
          }));

          embedAndStore(texts, metadata, 'user_element', user.id).catch(err =>
            console.warn('[embeddingSync] Element embed failed:', err.message)
          );
        }
      }

      prevElementsRef.current = elements;
    });

    // Initialize ref
    prevElementsRef.current = useDatabaseStore.getState().elements;

    return unsub;
  }, [user]);

  // Watch assemblies for additions
  useEffect(() => {
    if (!user) return;

    const unsub = useDatabaseStore.subscribe((state) => {
      const assemblies = state.assemblies;
      const prev = prevAssembliesRef.current;

      if (prev && assemblies.length > prev.length) {
        const prevIds = new Set(prev.map(a => a.id));
        const newAssemblies = assemblies.filter(a => !prevIds.has(a.id) && !a.id.startsWith('a0'));

        if (newAssemblies.length > 0) {
          const texts = newAssemblies.map(asm => {
            const elemList = (asm.elements || []).map(e => e.desc || e.name).join(', ');
            return `${asm.code || ''} ${asm.name || ''} — ${asm.description || ''} — Components: ${elemList}`;
          });
          const metadata = newAssemblies.map(asm => ({
            sourceId: asm.id,
            code: asm.code,
            name: asm.name,
            description: asm.description,
            elementCount: (asm.elements || []).length,
          }));

          embedAndStore(texts, metadata, 'assembly', user.id).catch(err =>
            console.warn('[embeddingSync] Assembly embed failed:', err.message)
          );
        }
      }

      prevAssembliesRef.current = assemblies;
    });

    prevAssembliesRef.current = useDatabaseStore.getState().assemblies;

    return unsub;
  }, [user]);

  // Watch historical proposals for additions
  useEffect(() => {
    if (!user) return;

    const unsub = useMasterDataStore.subscribe((state) => {
      const proposals = state.masterData?.historicalProposals || [];
      const prev = prevProposalsRef.current;

      if (prev && proposals.length > prev.length) {
        const prevIds = new Set(prev.map(p => p.id));
        const newProposals = proposals.filter(p => !prevIds.has(p.id));

        if (newProposals.length > 0) {
          const texts = newProposals.map(p => {
            const divSummary = (p.divisions || [])
              .map(d => `Div ${d.code}: $${d.cost || 0}`)
              .join(', ');
            return `${p.name || ''} — ${p.client || ''} — ${p.jobType || ''} — ${p.projectSF || '?'} SF — $${p.totalCost || 0} total${divSummary ? ` — ${divSummary}` : ''}`;
          });
          const metadata = newProposals.map(p => ({
            sourceId: p.id,
            name: p.name,
            client: p.client,
            jobType: p.jobType,
            projectSF: p.projectSF,
            totalCost: p.totalCost,
          }));

          embedAndStore(texts, metadata, 'proposal', user.id).catch(err =>
            console.warn('[embeddingSync] Proposal embed failed:', err.message)
          );
        }
      }

      prevProposalsRef.current = proposals;
    });

    prevProposalsRef.current = useMasterDataStore.getState().masterData?.historicalProposals || [];

    return unsub;
  }, [user]);

  // Watch drawings for extractedNotes additions
  useEffect(() => {
    if (!user) return;

    const unsub = useDrawingsStore.subscribe((state) => {
      const drawings = state.drawings;
      if (!drawings?.length) return;

      // Find drawings with extractedNotes that haven't been embedded yet
      const toEmbed = drawings.filter(d =>
        d.extractedNotes?.notes?.length > 0 &&
        !embeddedNotesRef.current.has(d.id)
      );

      if (toEmbed.length > 0) {
        toEmbed.forEach(d => {
          embeddedNotesRef.current.add(d.id); // Mark as processing

          const embeddingText = buildNotesEmbeddingText({
            sheetLabel: d.sheetTitle || d.label || d.sheetNumber || 'Unknown',
            notes: d.extractedNotes.notes,
            sheetSummary: d.extractedNotes.sheetSummary || '',
          });

          if (!embeddingText) return;

          const categories = [...new Set(d.extractedNotes.notes.map(n => n.category))];
          const metadata = {
            sourceId: d.id,
            sheetNumber: d.sheetNumber,
            sheetTitle: d.sheetTitle || d.label,
            noteCount: d.extractedNotes.notes.length,
            categories,
          };

          embedAndStore([embeddingText], [metadata], 'drawing_notes', user.id).catch(err => {
            console.warn('[embeddingSync] Drawing notes embed failed:', err.message);
            embeddedNotesRef.current.delete(d.id); // Allow retry
          });
        });
      }
    });

    return unsub;
  }, [user]);
}
