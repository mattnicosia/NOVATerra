/**
 * Chainable mock of the Supabase client.
 * Drop-in replacement: vi.mock("@/utils/supabase", () => import("@/test/mocks/supabase"))
 */
import { vi } from "vitest";

function createChain(resolvedData = null, resolvedError = null) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    like: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: resolvedData, error: resolvedError })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: resolvedData, error: resolvedError })),
    then: vi.fn((resolve) => resolve({ data: resolvedData ? [resolvedData] : [], error: resolvedError })),
  };
  return chain;
}

let _nextResponse = { data: null, error: null };

export const supabase = {
  from: vi.fn(() => createChain(_nextResponse.data, _nextResponse.error)),
  auth: {
    getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "test-user" } }, error: null })),
    getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "test-token" } }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(() => Promise.resolve({ data: { path: "test-path" }, error: null })),
      download: vi.fn(() => Promise.resolve({ data: new Blob(), error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://test.supabase.co/test" } })),
    })),
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
};

/** Configure what the next .from() chain resolves to */
export function setNextResponse(data, error = null) {
  _nextResponse = { data, error };
}

/** Reset all mocks */
export function resetSupabase() {
  _nextResponse = { data: null, error: null };
}
