/**
 * cloudSync.test.js — Tests for cloud sync utility
 *
 * Strategy: Mock Supabase client chain and Zustand stores, then test the
 * exported functions' behavior around data-loss prevention, soft-delete,
 * scope handling, error classification, and merge logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock: Supabase client — chainable query builder
// ---------------------------------------------------------------------------

/** Build a chainable mock that records calls and resolves with configurable data */
function createQueryMock(resolvedValue = { data: null, error: null }) {
  const chain = {};
  const methods = ["from", "select", "insert", "upsert", "update", "delete", "eq", "is", "maybeSingle", "single"];
  methods.forEach(m => {
    chain[m] = vi.fn(() => {
      // Terminal methods return a promise-like
      if (m === "maybeSingle" || m === "single") {
        return Promise.resolve(resolvedValue);
      }
      return chain;
    });
  });
  // Allow overriding resolved value per-test
  chain._resolve = val => {
    chain.maybeSingle = vi.fn(() => Promise.resolve(val));
    chain.single = vi.fn(() => Promise.resolve(val));
    // For non-terminal chains that are awaited directly (insert/update)
    chain.then = onFulfill => Promise.resolve(val).then(onFulfill);
  };
  return chain;
}

let mockQuery;
let mockSupabase;
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  clearAll: vi.fn(),
  keys: vi.fn(),
  getUsage: vi.fn(),
};
const mockEstimatesState = { activeEstimateId: null, estimatesIndex: [] };

// Track what supabase.from() was called with
let fromCalls = [];

function buildMockSupabase() {
  mockQuery = createQueryMock();
  fromCalls = [];

  mockSupabase = {
    from: vi.fn(table => {
      fromCalls.push(table);
      return mockQuery;
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ error: null })),
        download: vi.fn(() => Promise.resolve({ data: null, error: null })),
        createSignedUrl: vi.fn(() => Promise.resolve({ data: null })),
        remove: vi.fn(() => Promise.resolve({ error: null })),
      })),
    },
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      onAuthStateChange: vi.fn(callback => {
        const subscription = { unsubscribe: vi.fn() };
        callback("INITIAL_SESSION", { access_token: "token-123" });
        return { data: { subscription } };
      }),
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: { access_token: "token-123" } },
          error: null,
        }),
      ),
    },
  };
  return mockSupabase;
}

vi.mock("@/utils/supabase", () => ({
  supabase: buildMockSupabase(),
}));

// ---------------------------------------------------------------------------
// Mock: Zustand stores
// ---------------------------------------------------------------------------

const mockAuthState = { user: { id: "user-123" } };
const mockUiState = {
  setCloudSyncStatus: vi.fn(),
  setCloudSyncLastAt: vi.fn(),
  setCloudSyncError: vi.fn(),
  setState: vi.fn(),
  showToast: vi.fn(),
  setAppSettings: vi.fn(),
};
const mockOrgState = { org: null }; // solo mode by default

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => mockAuthState,
  },
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: {
    getState: () => mockUiState,
    setState: vi.fn(),
  },
}));

vi.mock("@/stores/orgStore", () => ({
  useOrgStore: {
    getState: () => mockOrgState,
  },
}));

vi.mock("@/stores/estimatesStore", () => ({
  useEstimatesStore: {
    getState: () => mockEstimatesState,
  },
}));

vi.mock("@/utils/storage", () => ({
  storage: mockStorage,
}));

vi.mock("@/utils/idbKey", () => ({
  idbKey: key => key,
}));

