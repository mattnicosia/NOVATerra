// ═══════════════════════════════════════════════════════════════════════════
// novaScript.js — SINGLE SOURCE OF TRUTH for all NOVA sequences
// ═══════════════════════════════════════════════════════════════════════════
//
// Edit DIALOGUE, TIMING, VOICE, and ORB STATES here.
// Components import from this file — no hunting through JSX.
//
// Voice keys reference VOICE_PRESETS in ./voicePresets.js:
//   greeting, onboarding, name, welcomeBack, briefing, alert
//
// Orb states: idle, thinking, learning, alert, affirm
// ═══════════════════════════════════════════════════════════════════════════


// ── ROLES (onboarding "What do you do?" buttons) ─────────────────────────
export const ROLES = [
  { key: 'gc',         label: 'General Contractor' },
  { key: 'sub',        label: 'Subcontractor / Trade' },
  { key: 'owner',      label: 'Owner / Developer' },
  { key: 'consultant', label: 'Consultant' },
  { key: 'rep',        label: "Owner's Rep" },
  { key: 'other',      label: 'Other' },
];


// ═══════════════════════════════════════════════════════════════════════════
// 1. ONBOARDING  (first-time sign-in cinematic)
// ═══════════════════════════════════════════════════════════════════════════
export const ONBOARDING = {

  // ── VOID — black screen, tiny dot appears ──
  void: {
    dotAppearMs:   2000,        // dot fades in after this
    advanceMs:     2500,        // move to 'appear' stage
  },

  // ── APPEAR — portal expands from dot ──
  appear: {
    droneFadeInMs:   2000,      // drone fade-in duration
    portalDelayMs:   50,        // delay before portal CSS scale begins
    advanceMs:       3000,      // move to 'first-contact'
  },

  // ── FIRST-CONTACT — "Hi." then "I'm Nova." ──
  firstContact: {
    thinkingFlashMs:    400,    // brief thinking state flash
    line1DelayMs:       500,    // delay before "Hi." appears
    line1:  { text: 'Hi.',           voice: 'greeting' },
    afterLine1Ms:       2000,   // silence after "Hi."
    line2:  { text: "I'm Nova.",     voice: 'onboarding' },
    afterLine2Ms:       1500,   // hold after "I'm Nova."
    textFadeMs:         600,    // text fade-out duration
    silenceMs:          3000,   // portal breathing in darkness
  },

  // ── QUESTION — "Who are you?" + name input ──
  question: {
    textFadeMs:     600,
    silenceMs:      2000,       // portal in darkness before question
    line:  { text: 'Who are you?',  voice: 'onboarding' },
    inputDelayMs:   800,        // delay after line → input appears
    inputFocusMs:   100,        // delay before auto-focus
  },

  // ── RECOGNITION — "Hello, {name}." → "What do you do?" ──
  recognition: {
    textFadeMs:       400,
    thinkingMs:       800,      // thinking state duration
    greetDelayMs:     200,      // after thinking → greeting appears
    greetLine:  { text: (name) => `Hello, ${name}.`, voice: 'name' },
    coreRampMs:       4000,     // core intensity ramp 0.80 → 0.95
    coreRampFrom:     0.80,
    coreRampTo:       0.95,
    roleLine:   { text: 'What do you do?', voice: 'onboarding' },
    roleGlowMs:       600,     // selected button glow duration
    roleFadeMs:       600,     // unselected buttons fade out
    toAbsorbMs:       1000,    // delay before absorb stage
  },

  // ── ABSORB — "Ah." (warm learning glow) ──
  absorb: {
    orbState:       'learning',
    lineDelayMs:    500,        // delay before "Ah." appears
    line:  { text: 'Ah.',        voice: 'name' },
    holdGlowMs:     1500,       // hold warm glow after line
    textFadeMs:     600,
    silenceMs:      1500,       // silence before activation
  },

  // ── ACTIVATION — no text, chord + glow ──
  activation: {
    textFadeMs:         600,
    portalScaleDelay:   800,
    portalScale:        1.08,
    orbState:           'affirm',
    chordDelayMs:       900,
    holdMs:             3000,   // hold at peak brightness
  },

  // ── TRANSITION — fly to corner ──
  transition: {
    textFadeMs:   600,
    droneFadeMs:  1200,
    targetScale:  50 / 345,     // header orb size / hero size
    bgColor:      '#0B0D11',
    completeMs:   1400,
  },

  // ── Misc ──
  roleStaggerMs:     200,      // stagger between role button appearances
  typewriterSpeed:   40,       // ms per character
};


