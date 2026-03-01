import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/utils/supabase';
import { loadPdfJs } from '@/utils/pdf';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt } from '@/utils/styles';

export default function AttachmentPreview({ attachment, apiBase, onClose }) {
  const C = useTheme();
  const T = C.T;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageDataUrl, setPageDataUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [imageSrc, setImageSrc] = useState(null);
  const pdfDocRef = useRef(null);

  const isPdf = attachment.contentType === "application/pdf" ||
    attachment.filename?.toLowerCase().endsWith(".pdf");
  const isImage = attachment.contentType?.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif)$/i.test(attachment.filename || "");

  // Fetch attachment data
  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];

    const fetchAndRender = async () => {
      setLoading(true);
      setError(null);
      setPageDataUrl(null);
      setImageSrc(null);
      setCurrentPage(1);
      setTotalPages(0);
      pdfDocRef.current = null;

      try {
        // Get auth token
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};

        const url = `${apiBase}/api/attachment?path=${encodeURIComponent(attachment.storagePath)}`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) throw new Error(`Failed to fetch (${resp.status})`);

        if (cancelled) return;

        if (isPdf) {
          await loadPdfJs();
          const buffer = await resp.arrayBuffer();
          if (cancelled) return;

          const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
          if (cancelled) return;

          pdfDocRef.current = pdf;
          setTotalPages(pdf.numPages);
          await renderPage(pdf, 1);
        } else if (isImage) {
          const blob = await resp.blob();
          if (cancelled) return;
          const objUrl = URL.createObjectURL(blob);
          objectUrls.push(objUrl);
          setImageSrc(objUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const renderPage = async (pdf, pageNum) => {
      const page = await pdf.getPage(pageNum);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) {
        setPageDataUrl(canvas.toDataURL("image/jpeg", 0.85));
        setCurrentPage(pageNum);
      }
      // Clean up canvas
      canvas.width = 0;
      canvas.height = 0;
    };

    if (attachment.storagePath) {
      fetchAndRender();
    } else {
      setLoading(false);
      setError("No file path available for preview");
    }

    return () => {
      cancelled = true;
      objectUrls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [attachment.storagePath, attachment.contentType, apiBase]);

  // Page navigation
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
    } catch (err) {
      setError("Failed to render page");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: T.space[2],
        paddingBottom: T.space[3], borderBottom: `1px solid ${C.border}`,
        marginBottom: T.space[3], flexShrink: 0,
      }}>
        <Ic d={I.plans} size={14} color={C.accent} />
        <span style={{
          flex: 1, fontSize: T.fontSize.sm, fontWeight: T.fontWeight.medium,
          color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {attachment.filename}
        </span>

        {isPdf && totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: T.space[1] }}>
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
            <span style={{ fontSize: T.fontSize.xs, color: C.textDim, minWidth: 50, textAlign: "center" }}>
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

        <button
          style={bt(C, {
            padding: "3px 6px", background: "transparent",
            color: C.textDim, border: `1px solid ${C.border}`,
          })}
          onClick={onClose}
          title="Close preview"
        >
          <Ic d={I.x} size={12} color={C.textDim} />
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflow: "auto", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        minHeight: 0, background: C.bg, borderRadius: T.radius.sm,
        padding: T.space[2],
      }}>
        {loading && !pageDataUrl && !imageSrc && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", width: "100%", color: C.textDim, fontSize: T.fontSize.sm,
          }}>
            Loading preview...
          </div>
        )}

        {error && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", width: "100%", color: C.red, fontSize: T.fontSize.sm,
          }}>
            {error}
          </div>
        )}

        {pageDataUrl && (
          <img
            src={pageDataUrl}
            alt={`${attachment.filename} page ${currentPage}`}
            style={{ maxWidth: "100%", height: "auto", borderRadius: T.radius.sm }}
          />
        )}

        {imageSrc && (
          <img
            src={imageSrc}
            alt={attachment.filename}
            style={{ maxWidth: "100%", height: "auto", borderRadius: T.radius.sm }}
          />
        )}
      </div>
    </div>
  );
}
