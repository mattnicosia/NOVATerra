/**
 * Image processing utilities for company logos.
 */

/**
 * processLogo(file) — compress and resize a logo image.
 *
 * Reads a File, scales to max 400px on the longest side (aspect ratio preserved):
 *   - PNG with transparency → output as PNG
 *   - Otherwise → output as JPEG at 0.9 quality
 *
 * Returns a full data URL string (e.g., "data:image/jpeg;base64,...").
 */
export function processLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const MAX = 400;
        let w = img.width, h = img.height;

        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        // Detect transparency: check if source is PNG and has alpha < 250
        const isPng = file.type === "image/png" || file.name?.toLowerCase().endsWith(".png");
        let hasTransparency = false;

        if (isPng) {
          const imageData = ctx.getImageData(0, 0, w, h);
          const data = imageData.data;
          // Sample every 4th pixel (stride 16 bytes) for performance
          for (let i = 3; i < data.length; i += 16) {
            if (data[i] < 250) { hasTransparency = true; break; }
          }
        }

        if (hasTransparency) {
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
