import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { DROPBOX_MANIFEST } from "@/data/dropboxManifest";

export const useBatchIngestionStore = create((set, get) => ({
  // ── State ──
  manifest: DROPBOX_MANIFEST || [],
  runs: [],
  isRunning: false,
  isPaused: false,
  currentFile: null,
  progress: { classified: 0, parsed: 0, skipped: 0, errors: 0, total: 0 },
  estimatedCost: 0,
  log: [], // { ts, fileId, filename, action, result }

  // ── Load ingestion_runs from Supabase ──
  syncRuns: async () => {
    const { data, error } = await supabase
      .from("ingestion_runs")
      .select("dropbox_file_id, parse_status, filename, proposal_type, company_name, total_bid, line_item_count, classification")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[batchIngestion] Failed to sync runs:", error.message);
      return;
    }

    const runs = data || [];
    const counts = { classified: 0, parsed: 0, skipped: 0, errors: 0, total: runs.length };
    for (const r of runs) {
      if (r.parse_status === "classified") counts.classified++;
      else if (r.parse_status === "parsed") counts.parsed++;
      else if (r.parse_status === "skipped") counts.skipped++;
      else if (r.parse_status === "error") counts.errors++;
    }

    set({ runs, progress: counts });
  },

  // ── Process a single file: classify → parse ──
  processFile: async (file) => {
    const { session } = (await supabase.auth.getSession()).data || {};
    if (!session?.access_token) throw new Error("Not authenticated");

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };

    set({ currentFile: file.name });

    // Step 1: Read PDF from Dropbox via proxy (or direct if accessible)
    // For now, we use the Dropbox file content endpoint
    // The serverless function expects base64 — we need to fetch the PDF content
    // This will be handled by a helper that calls the Dropbox API or uses a proxy

    // Step 1: Classify via Haiku
    const classifyRes = await fetch("/api/batch-parse", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "classify",
        fileId: file.fileId,
        filename: file.name,
        filePath: file.path,
        fileSize: file.size,
        folderType: file.folderType,
        pdfBase64: file._base64, // Must be pre-loaded
      }),
    });

    const classifyData = await classifyRes.json();

    if (!classifyRes.ok) {
      get().addLog(file.fileId, file.name, "classify", "error: " + (classifyData.error || "unknown"));
      set(s => ({ progress: { ...s.progress, errors: s.progress.errors + 1 } }));
      return { status: "error", error: classifyData.error };
    }

    if (classifyData.status === "already_processed") {
      get().addLog(file.fileId, file.name, "classify", "already processed");
      return { status: "skipped" };
    }

    const classification = classifyData.classification;
    set(s => ({ estimatedCost: s.estimatedCost + 0.01 })); // Haiku cost

    if (!classification?.worthFullParse) {
      get().addLog(file.fileId, file.name, "classify", `skipped (${classification?.documentType})`);
      set(s => ({ progress: { ...s.progress, skipped: s.progress.skipped + 1 } }));
      return { status: "skipped", classification };
    }

    set(s => ({ progress: { ...s.progress, classified: s.progress.classified + 1 } }));
    get().addLog(file.fileId, file.name, "classify", `${classification.documentType} — ${classification.companyName || "unknown"}`);

    // Step 2: Full parse via Sonnet
    const parseRes = await fetch("/api/batch-parse", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "parse",
        fileId: file.fileId,
        pdfBase64: file._base64,
        docType: classification.documentType,
        folderType: file.folderType,
      }),
    });

    const parseData = await parseRes.json();
    set(s => ({ estimatedCost: s.estimatedCost + 0.15 })); // Sonnet cost

    if (!parseRes.ok) {
      get().addLog(file.fileId, file.name, "parse", "error: " + (parseData.error || "unknown"));
      set(s => ({ progress: { ...s.progress, errors: s.progress.errors + 1 } }));
      return { status: "error", error: parseData.error };
    }

    const pd = parseData.parsedData;
    get().addLog(file.fileId, file.name, "parse", `$${pd?.totalBid?.toLocaleString() || "?"} — ${pd?.lineItems?.length || 0} items`);
    set(s => ({ progress: { ...s.progress, parsed: s.progress.parsed + 1 } }));

    return { status: "parsed", parsedData: pd, classification };
  },

  // ── Start batch processing ──
  startBatch: async (loadBase64Fn) => {
    const { manifest, runs } = get();
    const processedIds = new Set(
      runs.filter(r => r.parse_status === "parsed" || r.parse_status === "skipped")
        .map(r => r.dropbox_file_id),
    );

    const pending = manifest.filter(f => !processedIds.has(f.fileId));
    set({
      isRunning: true,
      isPaused: false,
      progress: { ...get().progress, total: manifest.length },
    });

    console.log(`[batchIngestion] Starting batch: ${pending.length} pending of ${manifest.length} total`);

    for (const file of pending) {
      if (get().isPaused || !get().isRunning) break;

      try {
        // Load base64 content (caller provides the loader function)
        if (loadBase64Fn) {
          file._base64 = await loadBase64Fn(file);
          if (!file._base64) {
            get().addLog(file.fileId, file.name, "load", "failed to load PDF content");
            set(s => ({ progress: { ...s.progress, errors: s.progress.errors + 1 } }));
            continue;
          }
        }

        await get().processFile(file);
      } catch (err) {
        console.error(`[batchIngestion] Error processing ${file.name}:`, err);
        get().addLog(file.fileId, file.name, "error", err.message);
        set(s => ({ progress: { ...s.progress, errors: s.progress.errors + 1 } }));
      }

      // Small delay between files to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    }

    set({ isRunning: false, currentFile: null });
    console.log("[batchIngestion] Batch complete");
    await get().syncRuns();
  },

  pause: () => set({ isPaused: true }),
  resume: () => set({ isPaused: false }),
  stop: () => set({ isRunning: false, isPaused: false }),

  addLog: (fileId, filename, action, result) =>
    set(s => ({
      log: [{ ts: Date.now(), fileId, filename, action, result }, ...s.log].slice(0, 500),
    })),

  // ── Get status summary ──
  getStatusSummary: () => {
    const { manifest, runs } = get();
    const statusMap = {};
    for (const r of runs) statusMap[r.dropbox_file_id] = r.parse_status;
    const pending = manifest.filter(f => !statusMap[f.fileId]).length;
    return { total: manifest.length, ...get().progress, pending };
  },
}));
