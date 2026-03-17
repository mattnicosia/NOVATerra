export const PDF_RENDER_DPI = 108;
export const DEFAULT_IMAGE_DPI = 150;

export const ARCH_SCALES = {
  "full":      { label: 'Full Scale (1"=1\')',   factor: 12 },
  "half":      { label: '1/2"=1\'',              factor: 24 },
  "quarter":   { label: '1/4"=1\'',              factor: 48 },
  "eighth":    { label: '1/8"=1\'',              factor: 96 },
  "sixteenth": { label: '1/16"=1\'',             factor: 192 },
  "3/4":       { label: '3/4"=1\'',              factor: 16 },
  "3/8":       { label: '3/8"=1\'',              factor: 32 },
  "3/16":      { label: '3/16"=1\'',             factor: 64 },
  "3/32":      { label: '3/32"=1\'',             factor: 128 },
  "1-1/2":     { label: '1-1/2"=1\'',            factor: 8 },
  "3":         { label: '3"=1\'',                factor: 4 },
};

export const SCALE_PRESETS = [
  { group: "Architectural", items: [
    { key: "eighth",    label: '1/8" = 1\'-0"' },
    { key: "quarter",   label: '1/4" = 1\'-0"' },
    { key: "3/8",       label: '3/8" = 1\'-0"' },
    { key: "half",      label: '1/2" = 1\'-0"' },
    { key: "3/4",       label: '3/4" = 1\'-0"' },
    { key: "full",      label: '1" = 1\'-0"' },
    { key: "1-1/2",     label: '1-1/2" = 1\'-0"' },
    { key: "3",         label: '3" = 1\'-0"' },
    { key: "3/16",      label: '3/16" = 1\'-0"' },
    { key: "3/32",      label: '3/32" = 1\'-0"' },
    { key: "sixteenth", label: '1/16" = 1\'-0"' },
  ]},
  { group: "Engineering", items: [
    { key: "eng10", label: '1" = 10\'' },
    { key: "eng20", label: '1" = 20\'' },
    { key: "eng30", label: '1" = 30\'' },
    { key: "eng40", label: '1" = 40\'' },
    { key: "eng50", label: '1" = 50\'' },
    { key: "eng60", label: '1" = 60\'' },
    { key: "eng100", label: '1" = 100\'' },
  ]},
  { group: "Metric", items: [
    { key: "metric_1:50",  label: "1:50" },
    { key: "metric_1:100", label: "1:100" },
    { key: "metric_1:200", label: "1:200" },
    { key: "metric_1:500", label: "1:500" },
  ]},
];

export function scaleCodeToPxPerUnit(code, dpi) {
  if (!code || !dpi) return null;
  const arch = ARCH_SCALES[code];
  if (arch) return dpi / arch.factor;
  const engMatch = code.match(/^eng(\d+)$/);
  if (engMatch) {
    const feetPerInch = parseInt(engMatch[1]);
    return dpi / (feetPerInch * 12);
  }
  const metricMatch = code.match(/^metric_1:(\d+)$/);
  if (metricMatch) {
    const ratio = parseInt(metricMatch[1]);
    const cmPerInch = 2.54;
    return (dpi * cmPerInch) / ratio;
  }
  return null;
}
