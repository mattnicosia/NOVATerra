import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';

// Lightweight fetch wrapper for admin API calls
// Attaches the user's JWT for server-side verifyAdmin() check
export function useAdminFetch(endpoint, options = {}) {
  const session = useAuthStore(s => s.session);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { params = {}, skip = false } = options;
  const paramStr = new URLSearchParams(params).toString();
  const url = `/api/admin/${endpoint}${paramStr ? `?${paramStr}` : ''}`;

  const fetchData = useCallback(async () => {
    if (skip || !session?.access_token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
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
  }, [url, session?.access_token, skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// One-shot admin fetch (non-hook, for imperative calls)
export async function adminFetch(endpoint, params = {}) {
  const session = useAuthStore.getState().session;
  if (!session?.access_token) throw new Error("Not authenticated");
  const paramStr = new URLSearchParams(params).toString();
  const url = `/api/admin/${endpoint}${paramStr ? `?${paramStr}` : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
