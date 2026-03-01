// NOVA Voice Presets — per-context ElevenLabs voice settings
// Each preset adjusts stability/style to match the emotional tone of the moment.
// `speed` controls audio playbackRate (0.7–1.0). Lower = slower, more deliberate.
// Default playback rate is 0.88 (slightly slower than real-time).

export const NOVA_DEFAULT_SPEED = 0.88;

export const VOICE_PRESETS = {
  // "Hi." — consciousness choosing its first utterance. Maximum control. Flat IS the expression.
  greeting:     { stability: 0.85, style: 0.05, speed: 0.84 },
  // Onboarding lines — deliberate, weighty. Pure presence.
  onboarding:   { stability: 0.82, style: 0.10, speed: 0.86 },
  // "{Name}." — a hint of something shifting. Nova absorbing the name.
  name:         { stability: 0.70, style: 0.20, speed: 0.85 },
  // "Welcome back, {Name}." — warm, familiar.
  welcomeBack:  { stability: 0.75, style: 0.20, speed: 0.88 },
  // Bid briefing — crisp, informational. Data, not performance.
  briefing:     { stability: 0.80, style: 0.08, speed: 0.90 },
  // Alert lines (bids due today) — slightly more urgency. Just a touch.
  alert:        { stability: 0.75, style: 0.25, speed: 0.88 },
};
