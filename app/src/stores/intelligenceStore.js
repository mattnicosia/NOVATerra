// Intelligence Center Store — market data, portfolio metrics, NOVA brief
import { create } from 'zustand';
import { FRED_API_BASE, FRED_SERIES, FRED_FETCH_CONFIG } from '@/constants/fredSeries';
import { useUiStore } from '@/stores/uiStore';
import { callAnthropic } from '@/utils/ai';

// Simple IndexedDB cache helpers (reuse storage pattern)
const CACHE_KEY = 'bldg-intelligence-fred';

async function getCachedFred() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setCachedFred(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* localStorage full — proceed without cache */ }
}

export const useIntelligenceStore = create((set, get) => ({
  // FRED API data
  fredData: {
    lumber: [],
    steel: [],
    constructionPPI: [],
    constructionSpending: [],
    housingStarts: [],
    buildingPermits: [],
    lastFetched: null,
    loading: false,
    error: null,
  },

  // NOVA market brief
  novaBrief: { text: "", generatedAt: null, loading: false },

  // Active section
  activeSection: "overview",

  setActiveSection: (section) => set({ activeSection: section }),

  // ── Fetch FRED data ──
  fetchFredData: async () => {
    const fredKey = useUiStore.getState().appSettings.fredApiKey;
    if (!fredKey) {
      set(s => ({ fredData: { ...s.fredData, error: 'no_key', loading: false } }));
      return;
    }

    // Check cache
    const cached = await getCachedFred();
    if (cached && cached.lastFetched) {
      const age = Date.now() - cached.lastFetched;
      if (age < FRED_FETCH_CONFIG.cacheTTL) {
        set({ fredData: { ...cached, loading: false, error: null } });
        return;
      }
    }

    set(s => ({ fredData: { ...s.fredData, loading: true, error: null } }));

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - FRED_FETCH_CONFIG.lookbackMonths);
    const startStr = startDate.toISOString().split('T')[0];

    try {
      const results = await Promise.allSettled(
        Object.entries(FRED_SERIES).map(async ([key, series]) => {
          const url = `${FRED_API_BASE}?series_id=${series.id}&api_key=${fredKey}&file_type=json&observation_start=${startStr}`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`FRED ${series.id}: ${resp.status}`);
          const json = await resp.json();
          const observations = (json.observations || [])
            .map(o => ({ date: o.date, value: parseFloat(o.value) }))
            .filter(o => !isNaN(o.value));
          return { key, observations };
        })
      );

      const data = { lastFetched: Date.now() };
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          data[r.value.key] = r.value.observations;
        }
      });

      await setCachedFred(data);
      set({ fredData: { ...data, loading: false, error: null } });
    } catch (err) {
      console.error("[Intelligence] FRED fetch error:", err);
      set(s => ({ fredData: { ...s.fredData, loading: false, error: err.message } }));
    }
  },

  // ── Generate NOVA market brief ──
  generateNovaBrief: async (contextData) => {
    set(s => ({ novaBrief: { ...s.novaBrief, loading: true } }));

    try {
      const prompt = `Current market data:
- Composite construction cost index: ${contextData.currentIndex} (YoY: ${contextData.yoyChange}%)
- Hottest division: ${contextData.hottestDiv} at ${contextData.hottestIndex} (+${contextData.hottestYoy}% YoY)
${contextData.lumberTrend ? `- Lumber PPI trend: ${contextData.lumberTrend}` : ''}
${contextData.steelTrend ? `- Steel PPI trend: ${contextData.steelTrend}` : ''}
${contextData.housingStarts ? `- Housing starts: ${contextData.housingStarts}` : ''}
- User's pipeline: ${contextData.pipelineCount} active bids worth ${contextData.pipelineValue}
- User's win rate: ${contextData.winRate}%

Generate a brief (2-3 sentences) market intelligence summary. Be specific with numbers. Sound authoritative but concise.`;

      const response = await callAnthropic({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
        system: "You are NOVA, the AI construction intelligence engine. Generate a concise market brief for a construction estimator. Focus on actionable insights — what they should watch, how to position their bids. No headers, no bullet points — just 2-3 flowing sentences.",
      });

      set({ novaBrief: { text: response, generatedAt: Date.now(), loading: false } });
    } catch (err) {
      console.error("[Intelligence] NOVA brief error:", err);
      set(s => ({ novaBrief: { ...s.novaBrief, loading: false } }));
    }
  },

  // ── Clear FRED cache ──
  clearCache: async () => {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    set({
      fredData: { lumber: [], steel: [], constructionPPI: [], constructionSpending: [], housingStarts: [], buildingPermits: [], lastFetched: null, loading: false, error: null },
    });
  },
}));
