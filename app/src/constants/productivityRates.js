// Default scheduling parameters per trade key.
// Duration (days) = tradeLaborCost / (crewSize × dailyRate)
// parallelGroup: trades in the same group start concurrently (SS) instead of sequentially (FS)

export const TRADE_SCHEDULE_DEFAULTS = {
  general:         { crewSize: 2, dailyRate: 650, parallelGroup: null,       lag: 0 },
  demo:            { crewSize: 4, dailyRate: 550, parallelGroup: null,       lag: 0 },
  sitework:        { crewSize: 4, dailyRate: 600, parallelGroup: null,       lag: 0 },
  concrete:        { crewSize: 6, dailyRate: 600, parallelGroup: null,       lag: 0 },
  masonry:         { crewSize: 4, dailyRate: 650, parallelGroup: null,       lag: 0 },
  steel:           { crewSize: 4, dailyRate: 700, parallelGroup: null,       lag: 0 },
  framing:         { crewSize: 4, dailyRate: 550, parallelGroup: null,       lag: 0 },
  finishCarp:      { crewSize: 3, dailyRate: 600, parallelGroup: null,       lag: 0 },
  insulation:      { crewSize: 3, dailyRate: 500, parallelGroup: null,       lag: 0 },
  roofing:         { crewSize: 4, dailyRate: 600, parallelGroup: "envelope", lag: 0 },
  doors:           { crewSize: 2, dailyRate: 600, parallelGroup: "envelope", lag: 0 },
  windows:         { crewSize: 3, dailyRate: 600, parallelGroup: "envelope", lag: 0 },
  drywall:         { crewSize: 6, dailyRate: 500, parallelGroup: null,       lag: 0 },
  tile:            { crewSize: 3, dailyRate: 600, parallelGroup: null,       lag: 0 },
  act:             { crewSize: 3, dailyRate: 550, parallelGroup: "finishes", lag: 0 },
  flooring:        { crewSize: 3, dailyRate: 550, parallelGroup: "finishes", lag: 0 },
  painting:        { crewSize: 4, dailyRate: 500, parallelGroup: "finishes", lag: 0 },
  specialties:     { crewSize: 2, dailyRate: 550, parallelGroup: null,       lag: 0 },
  elevator:        { crewSize: 2, dailyRate: 800, parallelGroup: null,       lag: 0 },
  fireSuppression: { crewSize: 3, dailyRate: 650, parallelGroup: "mep",     lag: 0 },
  plumbing:        { crewSize: 4, dailyRate: 650, parallelGroup: "mep",     lag: 0 },
  hvac:            { crewSize: 4, dailyRate: 650, parallelGroup: "mep",     lag: 0 },
  electrical:      { crewSize: 4, dailyRate: 650, parallelGroup: "mep",     lag: 0 },
};

// Which trades overlap in the same parallel group
export const PARALLEL_GROUPS = {
  mep:      ["fireSuppression", "plumbing", "hvac", "electrical"],
  envelope: ["roofing", "doors", "windows"],
  finishes: ["act", "flooring", "painting"],
};
