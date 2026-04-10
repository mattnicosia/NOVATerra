import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthState = { user: { id: "user-123" } };
const mockOrgState = { org: null };

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => mockAuthState,
  },
}));

vi.mock("@/stores/orgStore", () => ({
  useOrgStore: {
    getState: () => mockOrgState,
  },
}));

describe("estimateLocalDraft", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthState.user = { id: "user-123" };
    mockOrgState.org = null;
    vi.useRealTimers();
  });

  it("persists and reads a scoped pending items draft", async () => {
    const { persistPendingEstimateItemsDraft, readPendingEstimateItemsDraft } = await import("@/utils/estimateLocalDraft");

    persistPendingEstimateItemsDraft("est-1", [{ id: "item-1", division: "07 - Thermal" }]);
    const draft = readPendingEstimateItemsDraft("est-1");

    expect(draft).toMatchObject({
      estimateId: "est-1",
      items: [{ id: "item-1", division: "07 - Thermal" }],
    });
    expect(typeof draft.capturedAtMs).toBe("number");
  });

  it("applies a newer pending draft over stale saved items", async () => {
    const { persistPendingEstimateItemsDraft, applyPendingEstimateItemsDraft } = await import("@/utils/estimateLocalDraft");

    persistPendingEstimateItemsDraft("est-2", [{ id: "item-2", division: "03 - Concrete", material: 125 }]);
    const result = applyPendingEstimateItemsDraft("est-2", {
      _savedAt: "2020-01-01T00:00:00.000Z",
      items: [{ id: "item-2", division: "", material: 0 }],
    });

    expect(result.recovered).toBe(true);
    expect(result.data.items[0]).toMatchObject({
      division: "03 - Concrete",
      material: 125,
    });
  });

  it("clears an old draft only when it is not newer than the saved write", async () => {
    const {
      clearPendingEstimateItemsDraft,
      persistPendingEstimateItemsDraft,
      readPendingEstimateItemsDraft,
    } = await import("@/utils/estimateLocalDraft");

    const first = persistPendingEstimateItemsDraft("est-3", [{ id: "item-3", material: 10 }]);
    clearPendingEstimateItemsDraft("est-3", first.capturedAtMs);
    expect(readPendingEstimateItemsDraft("est-3")).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T08:00:00.000Z"));
    const older = persistPendingEstimateItemsDraft("est-3", [{ id: "item-3", material: 20 }]);
    vi.setSystemTime(new Date("2026-04-10T08:00:01.000Z"));
    const newer = persistPendingEstimateItemsDraft("est-3", [{ id: "item-3", material: 30 }]);
    clearPendingEstimateItemsDraft("est-3", older.capturedAtMs);
    expect(readPendingEstimateItemsDraft("est-3")).toMatchObject({
      capturedAtMs: newer.capturedAtMs,
      items: [{ id: "item-3", material: 30 }],
    });
    vi.useRealTimers();
  });
});
