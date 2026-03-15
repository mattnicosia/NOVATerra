import { useState, useEffect, useCallback } from 'react';

// Lightweight fetch wrapper for admin API calls
// Auth via nova_admin_token cookie (set by /api/admin/auth)
export function useAdminFetch(endpoint, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { params = {}, skip = false } = options;
  const paramStr = new URLSearchParams(params).toString();
  const url = `/api/admin/${endpoint}${paramStr ? `?${paramStr}` : ''}`;

  const fetchData = useCallback(async () => {
    if (skip) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(`[admin] ${endpoint}:`, err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// One-shot admin fetch (non-hook, for imperative calls)
export async function adminFetch(endpoint, params = {}) {
  const paramStr = new URLSearchParams(params).toString();
  const url = `/api/admin/${endpoint}${paramStr ? `?${paramStr}` : ''}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