// ---------------------------------------------------------------------------
// Now import the module under test (after mocks are registered)
// ---------------------------------------------------------------------------
beforeEach(async () => {
  vi.clearAllMocks();
  fromCalls = [];

  // Reset mock supabase for each test
  const supabaseMod = await import("@/utils/supabase");
  const fresh = buildMockSupabase();
  Object.assign(supabaseMod.supabase, fresh);
  mockSupabase = supabaseMod.supabase;

  // Reset store mocks
  mockAuthState.user = { id: "user-123" };
  mockOrgState.org = null;
  mockUiState.setCloudSyncStatus.mockClear();
  mockUiState.setCloudSyncLastAt.mockClear();
  mockUiState.setCloudSyncError.mockClear();
  mockStorage.get.mockReset();
  mockStorage.set.mockReset();
  mockStorage.delete.mockReset();
  mockStorage.clearAll.mockReset();
  mockStorage.keys.mockReset();
  mockStorage.getUsage.mockReset();
  mockStorage.get.mockResolvedValue(undefined);
  mockStorage.set.mockResolvedValue(true);
  mockStorage.delete.mockResolvedValue(true);
  mockStorage.clearAll.mockResolvedValue(true);
  mockStorage.keys.mockResolvedValue([]);
  mockStorage.getUsage.mockResolvedValue({ usage: 0, quota: 0, pctUsed: 0 });
  mockEstimatesState.activeEstimateId = null;
  mockEstimatesState.estimatesIndex = [];
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cloudSync", () => {
  // ---- isReady guard ----
  describe("isReady guard", () => {
    it("pullData returns null when user is not authenticated", async () => {
      const { pullData } = await import("@/utils/cloudSync");
      mockAuthState.user = null;
      const result = await pullData("settings");
      expect(result).toBeNull();
    });

    it("pullAllEstimates returns empty array when user is not authenticated", async () => {
      const { pullAllEstimates } = await import("@/utils/cloudSync");
      mockAuthState.user = null;
      const result = await pullAllEstimates();
      expect(result).toEqual([]);
    });

    it("deleteEstimate does nothing when user is not authenticated", async () => {
      const { deleteEstimate } = await import("@/utils/cloudSync");
      mockAuthState.user = null;
      await deleteEstimate("est-1");
      // Should not have called supabase.from at all
      expect(fromCalls.length).toBe(0);
    });
  });

  // ---- deleteEstimate (soft-delete) ----
  describe("deleteEstimate — soft-delete", () => {
    it("calls the soft_delete_estimate RPC", async () => {
      const { deleteEstimate } = await import("@/utils/cloudSync");

      await deleteEstimate("est-abc");

      expect(mockSupabase.rpc).toHaveBeenCalledWith("soft_delete_estimate", {
        p_estimate_id: "est-abc",
        p_org_id: null,
      });
    });

    it("calls markError on failure", async () => {
      const { deleteEstimate } = await import("@/utils/cloudSync");

      mockSupabase.rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: "Network error" } }));

      await deleteEstimate("est-fail");

      expect(mockUiState.setCloudSyncStatus).toHaveBeenCalledWith("error");
    });
  });

  // ---- pushData — data loss prevention ----
  describe("pushData — data loss prevention", () => {
    it("refuses to push an empty index array", async () => {
      const { pushData } = await import("@/utils/cloudSync");
      await pushData("index", []);
      // Should NOT have called supabase.from (blocked before network call)
      // The syncing status should not have been set
      expect(mockUiState.setCloudSyncStatus).not.toHaveBeenCalledWith("syncing");
    });

    it("allows pushing non-index keys with empty data", async () => {
      const { pushData } = await import("@/utils/cloudSync");

      mockQuery._resolve({ data: null, error: null });

      await pushData("settings", {});
      // Should proceed — from() should have been called
      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  // ---- pullData ----
  describe("pullData", () => {
    it("returns data from cloud when available", async () => {
      const { pullData } = await import("@/utils/cloudSync");

      // Configure mock to return data
      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: { data: { theme: "dark" } }, error: null }));

      const result = await pullData("settings");
      expect(result).toEqual({ theme: "dark" });
    });

    it("returns null when cloud has no data", async () => {
      const { pullData } = await import("@/utils/cloudSync");

      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

      const result = await pullData("settings");
      expect(result).toBeNull();
    });

    it("returns null on error (does not throw)", async () => {
      const { pullData } = await import("@/utils/cloudSync");

      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: { message: "timeout" } }));

      const result = await pullData("settings");
      expect(result).toBeNull();
    });
  });

  // ---- Scope handling ----
  describe("scope handling", () => {
    it("pullData uses org_id filter when org is set", async () => {
      const { pullData } = await import("@/utils/cloudSync");

      mockOrgState.org = { id: "org-456" };
      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: { data: { foo: 1 } }, error: null }));

      await pullData("master");

      // Should have called eq("org_id", "org-456") somewhere in the chain
      expect(mockQuery.eq).toHaveBeenCalledWith("org_id", "org-456");
    });

    it("pullData uses org_id IS NULL in solo mode", async () => {
      const { pullData } = await import("@/utils/cloudSync");

      mockOrgState.org = null;
      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

      await pullData("master");

      // Should have called .is("org_id", null)
      expect(mockQuery.is).toHaveBeenCalledWith("org_id", null);
    });

    it("settings are always user-scoped, never org-scoped", async () => {
      const { pullData } = await import("@/utils/cloudSync");

      mockOrgState.org = { id: "org-456" };
      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: { data: { theme: "dark" } }, error: null }));

      await pullData("settings");

      // Settings should use .is("org_id", null) even when org is set
      // because scope is forced to null for settings key
      expect(mockQuery.is).toHaveBeenCalledWith("org_id", null);
      // Should NOT have called eq("org_id", ...)
      const orgEqCalls = mockQuery.eq.mock.calls.filter(([key]) => key === "org_id");
      expect(orgEqCalls.length).toBe(0);
    });
  });

  // ---- pullAllEstimates — deleted_at filter ----
  describe("pullAllEstimates — deleted_at filter", () => {
    it("filters out soft-deleted estimates", async () => {
      const { pullAllEstimates } = await import("@/utils/cloudSync");

      // Mock the terminal await to return data
      const mockData = [{ estimate_id: "e1", data: { name: "Project A" }, user_id: "user-123" }];
      // Override the chain's then to resolve with data
      mockQuery.then = onFulfill => Promise.resolve({ data: mockData, error: null }).then(onFulfill);

      // The function awaits the query directly (not .maybeSingle())
      // We need the chain itself to be thenable
      await pullAllEstimates();

      // Should have called .is("deleted_at", null) to filter soft-deletes
      expect(mockQuery.is).toHaveBeenCalledWith("deleted_at", null);
    });
  });

  // ---- pullSoloFallback ----
  describe("pullSoloFallback", () => {
    it("returns null when already in solo mode (no fallback needed)", async () => {
      const { pullSoloFallback } = await import("@/utils/cloudSync");

      mockOrgState.org = null; // solo mode
      const result = await pullSoloFallback("master");
      expect(result).toBeNull();
    });

    it("queries org_id IS NULL when in org mode", async () => {
      const { pullSoloFallback } = await import("@/utils/cloudSync");

      mockOrgState.org = { id: "org-789" };
      mockQuery.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: { data: { contacts: [] }, updated_at: "2026-01-01T00:00:00Z" },
          error: null,
        }),
      );

      const result = await pullSoloFallback("master");
      expect(result).toEqual({
        data: { contacts: [] },
        updated_at: "2026-01-01T00:00:00Z",
      });
      expect(mockQuery.is).toHaveBeenCalledWith("org_id", null);
    });
  });

  // ---- pullAllEstimatesSoloFallback ----
  describe("pullAllEstimatesSoloFallback", () => {
    it("returns empty array when in solo mode", async () => {
      const { pullAllEstimatesSoloFallback } = await import("@/utils/cloudSync");

      mockOrgState.org = null;
      const result = await pullAllEstimatesSoloFallback();
      expect(result).toEqual([]);
    });
  });

  // ---- pushEstimate — zombie resurrection prevention ----
  describe("pushEstimate — zombie resurrection prevention", () => {
    it("does not include deleted_at in the save_estimate payload", async () => {
      const { pushEstimate } = await import("@/utils/cloudSync");

      await pushEstimate("est-1", { project: { name: "Test" } });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "save_estimate",
        expect.objectContaining({
          p_estimate_id: "est-1",
          p_data: expect.not.objectContaining({ deleted_at: expect.anything() }),
        }),
      );
    });

    it("extracts assignedTo from estimate data", async () => {
      const { pushEstimate } = await import("@/utils/cloudSync");

      await pushEstimate("est-2", {
        project: { name: "Test", assignedTo: "user-456" },
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "save_estimate",
        expect.objectContaining({
          p_estimate_id: "est-2",
          p_assigned_to: "user-456",
        }),
      );
    });
  });

  // ---- pullDataWithMeta ----
  describe("pullDataWithMeta", () => {
    it("returns data and updated_at together", async () => {
      const { pullDataWithMeta } = await import("@/utils/cloudSync");

      mockQuery.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: {
            data: { companyProfiles: [] },
            updated_at: "2026-03-15T10:00:00Z",
          },
          error: null,
        }),
      );

      const result = await pullDataWithMeta("master");
      expect(result).toEqual({
        data: { companyProfiles: [] },
        updated_at: "2026-03-15T10:00:00Z",
      });
    });

    it("returns null when no cloud data exists", async () => {
      const { pullDataWithMeta } = await import("@/utils/cloudSync");

      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

      const result = await pullDataWithMeta("master");
      expect(result).toBeNull();
    });
  });

  // ---- hydrateBlobs ----
  describe("hydrateBlobs", () => {
    it("returns data unchanged when no stripped markers exist", async () => {
      const { hydrateBlobs } = await import("@/utils/cloudSync");

      const data = {
        drawings: [{ id: "d1", data: "data:image/png;base64,abc" }],
        documents: [],
      };
      const result = await hydrateBlobs(data);
      // Should be essentially the same (with _hydrationStats appended)
      expect(result.drawings[0].data).toBe("data:image/png;base64,abc");
      expect(result._hydrationStats.hydrated).toBe(0);
      expect(result._hydrationStats.failed).toBe(0);
    });

    it("returns input unchanged when not ready", async () => {
      const { hydrateBlobs } = await import("@/utils/cloudSync");

      mockAuthState.user = null; // not authenticated
      const data = { drawings: [{ id: "d1", _cloudBlobStripped: true, storagePath: "user-123/est/d1" }] };
      const result = await hydrateBlobs(data);
      // Should return same object since isReady() is false
      expect(result).toBe(data);
    });
  });

  // ---- Error handling — markError / markSynced ----
  describe("error and status tracking", () => {
    it("deleteEstimate sets syncing status before network call", async () => {
      const { deleteEstimate } = await import("@/utils/cloudSync");

      mockQuery._resolve({ data: null, error: null });

      await deleteEstimate("est-1");
      expect(mockUiState.setCloudSyncStatus).toHaveBeenCalledWith("syncing");
    });

    it("pullData does not crash on network errors", async () => {
      const { pullData } = await import("@/utils/cloudSync");

      mockQuery.maybeSingle = vi.fn(() => Promise.reject(new Error("network offline")));

      // Should not throw
      const result = await pullData("settings");
      expect(result).toBeNull();
    });
  });

  // ---- pullDataWithOrgId ----
  describe("pullDataWithOrgId", () => {
    it("queries with explicit org_id override", async () => {
      const { pullDataWithOrgId } = await import("@/utils/cloudSync");

      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: { data: { contacts: ["a"] } }, error: null }));

      const result = await pullDataWithOrgId("master", "org-override");
      expect(result).toEqual({ contacts: ["a"] });
      expect(mockQuery.eq).toHaveBeenCalledWith("org_id", "org-override");
    });

    it("queries org_id IS NULL when orgId is falsy", async () => {
      const { pullDataWithOrgId } = await import("@/utils/cloudSync");

      mockQuery.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

      await pullDataWithOrgId("master", null);
      expect(mockQuery.is).toHaveBeenCalledWith("org_id", null);
    });
  });

  // ---- pullAllEstimatesWithOrgId ----
  describe("pullAllEstimatesWithOrgId", () => {
    it("filters deleted_at IS NULL", async () => {
      const { pullAllEstimatesWithOrgId } = await import("@/utils/cloudSync");

      mockQuery.then = onFulfill => Promise.resolve({ data: [], error: null }).then(onFulfill);

      await pullAllEstimatesWithOrgId("org-123");
      expect(mockQuery.is).toHaveBeenCalledWith("deleted_at", null);
    });

    it("returns empty array when not ready", async () => {
      const { pullAllEstimatesWithOrgId } = await import("@/utils/cloudSync");

      mockAuthState.user = null;
      const result = await pullAllEstimatesWithOrgId("org-123");
      expect(result).toEqual([]);
    });
  });

  // ---- pullAllEstimatesAnyScope ----
  describe("pullAllEstimatesAnyScope", () => {
    it("filters deleted_at IS NULL but does NOT filter by org_id", async () => {
      const { pullAllEstimatesAnyScope } = await import("@/utils/cloudSync");

      mockQuery.then = onFulfill => Promise.resolve({ data: [], error: null }).then(onFulfill);

      await pullAllEstimatesAnyScope();

      expect(mockQuery.is).toHaveBeenCalledWith("deleted_at", null);
      expect(mockQuery.eq).toHaveBeenCalledWith("user_id", "user-123");
      // Should NOT filter by org_id
      const orgCalls = mockQuery.eq.mock.calls.filter(([k]) => k === "org_id");
      expect(orgCalls.length).toBe(0);
    });
  });

  describe("pullAndApplyEstimate", () => {
    it("does not overwrite IDB when newer local item edits are still pending", async () => {
      const { persistPendingEstimateItemsDraft } = await import("@/utils/estimateLocalDraft");
      const { pullAndApplyEstimate } = await import("@/utils/cloudSync");

      mockStorage.get.mockResolvedValue({
        value: JSON.stringify({
          _savedAt: "2026-04-10T10:00:00.000Z",
          items: [{ id: "item-1", division: "" }],
        }),
      });

      persistPendingEstimateItemsDraft("est-1", [{ id: "item-1", division: "07 - Thermal", material: 125 }]);
      mockQuery.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: {
            data: {
              _savedAt: "2026-04-10T10:00:05.000Z",
              items: [{ id: "item-1", division: "", material: 0 }],
            },
          },
          error: null,
        }),
      );

      await pullAndApplyEstimate("est-1");

      expect(mockStorage.set).not.toHaveBeenCalled();
    });
  });
});
