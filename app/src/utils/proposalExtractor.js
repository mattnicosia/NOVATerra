// Proposal Extraction Pipeline — client orchestrator
// Sends PDF to /api/extract-proposal (server handles Datalab + AI + ingestion_runs)

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
 * Sends to server endpoint which handles Datalab + AI + DB write.
 */
export async function extractProposal(file) {
  const store = useExtractionStore.getState();
  const id = store.enqueue(file, file.name);
  const update = (u) => useExtractionStore.getState().updateEntry(id, u);

  try {
    // Convert file to base64
    update({ status: "uploading", progress: 10 });
    const pdfBase64 = await fileToBase64(file);

    // Get auth token
    const session = useAuthStore.getState().session;
    if (!session?.access_token) {
      update({ status: "error", error: "Not authenticated" });
      return null;
    }

    // Send to server
    update({ status: "converting", progress: 25 });
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

    const result = await resp.json();

    if (result.status === "skipped") {
      update({
        status: "done",
        progress: 100,
        documentType: "other",
        rawExtraction: result.classification,
      });
      return result;
    }

    if (result.status === "parsed") {
      update({
        status: "done",
        progress: 100,
        documentType: result.classification?.documentType,
        rawExtraction: result.parsedData,
        normalized: result,
      });
      useExtractionStore.getState().setResult(id, result);
      return result;
    }

    update({ status: "error", error: result.error || "Unknown status" });
    return null;
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
