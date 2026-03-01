// Generate 5 brand palettes from a logo image data URL
// Uses canvas pixel sampling + color theory (complementary, analogous, triadic)

const LIGHT_BASE = {
  bg: "#F5F5F7", bg1: "#FFFFFF", bg2: "#F0F0F2", bg3: "#E5E5EA",
  border: "#D1D1D6", borderLight: "#E5E5EA",
  text: "#1D1D1F", textMuted: "#6E6E73", textDim: "#AEAEB2",
  green: "#30D158", red: "#FF3B30", blue: "#0A84FF", purple: "#BF5AF2",
  orange: "#FF9500", cyan: "#64D2FF",
  sidebarBg: "rgba(245,245,247,0.85)",
  glassBg: "rgba(255,255,255,0.72)", glassBorder: "rgba(0,0,0,0.06)",
};

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function extractDominantColors(imageData, width, height) {
  const pixels = [];
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2], a = imageData[i + 3];
    if (a < 128) continue; // skip transparent
    const lum = (r * 0.299 + g * 0.587 + b * 0.114);
    if (lum < 20 || lum > 235) continue; // skip near-black/near-white
    pixels.push([r, g, b]);
  }
  if (pixels.length === 0) return ['#FF7A3D']; // fallback

  // Simple k-means-ish clustering: bucket by hue ranges
  const buckets = {};
  pixels.forEach(([r, g, b]) => {
    const hex = rgbToHex(r, g, b);
    const [h, s, l] = hexToHsl(hex);
    if (s < 15) return; // skip near-gray
    const key = Math.round(h / 30) * 30; // 12 hue buckets
    if (!buckets[key]) buckets[key] = { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    buckets[key].count++;
    buckets[key].rSum += r;
    buckets[key].gSum += g;
    buckets[key].bSum += b;
  });

  const sorted = Object.values(buckets)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(b => rgbToHex(
      Math.round(b.rSum / b.count),
      Math.round(b.gSum / b.count),
      Math.round(b.bSum / b.count)
    ));

  return sorted.length > 0 ? sorted : ['#FF7A3D'];
}

function makeDarkPalette(id, name, desc, accentHex, altHex) {
  const [h, s, l] = hexToHsl(accentHex);
  const dim = hslToHex(h, Math.max(s - 10, 30), Math.max(l - 12, 25));
  const [ah] = hexToHsl(altHex || accentHex);
  const alt = altHex || hslToHex((ah + 60) % 360, s, l);
  return {
    id, name, desc,
    preview: [accentHex, alt, "#0B0D11", "#12151C", "#E8ECF4"],
    overrides: {
      accent: accentHex, accentDim: dim,
      accentBg: `rgba(${parseInt(accentHex.slice(1,3),16)},${parseInt(accentHex.slice(3,5),16)},${parseInt(accentHex.slice(5,7),16)},0.10)`,
      accentAlt: alt,
      gradient: `linear-gradient(135deg, ${accentHex}, ${alt})`,
      gradientSubtle: `linear-gradient(135deg, ${accentHex}18, ${alt}18)`,
      gradientText: `linear-gradient(135deg, ${accentHex}, ${alt})`,
      borderAccent: `${accentHex}25`,
    },
  };
}

function makeLightPalette(id, name, desc, accentHex, altHex) {
  const [h, s, l] = hexToHsl(accentHex);
  const dim = hslToHex(h, Math.max(s - 10, 30), Math.max(l - 12, 25));
  const alt = altHex || hslToHex((h + 60) % 360, s, l);
  const textColor = hslToHex(h, 30, 12);
  const textMuted = hslToHex(h, 15, 40);
  const textDim = hslToHex(h, 10, 65);
  return {
    id, name, desc,
    preview: [accentHex, alt, "#F5F5F7", "#FFFFFF", textColor],
    overrides: {
      ...LIGHT_BASE,
      text: textColor, textMuted, textDim,
      borderAccent: `${accentHex}25`,
      accent: accentHex, accentDim: dim,
      accentBg: `${accentHex}14`,
      accentAlt: alt,
      gradient: `linear-gradient(135deg, ${accentHex}, ${alt})`,
      gradientSubtle: `linear-gradient(135deg, ${accentHex}14, ${alt}14)`,
      gradientText: `linear-gradient(135deg, ${accentHex}, ${alt})`,
      sidebarBg: "rgba(245,245,247,0.85)",
    },
  };
}

export function generateBrandPalettes(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size).data;
      const colors = extractDominantColors(imageData, size, size);

      const primary = colors[0];
      const secondary = colors[1] || primary;
      const [h, s, l] = hexToHsl(primary);

      // 1. Brand Primary (Dark) — dominant as accent on dark bg
      const p1 = makeDarkPalette(
        `brand-dark-${Date.now()}`, "Brand Dark", "Your brand on dark",
        primary, secondary
      );

      // 2. Brand Primary (Light) — dominant as accent on light bg
      const p2 = makeLightPalette(
        `brand-light-${Date.now()}`, "Brand Light", "Your brand on light",
        primary, secondary
      );

      // 3. Brand Complementary — complementary hue (180°) on dark bg
      const compHex = hslToHex((h + 180) % 360, s, Math.min(l + 5, 65));
      const compAlt = hslToHex((h + 210) % 360, Math.max(s - 15, 30), l);
      const p3 = makeDarkPalette(
        `brand-comp-${Date.now()}`, "Brand Complement", "Complementary palette",
        compHex, compAlt
      );

      // 4. Brand Analogous — hue shifted ±30° on dark bg
      const anaHex = hslToHex((h + 30) % 360, s, l);
      const anaAlt = hslToHex((h - 30 + 360) % 360, s, l);
      const p4 = makeDarkPalette(
        `brand-analog-${Date.now()}`, "Brand Analogous", "Harmonious variation",
        anaHex, anaAlt
      );

      // 5. Brand Triadic — 120° shift on light bg
      const triHex = hslToHex((h + 120) % 360, s, Math.min(l + 5, 60));
      const triAlt = hslToHex((h + 240) % 360, s, Math.min(l + 5, 60));
      const p5 = makeLightPalette(
        `brand-triad-${Date.now()}`, "Brand Triadic", "Triadic harmony",
        triHex, triAlt
      );

      resolve([p1, p2, p3, p4, p5]);
    };
    img.onerror = () => {
      resolve([]); // fail gracefully
    };
    img.src = dataUrl;
  });
}
