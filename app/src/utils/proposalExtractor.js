// Proposal Extraction Pipeline — orchestrates PDF → Datalab → classify → extract → normalize
import useExtractionStore from "@/stores/extractionStore";
import { classifyDocument } from "@/utils/proposalClassifier";
import { getExtractionPrompt } from "@/utils/proposalSchemas";
import { normalizeExtraction } from "@/utils/proposalNormalizer";
import { callAnthropic, INTERPRET_MODEL } from "@/utils/ai";

const DATALAB_API_BASE = "https://www.datalab.to/api/v1";

/**
 * Upload a PDF to Datalab and get markdown back.
 */
async function convertWithDatalab(file, apiKey) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("output_format", "markdown");
  formData.append("paginate_output", "true");
  formData.append("force_ocr", "false");

  const submitResp = await fetch(`${DATALAB_API_BASE}/marker`, {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`Datalab upload failed (${submitResp.status}): ${err}`);
  }

  const submitData = await submitResp.json();
  if (submitData.markdown) return submitData;

  const requestId = submitData.request_id;
  if (!requestId) throw new Error("No request_id returned from Datalab");

  const maxPolls = 120;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollResp = await fetch(`${DATALAB_API_BASE}/marker/${requestId}`, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    if (pollData.status === "complete") return pollData;
    if (pollData.status === "error") throw new Error(`Datalab conversion failed: ${JSON.stringify(pollData)}`);
  }

  throw new Error("Datalab conversion timed out after 10 minutes");
}

/**
 * Run Sonnet extraction using the appropriate prompt for the document type.
 */
async function extractStructuredData(markdown, documentType) {
  const prompt = getExtractionPrompt(documentType);
  if (!prompt) return null;

  const response = await callAnthropic({
    model: INTERPRET_MODEL,
    messages: [
      { role: "user", content: `${prompt}\n\n---\nDOCUMENT:\n${markdown}` },
    ],
    max_tokens: 4096,
    temperature: 0,
  });

  try {
    const text = response?.content?.[0]?.text || response;
    const jsonMatch = typeof text === "string" ? text.match(/\{[\s\S]*\}/) : null;
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[extractor] JSON parse error:", e);
  }

  return null;
}

/**
 * Run the full extraction pipeline for a single file.
 */
export async function extractProposal(file, datalabApiKey) {
  const store = useExtractionStore.getState();
  const id = store.enqueue(file, file.name);
  const update = (u) => useExtractionStore.getState().updateEntry(id, u);

  try {
    update({ status: "converting", progress: 10 });
    const datalabResult = await convertWithDatalab(file, datalabApiKey);
    const markdown = datalabResult.markdown;

    if (!markdown || markdown.trim().length < 50) {
      update({ status: "error", error: "Datalab returned empty or very short content" });
      return null;
    }

    update({ status: "classifying", progress: 30, markdown });
    const classification = await classifyDocument(markdown);
    update({ documentType: classification.type, progress: 45 });

    if (classification.type === "other") {
      update({ status: "done", progress: 100, rawExtraction: { classification } });
      return { type: "other", classification, markdown };
    }

    update({ status: "extracting", progress: 55 });
    const rawExtraction = await extractStructuredData(markdown, classification.type);

    if (!rawExtraction) {
      update({ status: "error", error: "Sonnet extraction returned no parseable JSON" });
      return null;
    }

    update({ status: "normalizing", progress: 80, rawExtraction });
    const normalized = normalizeExtraction(classification.type, rawExtraction, file.name);

    update({ status: "done", progress: 100, normalized });
    useExtractionStore.getState().setResult(id, normalized);

    return normalized;
  } catch (err) {
    console.error("[extractProposal] Pipeline error:", err);
    update({ status: "error", error: err.message });
    return null;
  }
}

/**
 * Batch extract multiple files with controlled concurrency.
 */
export async function extractProposalBatch(files, datalabApiKey, concurrency = 2) {
  const results = [];
  const chunks = [];
  for (let i = 0; i < files.length; i += concurrency) {
    chunks.push(files.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(file => extractProposal(file, datalabApiKey))
    );
    results.push(...chunkResults);
  }

  return results.filter(Boolean);
}
