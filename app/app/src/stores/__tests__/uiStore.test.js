import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock laborTypes dependency
vi.mock("@/utils/laborTypes", () => ({
  DEFAULT_LABOR_TYPES: [
    { key: "open_shop", label: "Open Shop", multiplier: 1.0 },
    { key: "union", label: "Union", multiplier: 1.35 },
    { key: "prevailing_wage", label: "Prevailing Wage", multiplier: 1.55 },
  ],
}));

import { useUiStore } from "@/stores/uiStore";

// Snapshot the initial state once so we can reset between tests
const INITIAL_STATE = useUiStore.getState();

beforeEach(() => {
  vi.clearAllTimers();
  useUiStore.setState(INITIAL_STATE, true);
});

// ─── Initial state shape ──────────────────────────────────────────────
describe("uiStore — initial state", () => {
  it("has correct default values", () => {
    const s = useUiStore.getState();
    expect(s.persistenceLoaded).toBe(false);
    expect(s.sidebarOpen).toBe(true);
    expect(s.toast).toBeNull();
    expect(s.showNotesPanel).toBe(false);
    expect(s.aiChatOpen).toBe(false);
    expect(s.aiChatMessages).toEqual([]);
    expect(s.aiChatInput).toBe("");
    expect(s.aiChatLoading).toBe(false);
    expect(s.pendingNovaMessage).toBeNull();
    expect(s.quickAddModal).toBeNull();
    expect(s.quickAddValue).toBe("");
    expect(s.deleteConfirmId).toBeNull();
    expect(s.pricingModal).toBeNull();
    expect(s.linkedSubModal).toBe(false);
    expect(s.newIdeaOpen).toBe(false);
    expect(s.newIdea).toEqual({ title: "", desc: "", priority: "Medium" });
    expect(s.settingsSaved).toBe(false);
    expect(s.estSearch).toBe("");
    expect(s.estDivision).toBe("All");
    expect(s.estGroupBy).toBe("subdivision");
    expect(s.estGroupBy2).toBeNull();
    expect(s.estShowVars).toBeNull();
    expect(s.estShowSpec).toBeNull();
    expect(s.estShowAllowance).toBeNull();
    expect(s.estViewMode).toBe("scope");
    expect(s.activeGroupId).toBe("base");
    expect(s.expandedDivs).toBeInstanceOf(Set);
    expect(s.expandedDivs.size).toBe(0);
    expect(s.cloudSyncStatus).toBe("idle");
    expect(s.cloudSyncLastAt).toBeNull();
    expect(s.cloudSyncLastFullAt).toBeNull();
    expect(s.cloudSyncError).toBeNull();
    expect(s.cloudSyncInProgress).toBe(false);
    expect(s.otherSessions).toEqual([]);
    expect(s.veLoading).toBe(false);
    expect(s.veSuggestions).toEqual([]);
    expect(s.revisionReport).toBeNull();
    expect(s.revisionImpact).toBeNull();
  });

  it("has correct default appSettings", () => {
    const { appSettings } = useUiStore.getState();
    expect(appSettings.activeCompanyId).toBe("");
    expect(appSettings.selectedPalette).toBe("dark");
    expect(appSettings.customPalettes).toEqual([]);
    expect(appSettings.fontSize).toBe(13);
    expect(appSettings.density).toBe("comfortable");
    expect(appSettings.sidebarDefault).toBe("open");
    expect(appSettings.fredApiKey).toBe("");
    expect(appSettings.defaultMarkup.overhead).toBe(10);
    expect(appSettings.defaultMarkup.profit).toBe(10);
    expect(appSettings.defaultMarkup.overheadAndProfit).toBe(20);
    expect(appSettings.defaultMarkup.contingency).toBe(5);
    expect(appSettings.defaultLaborType).toBe("open_shop");
    expect(appSettings.productionHoursPerDay).toBe(7);
    expect(appSettings.bufferHours).toBe(0);
    expect(appSettings.overheadPercent).toBe(15);
    expect(appSettings.behindThreshold).toBe(20);
    expect(appSettings.aheadThreshold).toBe(15);
    expect(appSettings.useAccuracyAdjustment).toBe(false);
    expect(appSettings.complexityMultipliers).toEqual({ light: 0.8, normal: 1.0, heavy: 1.3 });
    expect(appSettings.onboardingDismissed).toBe(false);
    expect(appSettings.showActivityTimer).toBe(false);
    expect(appSettings.workWeek).toBe("mon-fri");
    expect(appSettings.defaultMarkupOrder).toHaveLength(7);
  });
});

