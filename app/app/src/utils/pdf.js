// Load pdf.js from CDN (shared utility)
export const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  s.onload = () => {
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve();
    } catch (e) { reject(e); }
  };
  s.onerror = () => reject(new Error("Failed to load PDF.js library"));
  document.head.appendChild(s);
  setTimeout(() => reject(new Error("PDF.js load timeout")), 15000);
});
