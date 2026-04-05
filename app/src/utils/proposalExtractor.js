// Proposal Extraction Pipeline — client orchestrator
// Sends PDF to /api/extract-proposal, reads streaming progress events

import useExtractionStore from "@/stores/extractionStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * Read a File as base64 string (without the data:... prefix).
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1]; // strip data:application/pdf;base64,
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Run the full extraction pipeline for a single file.
 * Reads streaming NDJSON events from the server for real-time progress.
 */
export async function extractProposal(file) {
  const store = useExtractionStore.getState();
  const id = store.enqueue(file, file.name);
  const update = (u) => useExtractionStore.getState().updateEntry(id, u);

  try {
    // Convert file to base64
    update({ status: "uploading", progress: 10, statusMessage: "Reading PDF..." });
    const pdfBase64 = await fileToBase64(file);

    // Get auth token
    const session = useAuthStore.getState().session;
    if (!session?.access_token) {
      update({ status: "error", error: "Not authenticated" });
      return null;
    }

    // Send to server
    update({ status: "sending", progress: 20, statusMessage: "Uploading to server..." });
    const resp = await fetch("/api/extract-proposal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        pdfBase64,
        filename: file.name,
        folderType: "gc", // default, server will reclassify
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      update({ status: "error", error: err.error || "Server error" });
      return null;
    }

    // ── Read streaming NDJSON events ──
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);

          // Update progress and status message from each event
          const progressUpdate = {
            ...(evt.progress != null ? { progress: evt.progress } : {}),
            ...(evt.message ? { statusMessage: evt.message } : {}),
          };

          switch (evt.event) {
            case "started":
              update({ status: "processing", ...progressUpdate });
              break;
            case "ocr_start":
              update({ status: "ocr", ...progressUpdate });
              break;
            case "ocr_complete":
              update({ status: "ocr_done", ...progressUpdate });
              break;
            case "classifying":
              update({ status: "classifying", ...progressUpdate });
              break;
            case "classified":
              update({
                status: "classified",
                documentType: evt.classification?.documentType,
                ...progressUpdate,
              });
              break;
            case "extracting":
              update({ status: "extracting", ...progressUpdate });
              break;
            case "saving":
              update({ status: "saving", ...progressUpdate });
              break;
            case "complete":
              finalResult = evt;
              update({
                status: "done",
                progress: 100,
                statusMessage: evt.message,
                documentType: evt.classification?.documentType,
                rawExtraction: evt.parsedData,
                normalized: evt,
              });
              if (evt.parsedData) {
                useExtractionStore.getState().setResult(id, evt);
              }
              break;
            case "error":
              update({ status: "error", error: evt.error, statusMessage: evt.error });
              return null;
            default:
              // Unknown event — update message if present
              if (evt.message) update(progressUpdate);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    return finalResult;
  } catch (err) {
    console.error("[extractProposal] Error:", err);
    update({ status: "error", error: err.message });
    return null;
  }
}

/**
 * Batch extract multiple files with controlled concurrency.
 */
export async function extractProposalBatch(files, concurrency = 2) {
  const results = [];
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(f => extractProposal(f)));
    results.push(...chunkResults);
  }
  return results.filter(Boolean);
}