// ─── Simple setters ───────────────────────────────────────────────────
describe("uiStore — simple setters", () => {
  it("setPersistenceLoaded", () => {
    useUiStore.getState().setPersistenceLoaded(true);
    expect(useUiStore.getState().persistenceLoaded).toBe(true);
  });

  it("setSidebarOpen", () => {
    useUiStore.getState().setSidebarOpen(false);
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it("setShowNotesPanel", () => {
    useUiStore.getState().setShowNotesPanel(true);
    expect(useUiStore.getState().showNotesPanel).toBe(true);
  });

  it("setAiChatOpen / setAiChatInput / setAiChatLoading / setAiChatMessages / setPendingNovaMessage", () => {
    const { setAiChatOpen, setAiChatInput, setAiChatLoading, setAiChatMessages, setPendingNovaMessage } =
      useUiStore.getState();
    setAiChatOpen(true);
    expect(useUiStore.getState().aiChatOpen).toBe(true);
    setAiChatInput("hello");
    expect(useUiStore.getState().aiChatInput).toBe("hello");
    setAiChatLoading(true);
    expect(useUiStore.getState().aiChatLoading).toBe(true);
    setAiChatMessages([{ role: "user", text: "hi" }]);
    expect(useUiStore.getState().aiChatMessages).toEqual([{ role: "user", text: "hi" }]);
    setPendingNovaMessage("pending");
    expect(useUiStore.getState().pendingNovaMessage).toBe("pending");
  });

  it("setQuickAddModal / setQuickAddValue / setDeleteConfirmId / setPricingModal / setLinkedSubModal", () => {
    useUiStore.getState().setQuickAddModal({ type: "lineItem" });
    expect(useUiStore.getState().quickAddModal).toEqual({ type: "lineItem" });
    useUiStore.getState().setQuickAddValue("test");
    expect(useUiStore.getState().quickAddValue).toBe("test");
    useUiStore.getState().setDeleteConfirmId("id-123");
    expect(useUiStore.getState().deleteConfirmId).toBe("id-123");
    useUiStore.getState().setPricingModal({ itemId: "x" });
    expect(useUiStore.getState().pricingModal).toEqual({ itemId: "x" });
    useUiStore.getState().setLinkedSubModal(true);
    expect(useUiStore.getState().linkedSubModal).toBe(true);
  });

  it("setNewIdeaOpen / setNewIdea / setSettingsSaved", () => {
    useUiStore.getState().setNewIdeaOpen(true);
    expect(useUiStore.getState().newIdeaOpen).toBe(true);
    useUiStore.getState().setNewIdea({ title: "A", desc: "B", priority: "High" });
    expect(useUiStore.getState().newIdea).toEqual({ title: "A", desc: "B", priority: "High" });
    useUiStore.getState().setSettingsSaved(true);
    expect(useUiStore.getState().settingsSaved).toBe(true);
  });

  it("estimate view setters", () => {
    useUiStore.getState().setEstSearch("drywall");
    expect(useUiStore.getState().estSearch).toBe("drywall");
    useUiStore.getState().setEstDivision("09");
    expect(useUiStore.getState().estDivision).toBe("09");
    useUiStore.getState().setEstGroupBy("trade");
    expect(useUiStore.getState().estGroupBy).toBe("trade");
    useUiStore.getState().setEstGroupBy2("level");
    expect(useUiStore.getState().estGroupBy2).toBe("level");
    useUiStore.getState().setEstShowVars("vars-1");
    expect(useUiStore.getState().estShowVars).toBe("vars-1");
    useUiStore.getState().setEstShowSpec("spec-1");
    expect(useUiStore.getState().estShowSpec).toBe("spec-1");
    useUiStore.getState().setEstShowAllowance("allow-1");
    expect(useUiStore.getState().estShowAllowance).toBe("allow-1");
    useUiStore.getState().setEstViewMode("detail");
    expect(useUiStore.getState().estViewMode).toBe("detail");
    useUiStore.getState().setActiveGroupId("alt-1");
    expect(useUiStore.getState().activeGroupId).toBe("alt-1");
  });

  it("cloud sync setters", () => {
    useUiStore.getState().setCloudSyncLastAt("2:45 PM");
    expect(useUiStore.getState().cloudSyncLastAt).toBe("2:45 PM");
    useUiStore.getState().setCloudSyncError("timeout");
    expect(useUiStore.getState().cloudSyncError).toBe("timeout");
    useUiStore.getState().setOtherSessions([{ device: "Mac", browser: "Chrome", lastSeen: "now" }]);
    expect(useUiStore.getState().otherSessions).toHaveLength(1);
  });

  it("VE setters", () => {
    useUiStore.getState().setVeLoading(true);
    expect(useUiStore.getState().veLoading).toBe(true);
    useUiStore.getState().setVeSuggestions([{ id: 1 }]);
    expect(useUiStore.getState().veSuggestions).toEqual([{ id: 1 }]);
  });

  it("revision setters and dismiss", () => {
    useUiStore.getState().setRevisionReport([{ sheetNumber: "A1.1" }]);
    useUiStore.getState().setRevisionImpact({ sheets: 1, summary: "ok" });
    expect(useUiStore.getState().revisionReport).toHaveLength(1);
    expect(useUiStore.getState().revisionImpact).toEqual({ sheets: 1, summary: "ok" });

    useUiStore.getState().dismissRevisionImpact();
    expect(useUiStore.getState().revisionReport).toBeNull();
    expect(useUiStore.getState().revisionImpact).toBeNull();
  });
});

// ─── Toggle actions ───────────────────────────────────────────────────
describe("uiStore — toggles", () => {
  it("toggleSidebar flips sidebarOpen", () => {
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it("toggleExpandedDiv adds and removes divs", () => {
    useUiStore.getState().toggleExpandedDiv("div-03");
    expect(useUiStore.getState().expandedDivs.has("div-03")).toBe(true);

    useUiStore.getState().toggleExpandedDiv("div-09");
    expect(useUiStore.getState().expandedDivs.has("div-03")).toBe(true);
    expect(useUiStore.getState().expandedDivs.has("div-09")).toBe(true);

    // Toggle off
    useUiStore.getState().toggleExpandedDiv("div-03");
    expect(useUiStore.getState().expandedDivs.has("div-03")).toBe(false);
    expect(useUiStore.getState().expandedDivs.has("div-09")).toBe(true);
  });

  it("setExpandedDivs replaces the whole Set", () => {
    useUiStore.getState().setExpandedDivs(new Set(["a", "b"]));
    expect(useUiStore.getState().expandedDivs).toEqual(new Set(["a", "b"]));
  });
});

// ─── Toast ────────────────────────────────────────────────────────────
describe("uiStore — showToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets toast with msg and type, defaults to success", () => {
    useUiStore.getState().showToast("Saved!");
    expect(useUiStore.getState().toast).toEqual({ msg: "Saved!", type: "success" });
  });

  it("accepts a custom type", () => {
    useUiStore.getState().showToast("Error occurred", "error");
    expect(useUiStore.getState().toast).toEqual({ msg: "Error occurred", type: "error" });
  });

  it("clears toast after 3100ms", () => {
    useUiStore.getState().showToast("temp");
    expect(useUiStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(useUiStore.getState().toast).not.toBeNull(); // still visible
    vi.advanceTimersByTime(200);
    expect(useUiStore.getState().toast).toBeNull(); // gone after 3100ms
  });
});

// ─── Cloud sync status ────────────────────────────────────────────────
describe("uiStore — setCloudSyncStatus", () => {
  it("sets status and clears error on non-error status", () => {
    // First set an error
    useUiStore.setState({ cloudSyncError: "some error" });
    useUiStore.getState().setCloudSyncStatus("syncing");
    expect(useUiStore.getState().cloudSyncStatus).toBe("syncing");
    expect(useUiStore.getState().cloudSyncError).toBeNull();
  });

  it("preserves error when status is error", () => {
    useUiStore.setState({ cloudSyncError: "timeout" });
    useUiStore.getState().setCloudSyncStatus("error");
    expect(useUiStore.getState().cloudSyncStatus).toBe("error");
    expect(useUiStore.getState().cloudSyncError).toBe("timeout");
  });
});

// ─── updateSetting (dot-path updater) ─────────────────────────────────
describe("uiStore — updateSetting", () => {
  it("updates a top-level setting", () => {
    useUiStore.getState().updateSetting("fontSize", 16);
    expect(useUiStore.getState().appSettings.fontSize).toBe(16);
  });

  it("updates a nested setting via dot path", () => {
    useUiStore.getState().updateSetting("defaultMarkup.overhead", 15);
    expect(useUiStore.getState().appSettings.defaultMarkup.overhead).toBe(15);
    // Other markup values should be untouched
    expect(useUiStore.getState().appSettings.defaultMarkup.profit).toBe(10);
  });

  it("updates a deeply nested setting (complexityMultipliers)", () => {
    useUiStore.getState().updateSetting("complexityMultipliers.heavy", 1.5);
    expect(useUiStore.getState().appSettings.complexityMultipliers.heavy).toBe(1.5);
    expect(useUiStore.getState().appSettings.complexityMultipliers.light).toBe(0.8);
  });

  it("does not mutate the original appSettings object", () => {
    const before = useUiStore.getState().appSettings;
    useUiStore.getState().updateSetting("fontSize", 18);
    const after = useUiStore.getState().appSettings;
    expect(before).not.toBe(after); // new reference
  });
});

// ─── setAppSettings (full replace) ────────────────────────────────────
describe("uiStore — setAppSettings", () => {
  it("replaces the entire appSettings object", () => {
    const custom = { ...useUiStore.getState().appSettings, fontSize: 20, density: "compact" };
    useUiStore.getState().setAppSettings(custom);
    expect(useUiStore.getState().appSettings.fontSize).toBe(20);
    expect(useUiStore.getState().appSettings.density).toBe("compact");
  });
});
