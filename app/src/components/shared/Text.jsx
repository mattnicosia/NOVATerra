// Text — Semantic typography component
// Applies T.type presets for consistent typography across the app.
// Usage: <Text variant="label">Section Title</Text>
//        <Text variant="caption" dim>Helper text</Text>

import { useTheme } from '@/hooks/useTheme';
import { T } from '@/utils/designTokens';

export default function Text({ variant = 'body', color, dim, muted, as: Tag = 'span', style, children, ...props }) {
  const C = useTheme();
  const base = T.type[variant] || T.type.body;
  const c = color || (dim ? C.textDim : muted ? C.textMuted : C.text);
  return <Tag style={{ ...base, color: c, ...style }} {...props}>{children}</Tag>;
}
