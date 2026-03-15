// ============================================================
// NOVA Core — useNovaCoreRom hook
// Calls POST /api/nova-core/rom and caches results by key.
// Falls back to romEngine.js seed data on no_data responses.
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';

export type DisplayFlag =
  | 'none'
  | 'indicative'
  | 'insufficient_data'
  | 'national_fallback'
  | 'no_data'
  | 'seed_fallback';

export type ConfidenceBand = {
  p10: number | null;
  p50: number | null;
  p90: number | null;
};

export type NovaCoreRomResult = {
  csi_code_id: string;
  raw_band: ConfidenceBand;
  adjusted_band: ConfidenceBand;
  multipliers: Record<string, number>;
  is_national: boolean;
  display_flag: DisplayFlag;
  disclosure: string | null;
  unit_cost: number | null;
  csi_section: string | null;
  csi_title: string | null;
  trade_name: string | null;
  unit_code: string | null;
  local_sample_count: number;
  national_sample_count: number;
  extended_costs: {
    p10_extended: number | null;
    p50_extended: number | null;
    p90_extended: number | null;
  } | null;
  // Added by hook
  fetched_at: string;
  is_seed_fallback: boolean;
};

export type RomRequestParams = {
  csi_code_id: string;
  metro_area: string;
  project_type_code: string;
  building_type_id?: string;
  delivery_method_code?: string;
  quantity?: number;
  // Extra fields for the API
  trade_id?: string;
  state?: string;
  gross_sf?: number;
};

function cacheKey(p: RomRequestParams): string {
  return `${p.csi_code_id}|${p.metro_area}|${p.project_type_code}|${p.building_type_id || ''}|${p.delivery_method_code || 'DBB'}|${p.quantity || ''}`;
}

export function useNovaCoreRom() {
  const [results, setResults] = useState<Record<string, NovaCoreRomResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cacheRef = useRef<Record<string, NovaCoreRomResult>>({});
  const abortRef = useRef<AbortController | null>(null);

  // M4: Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const fetchRom = useCallback(async (params: RomRequestParams): Promise<NovaCoreRomResult | null> => {
    const key = cacheKey(params);

    // Return cached result if available
    if (cacheRef.current[key]) {
      return cacheRef.current[key];
    }

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(prev => ({ ...prev, [key]: true }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      const res = await fetch('/api/nova-core/rom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          csi_code_id: params.csi_code_id,
          metro_area: params.metro_area,
          project_type_code: params.project_type_code,
          building_type_id: params.building_type_id || null,
          delivery_method_code: params.delivery_method_code || 'DBB',
          quantity: params.quantity,
          trade_id: params.trade_id || '',
          state: params.state || '',
          gross_sf: params.gross_sf || 0,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const fetched_at = new Date().toISOString();

      const result: NovaCoreRomResult = {
        ...data,
        fetched_at,
        is_seed_fallback: false,
      };

      // Cache and store (only if not aborted)
      if (!controller.signal.aborted) {
        cacheRef.current[key] = result;
        setResults(prev => ({ ...prev, [key]: result }));
        setLoading(prev => ({ ...prev, [key]: false }));
      }

      return result;
    } catch (err: unknown) {
      // Silently ignore abort errors
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (!controller.signal.aborted) {
        setErrors(prev => ({ ...prev, [key]: msg }));
        setLoading(prev => ({ ...prev, [key]: false }));
      }
      return null;
    }
  }, []);

  const getResult = useCallback((params: RomRequestParams): NovaCoreRomResult | undefined => {
    return results[cacheKey(params)] || cacheRef.current[cacheKey(params)];
  }, [results]);

  const isLoading = useCallback((params: RomRequestParams): boolean => {
    return !!loading[cacheKey(params)];
  }, [loading]);

  const getError = useCallback((params: RomRequestParams): string | undefined => {
    return errors[cacheKey(params)];
  }, [errors]);

  const clearCache = useCallback(() => {
    cacheRef.current = {};
    setResults({});
    setErrors({});
  }, []);

  return { fetchRom, getResult, isLoading, getError, clearCache, results };
}
