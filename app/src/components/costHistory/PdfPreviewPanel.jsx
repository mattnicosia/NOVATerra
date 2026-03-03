// PdfPreviewPanel — renders a PDF from base64 string using PDF.js
// Used in CostHistoryEntryForm to show the original PDF alongside extracted data

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { loadPdfJs } from '@/utils/pdf';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt } from '@/utils/styles';

export default function PdfPreviewPanel({ base64 }) {
  const C = useTheme();
  const T = C.T;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageDataUrl, setPageDataUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const pdfDocRef = useRef(null);

  useEffect(() => {
    if (!base64) { setLoading(false); return; }

    let cancelled = false;

    const renderPdf = async () => {
      setLoading(true);
      setError(null);
      setPageDataUrl(null);
      setCurrentPage(1);
      setTotalPages(0);
      pdfDocRef.current = null;

      try {
        await loadPdfJs();
        // Decode base64 to Uint8Array
        const raw = atob(base64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

        if (cancelled) return;

        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        await renderPage(pdf, 1, cancelled);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const renderPage = async (pdf, pageNum, wasCancelled) => {
      const page = await pdf.getPage(pageNum);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!wasCancelled) {
        setPageDataUrl(canvas.toDataURL("image/jpeg", 0.85));
        setCurrentPage(pageNum);
      }
      canvas.width = 0;
      canvas.height = 0;
    };

    renderPdf();
    return () => { cancelled = true; };
  }, [base64]);

  const goToPage = async (pageNum) => {
    if (!pdfDocRef.current || pageNum < 1 || pageNum > totalPages) return;
    setLoading(true);
    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      setPageDataUrl(canvas.toDataURL("image/jpeg", 0.85));
      setCurrentPage(pageNum);
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      setError("Failed to render page");
    } finally {
      setLoading(false);
    }
  };

  // No base64 available
  if (!base64) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", color: C.textDim,
        fontSize: 11, textAlign: "center", padding: 20,
      }}>
        <Ic d={I.plans} size={24} color={C.textMuted} sw={1.5} />
        <div style={{ marginTop: 8, fontWeight: 600, fontSize: 12 }}>PDF Preview Unavailable</div>
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.7 }}>
          Re-select the file to view the original PDF
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Page nav toolbar */}
      {totalPages > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 6, paddingBottom: 8, marginBottom: 8,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <button
            style={bt(C, {
              padding: "3px 6px", background: "transparent",
              color: currentPage > 1 ? C.textMuted : C.textDim,
              border: `1px solid ${C.border}`, opacity: currentPage > 1 ? 1 : 0.4,
            })}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <Ic d={I.chevron} size={12} style={{ transform: "rotate(180deg)" }} />
          </button>
          <span style={{ fontSize: 10, color: C.textDim, minWidth: 50, textAlign: "center" }}>
            {currentPage} / {totalPages}
          </span>
          <button
            style={bt(C, {
              padding: "3px 6px", background: "transparent",
              color: currentPage < totalPages ? C.textMuted : C.textDim,
              border: `1px solid ${C.border}`, opacity: currentPage < totalPages ? 1 : 0.4,
            })}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <Ic d={I.chevron} size={12} />
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{
        flex: 1, overflow: "auto", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        minHeight: 0, background: C.bg, borderRadius: 6, padding: 4,
      }}>
        {loading && !pageDataUrl && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", width: "100%", color: C.textDim, fontSize: 11,
          }}>
            Loading PDF...
          </div>
        )}

        {error && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", width: "100%", color: C.red, fontSize: 11,
          }}>
            {error}
          </div>
        )}

        {pageDataUrl && (
          <img
            src={pageDataUrl}
            alt={`Page ${currentPage}`}
            style={{ maxWidth: "100%", height: "auto", borderRadius: 4 }}
          />
        )}
      </div>
    </div>
  );
}
