// PdfPreviewPanel — renders all pages of a PDF from base64 string using PDF.js
// Used in CostHistoryEntryForm to show the original PDF alongside extracted data

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { loadPdfJs } from "@/utils/pdf";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function PdfPreviewPanel({ base64 }) {
  const C = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageDataUrls, setPageDataUrls] = useState([]);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    if (!base64) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const renderAllPages = async () => {
      setLoading(true);
      setError(null);
      setPageDataUrls([]);
      setTotalPages(0);

      try {
        await loadPdfJs();
        const raw = atob(base64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

        if (cancelled) return;

        const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        setTotalPages(pdf.numPages);

        // Render pages sequentially to avoid memory spikes
        const urls = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          if (cancelled) return;
          const page = await pdf.getPage(p);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          urls.push(canvas.toDataURL("image/jpeg", 0.85));
          canvas.width = 0;
          canvas.height = 0;
          // Update progressively so user sees pages as they render
          if (!cancelled) setPageDataUrls([...urls]);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderAllPages();
    return () => {
      cancelled = true;
    };
  }, [base64]);

  // No base64 available
  if (!base64) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: C.textDim,
          fontSize: 11,
          textAlign: "center",
          padding: 20,
        }}
      >
        <Ic d={I.plans} size={24} color={C.textMuted} sw={1.5} />
        <div style={{ marginTop: 8, fontWeight: 600, fontSize: 12 }}>PDF Preview Unavailable</div>
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.7 }}>Re-select the file to view the original PDF</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Page count header */}
      {totalPages > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingBottom: 6,
            marginBottom: 6,
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 10, color: C.textDim }}>
            {pageDataUrls.length} / {totalPages} page{totalPages !== 1 ? "s" : ""}
            {loading ? " — rendering..." : ""}
          </span>
        </div>
      )}

      {/* Scrollable pages */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          minHeight: 0,
          background: C.bg,
          borderRadius: 6,
          padding: 4,
        }}
      >
        {loading && pageDataUrls.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              width: "100%",
              color: C.textDim,
              fontSize: 11,
            }}
          >
            Loading PDF...
          </div>
        )}

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              width: "100%",
              color: C.red,
              fontSize: 11,
            }}
          >
            {error}
          </div>
        )}

        {pageDataUrls.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`Page ${i + 1}`}
            style={{
              width: "100%",
              height: "auto",
              borderRadius: 4,
              marginBottom: i < pageDataUrls.length - 1 ? 8 : 0,
              boxShadow: `0 1px 3px ${C.textDim}20`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
