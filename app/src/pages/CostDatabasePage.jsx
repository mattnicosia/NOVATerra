import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useProjectStore } from "@/stores/projectStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useDatabaseUiStore } from "@/stores/databaseUiStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import { CODE_SYSTEMS } from "@/constants/codeSystems";
import { TRADE_GROUPINGS } from "@/constants/tradeGroupings";
import { useMasterDataStore } from "@/stores/masterDataStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";
import { nn, uid, titleCase } from "@/utils/format";
import CodeManager from "@/components/shared/CodeManager";
import AIAssemblyGenerator from "@/components/shared/AIAssemblyGenerator";
import SubProposalModal from "@/components/database/SubProposalModal";
import CsvImportPreviewModal from "@/components/database/CsvImportPreviewModal";

import SubdivisionsTab from "@/components/database/SubdivisionsTab";
import DivisionTree from "@/components/database/DivisionTree";
import ItemsListPanel from "@/components/database/ItemsListPanel";
import AssembliesTab from "@/components/database/AssembliesTab";
import TradeBundlesTab from "@/components/database/TradeBundlesTab";

export default function CostDatabasePage({ embedded = false }) {
  const C = useTheme();
  const T = C.T;
  const codeSystem = useProjectStore(s => s.codeSystem);
  const setCodeSystem = useProjectStore(s => s.setCodeSystem);
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const addSubdivision = useProjectStore(s => s.addSubdivision);
  const activeCodes = getActiveCodes();

  const elements = useDatabaseStore(s => s.elements);
  const setElements = useDatabaseStore(s => s.setElements);
  const dbExpandedDivs = useDatabaseUiStore(s => s.dbExpandedDivs);
  const toggleDbDiv = useDatabaseUiStore(s => s.toggleDbDiv);
  const dbSelectedSub = useDatabaseUiStore(s => s.dbSelectedSub);
  const setDbSelectedSub = useDatabaseUiStore(s => s.setDbSelectedSub);
  const dbSearch = useDatabaseUiStore(s => s.dbSearch);
  const setDbSearch = useDatabaseUiStore(s => s.setDbSearch);
  const removeElement = useDatabaseStore(s => s.removeElement);
  const updateElement = useDatabaseStore(s => s.updateElement);
  const duplicateElement = useDatabaseStore(s => s.duplicateElement);
  const getMasterVersion = useDatabaseStore(s => s.getMasterVersion);
  const revertOverride = useDatabaseStore(s => s.revertOverride);

  const assemblies = useDatabaseStore(s => s.assemblies);
  const dbActiveTab = useDatabaseUiStore(s => s.dbActiveTab);
  const setDbActiveTab = useDatabaseUiStore(s => s.setDbActiveTab);
  const dbAssemblySearch = useDatabaseUiStore(s => s.dbAssemblySearch);
  const setDbAssemblySearch = useDatabaseUiStore(s => s.setDbAssemblySearch);
  const addAssembly = useDatabaseStore(s => s.addAssembly);
  const removeAssembly = useDatabaseStore(s => s.removeAssembly);

  const customBundles = useDatabaseUiStore(s => s.customBundles);
  const setCustomBundles = useDatabaseUiStore(s => s.setCustomBundles);

  const addElement = useItemsStore(s => s.addElement);
  const showToast = useUiStore(s => s.showToast);
  const project = useProjectStore(s => s.project);
  const estimators = useMasterDataStore(s => s.masterData.estimators);

  const [codeManagerOpen, setCodeManagerOpen] = useState(false);
  const [aiAssemblyOpen, setAiAssemblyOpen] = useState(false);
  const [subProposalOpen, setSubProposalOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);

  // Active bundles -- custom overrides or defaults
  const activeBundles = customBundles || TRADE_GROUPINGS;
  const bundleMap = useMemo(() => Object.fromEntries(activeBundles.map(t => [t.key, t])), [activeBundles]);

  // Build the CSI tree with item counts
  const dbTree = useMemo(() => {
    const tree = {};
    Object.entries(activeCodes).forEach(([dc, div]) => {
      tree[dc] = { name: div.name, count: 0, subs: {} };
      if (div.subs) {
        Object.entries(div.subs).forEach(([subKey, subName]) => {
          tree[dc].subs[subKey] = { name: subName, count: 0 };
        });
      }
    });
    elements.forEach(el => {
      if (!el.code) return;
      const dc = el.code.split(".")[0];
      const sk = el.code.split(".").slice(0, 2).join(".");
      if (tree[dc]) {
        tree[dc].count++;
        if (tree[dc].subs[sk]) tree[dc].subs[sk].count++;
      }
    });
    return tree;
  }, [activeCodes, elements]);

  // Filter visible elements
  const dbVisibleElements = useMemo(() => {
    let list = elements;
    if (showOverridesOnly) {
      list = list.filter(el => el.source !== "master");
    }
    if (dbSearch) {
      const q = dbSearch.toLowerCase();
      list = list.filter(el => (el.name || "").toLowerCase().includes(q) || (el.code || "").toLowerCase().includes(q));
    } else if (dbSelectedSub) {
      list = list.filter(el => el.code && el.code.startsWith(dbSelectedSub));
    }
    return list;
  }, [elements, dbSearch, dbSelectedSub, showOverridesOnly]);

  const sortedDbElements = useMemo(
    () => [...dbVisibleElements].sort((a, b) => (a.code || "").localeCompare(b.code || "")),
    [dbVisibleElements],
  );

  // Override summary for badge counts
  const overrideSummary = useMemo(() => {
    const userEls = elements.filter(e => e.source !== "master");
    return {
      overrideCount: userEls.filter(e => e.masterItemId).length,
      customCount: userEls.filter(e => !e.masterItemId).length,
      total: userEls.length,
    };
  }, [elements]);

  const addFromDB = el => {
    const dc = el.code ? el.code.split(".")[0] : "";
    const divName = activeCodes[dc]?.name || "";
    addElement(`${dc} - ${divName}`, {
      code: el.code,
      name: titleCase(el.name),
      unit: el.unit,
      material: el.material,
      labor: el.labor,
      equipment: el.equipment,
      subcontractor: el.subcontractor,
      trade: el.trade,
    });
    showToast(`Added "${titleCase(el.name)}" to estimate`);
  };

  // Trade bundle management helpers
  const initCustomBundles = () => {
    if (!customBundles) setCustomBundles(TRADE_GROUPINGS.map(t => ({ ...t, divisions: [...t.divisions] })));
  };
  const updateBundle = (key, field, value) => {
    initCustomBundles();
    const bundles = (customBundles || TRADE_GROUPINGS).map(b => (b.key === key ? { ...b, [field]: value } : b));
    setCustomBundles(bundles);
  };
  const addBundle = () => {
    initCustomBundles();
    const next = customBundles || TRADE_GROUPINGS.map(t => ({ ...t, divisions: [...t.divisions] }));
    const maxSort = next.reduce((m, b) => Math.max(m, b.sort), 0);
    const newKey = `custom_${uid().slice(0, 6)}`;
    setCustomBundles([...next, { key: newKey, label: "New Trade Bundle", sort: maxSort + 1, divisions: [] }]);
  };
  const removeBundle = key => {
    initCustomBundles();
    const next = (customBundles || TRADE_GROUPINGS).filter(b => b.key !== key);
    setCustomBundles(next);
  };
  const resetBundles = () => {
    if (confirm("Reset all trade bundles to defaults? Custom bundles will be lost.")) {
      setCustomBundles(null);
    }
  };

  // Count and group items per bundle
  const { bundleItemCounts, bundleItems } = useMemo(() => {
    const counts = {};
    const items = {};
    elements.forEach(el => {
      const trade = el.trade || "";
      if (trade) {
        counts[trade] = (counts[trade] || 0) + 1;
        if (!items[trade]) items[trade] = [];
        items[trade].push(el);
      }
    });
    return { bundleItemCounts: counts, bundleItems: items };
  }, [elements]);

  const gridCols = "80px 32px 1.5fr 100px 44px 58px 58px 58px 58px 68px 44px";

  return (
    <div style={{ padding: embedded ? 0 : T.space[7], minHeight: "100%" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          ...(embedded ? { flex: 1, minHeight: 0 } : { height: "calc(100vh - 160px)" }),
        }}
      >
        {/* Batch Import Summary Banner */}
        {embedded && (() => {
          const batchKey = localStorage.getItem("bldg-batch-import-v1");
          const batchParsedKey = localStorage.getItem("proposals-imported-batch-v1");
          if (!batchKey && !batchParsedKey) return null;
          const seedCount = elements.filter(e => e.id?.startsWith("s")).length;
          const userCount = elements.filter(e => !e.id?.startsWith("s")).length;
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                borderRadius: 8,
                background: "rgba(59,130,246,0.05)",
                border: "1px solid rgba(59,130,246,0.12)",
                marginBottom: 8,
                fontSize: 11,
                color: "#3B82F6",
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 4.02 2 6.5S6.48 11 12 11s10-2.02 10-4.5S17.52 2 12 2z M2 6.5v5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5v-5" />
              </svg>
              <span>
                <strong>{seedCount + userCount}</strong> cost items ({seedCount} seed, {userCount} user-created)
                {batchParsedKey && " — batch ingestion data imported"}
              </span>
            </div>
          );
        })()}

        {/* Code System Selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8, padding: "0 2px", alignItems: "stretch" }}>
          {Object.values(CODE_SYSTEMS).map((sys, si) => {
            const active = codeSystem === sys.id;
            return (
              <button
                key={sys.id}
                className={active ? "card-hover" : "ghost-btn"}
                onClick={() => {
                  if (
                    !active &&
                    elements.length > 0 &&
                    !confirm(
                      `Switch to ${sys.name}? Your existing database items will remain but codes may not match the new system.`,
                    )
                  )
                    return;
                  setCodeSystem(sys.id);
                }}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  background: active ? C.accentBg : C.bg,
                  border: `2px solid ${active ? C.accent : C.border}`,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  animation: `staggerFadeUp 400ms cubic-bezier(0.16,1,0.3,1) ${si * 60}ms both`,
                }}
              >
                <span style={{ fontSize: 20 }}>{sys.icon}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? C.accent : C.text }}>{sys.name}</div>
                  <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.3 }}>{sys.desc}</div>
                </div>
                {active && (
                  <div
                    style={{
                      marginLeft: "auto",
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: C.accent,
                      boxShadow: `0 0 8px ${C.accent}60`,
                    }}
                  />
                )}
              </button>
            );
          })}
          <button
            onClick={() => setCodeManagerOpen(true)}
            style={bt(C, {
              background: C.bg,
              border: `2px solid ${C.border}`,
              borderRadius: 8,
              padding: "10px 16px",
              color: C.text,
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
              minWidth: 100,
            })}
          >
            <Ic d={I.settings} size={16} color={C.accent} />
            <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>Manage Codes</span>
          </button>
        </div>

        {/* Tab Switcher: Items | Assemblies | Trade Bundles | Subdivisions */}
        <div style={{ marginBottom: 8, animation: "staggerFadeUp 400ms cubic-bezier(0.16,1,0.3,1) 150ms both" }}>
          <div style={{ background: C.bg2, borderRadius: T.radius.md, padding: 3, display: "inline-flex" }}>
            {[
              { key: "items", label: `Items (${elements.length})`, icon: null },
              { key: "assemblies", label: `Assemblies (${assemblies.length})`, icon: I.assembly },
              { key: "bundles", label: `Trade Bundles (${activeBundles.length})`, icon: I.bundle },
              { key: "subdivisions", label: "Subdivisions", icon: I.layers },
            ].map(tab => {
              const active = dbActiveTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setDbActiveTab(tab.key)}
                  style={bt(C, {
                    padding: "8px 20px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: active ? C.accent : "transparent",
                    color: active ? "#fff" : C.textMuted,
                    border: "none",
                    borderRadius: T.radius.sm,
                    cursor: "pointer",
                    transition: "all 200ms ease-out",
                    boxShadow: active ? `0 2px 8px ${C.accent}30` : "none",
                  })}
                >
                  {tab.icon && <Ic d={tab.icon} size={14} color={active ? "#fff" : C.textMuted} />} {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Items Tab */}
        {dbActiveTab === "items" && (
          <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
            <DivisionTree
              C={C}
              T={T}
              codeSystem={codeSystem}
              activeCodes={activeCodes}
              dbTree={dbTree}
              dbExpandedDivs={dbExpandedDivs}
              toggleDbDiv={toggleDbDiv}
              dbSelectedSub={dbSelectedSub}
              setDbSelectedSub={setDbSelectedSub}
              dbSearch={dbSearch}
              setDbSearch={setDbSearch}
              elements={elements}
              addSubdivision={addSubdivision}
              showToast={showToast}
            />
            <ItemsListPanel
              C={C}
              T={T}
              elements={elements}
              activeCodes={activeCodes}
              activeBundles={activeBundles}
              bundleMap={bundleMap}
              sortedDbElements={sortedDbElements}
              dbVisibleElements={dbVisibleElements}
              dbSearch={dbSearch}
              setDbSearch={setDbSearch}
              dbSelectedSub={dbSelectedSub}
              setDbSelectedSub={setDbSelectedSub}
              showOverridesOnly={showOverridesOnly}
              setShowOverridesOnly={setShowOverridesOnly}
              overrideSummary={overrideSummary}
              updateElement={updateElement}
              removeElement={removeElement}
              duplicateElement={duplicateElement}
              revertOverride={revertOverride}
              getMasterVersion={getMasterVersion}
              addFromDB={addFromDB}
              showToast={showToast}
              project={project}
              estimators={estimators}
              setSubProposalOpen={setSubProposalOpen}
              setCsvImportOpen={setCsvImportOpen}
              gridCols={gridCols}
            />
          </div>
        )}

        {/* Assemblies Tab */}
        {dbActiveTab === "assemblies" && (
          <AssembliesTab
            C={C}
            T={T}
            assemblies={assemblies}
            dbAssemblySearch={dbAssemblySearch}
            setDbAssemblySearch={setDbAssemblySearch}
            addAssembly={addAssembly}
            removeAssembly={removeAssembly}
            setAiAssemblyOpen={setAiAssemblyOpen}
            showToast={showToast}
          />
        )}

        {/* Trade Bundles Tab */}
        {dbActiveTab === "bundles" && (
          <TradeBundlesTab
            C={C}
            T={T}
            activeBundles={activeBundles}
            customBundles={customBundles}
            bundleItemCounts={bundleItemCounts}
            bundleItems={bundleItems}
            updateElement={updateElement}
            addBundle={addBundle}
            removeBundle={removeBundle}
            resetBundles={resetBundles}
            initCustomBundles={initCustomBundles}
            updateBundle={updateBundle}
            showToast={showToast}
          />
        )}
      </div>

      {/* Subdivisions Tab */}
      {dbActiveTab === "subdivisions" && <SubdivisionsTab C={C} T={T} />}

      {/* Modals */}
      {codeManagerOpen && <CodeManager onClose={() => setCodeManagerOpen(false)} />}
      {aiAssemblyOpen && <AIAssemblyGenerator onClose={() => setAiAssemblyOpen(false)} />}
      {subProposalOpen && <SubProposalModal onClose={() => setSubProposalOpen(false)} />}
      {csvImportOpen && <CsvImportPreviewModal onClose={() => setCsvImportOpen(false)} />}
    </div>
  );
}