// ═══════════════════════════════════════════════════════════════════════════
// 2. GUIDED TOUR  (6-step workspace walkthrough)
// ═══════════════════════════════════════════════════════════════════════════
export const TOUR = {
  startDelayMs:       500,     // delay before step 0
  illuminateDelayMs:  200,     // delay before target section glows
  stepGapMs:          400,     // gap between steps (text cleared → next)
  exitFadeMs:         1200,    // overlay fade-out at end
  typewriterSpeed:    35,

  steps: [
    {
      text:      "This is your workspace. Allow me to show you around.",
      target:    null,
      orbState:  'idle',
      voice:     'onboarding',
      holdMs:    1500,
    },
    {
      text:      "Your projects live here.",
      target:    '[data-tour="projects"]',
      orbState:  'idle',
      voice:     'onboarding',
      holdMs:    2000,
    },
    {
      text:      "Your estimates are built here.",
      target:    '[data-tour="workspace"]',
      orbState:  'idle',
      voice:     'onboarding',
      holdMs:    2000,
    },
    {
      text:      "I am your estimating intelligence. I review your numbers, catch your gaps, and learn how you think.",
      target:    null,
      orbState:  'learning',
      voice:     'onboarding',
      holdMs:    3000,
    },
    {
      text:      "Every time you work, I'm learning. The more you use this, the more I become yours.",
      target:    null,
      orbState:  'learning',
      voice:     'onboarding',
      holdMs:    3000,
    },
    {
      text:      "I sit here. Anytime you need me — click.",
      target:    null,
      orbState:  'affirm',
      voice:     'onboarding',
      holdMs:    2000,
    },
  ],
};


// ═══════════════════════════════════════════════════════════════════════════
// 3. PROGRESSIVE SETUP  (NOVA chat panel on Settings page)
// ═══════════════════════════════════════════════════════════════════════════
export const SETUP = {
  navigateTo:       '/settings',
  panelOpenMs:      300,       // delay before panel slides in
  startDelayMs:     800,       // delay before first step
  inputDelayMs:     400,       // delay after question → input appears
  processingMs:     800,       // "Updating profile..." spinner
  thinkingMs:       500,       // brief thinking after user submits
  closeMs:          600,       // panel close animation
  typewriterSpeed:  30,

  steps: [
    {
      id:    'intro',
      text:  "Before we start, tell me a bit more about yourself.",
      type:  'message',
      voice: 'onboarding',
      holdMs: 1200,
    },
    {
      id:    'company',
      text:  "What is the name of your company?",
      type:  'input',
      voice: 'onboarding',
      holdMs: 0,
      placeholder: 'Company name...',
    },
    {
      id:    'confirm',
      text:  "Please, continue.",
      type:  'dynamic',
      voice: 'onboarding',
      holdMs: 1500,
    },
  ],
};


// ═══════════════════════════════════════════════════════════════════════════
// 4. RETURNING USER  (sign-in splash for repeat visits)
// ═══════════════════════════════════════════════════════════════════════════
export const RETURNING = {

  // ── VOID — shorter than first-time ──
  void: {
    dotAppearMs:  700,
    advanceMs:    1000,
  },

  // ── APPEAR — faster expansion ──
  appear: {
    droneVolume:    0.8,
    droneFadeMs:    1500,
    portalDelayMs:  50,
    advanceMs:      1500,
  },

  // ── GREETING ──
  greeting: {
    thinkingFlashMs:  300,
    lineDelayMs:      400,     // delay before greeting appears
    greetLine:   { text: (name) => name ? `Welcome back, ${name}.` : 'Welcome back.', voice: 'welcomeBack' },
    afterGreetMs:     1500,    // silence before "I've been waiting."
    waitingLine: { text: "I've been waiting.", voice: 'welcomeBack' },
    afterWaitingMs:   2000,    // hold after "I've been waiting."
    textFadeMs:       600,
  },

  // ── BRIEFING — bids due this week ──
  briefing: {
    thinkingMs:      800,
    lineDelayMs:     200,
    mainLine:   { text: (n) => `You have ${n} bid${n > 1 ? 's' : ''} due this week.`, voice: 'briefing' },
    dayLineDelayMs:  1000,     // delay before day breakdown appears
    dayLineVoice:    'briefing',
    afterDaysMs:     2000,     // hold after last day line → departure
  },

  // ── BRIEFING-NONE — no bids ──
  briefingNone: {
    lineDelayMs:     200,
    noBidsLine:  { text: 'No bids due this week.', voice: 'briefing' },
    afterNoBidsMs:   800,
    clearLine:   { text: "You're clear.", voice: 'briefing' },
    affirmFlashMs:   600,
    afterClearMs:    1000,
  },

  // ── DEPARTURE — swell + chord + fly to corner ──
  departure: {
    textFadeMs:          600,
    portalSwellDelayMs:  200,
    portalSwellScale:    1.05,
    orbState:            'affirm',
    droneVolume:         0.6,
    chordDelayMs:        400,
    droneFadeMs:         1200,
    flyDelayMs:          800,    // delay before fly-to-corner starts
    bgColor:             '#0B0D11',
    completeMs:          2200,
  },

  typewriterSpeed:  35,
};
