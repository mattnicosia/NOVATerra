import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { CARBON_TRADE_DEFAULTS } from "@/constants/embodiedCarbonDb";
import { fmt, nn } from "@/utils/format";
import { formatCarbon } from "@/utils/carbonEngine";
import KPI from "@/components/shared/KPI";
import { I } from "@/constants/icons";

const CO2E_TRADE = {
  "03": "concrete",
  "04": "masonry",
  "05": "metals",
  "06": "carpentry",
  "07": "insulation",
  "08": "doors",
  "09": "finishes",
  10: "specialties",
  15: "hvac",
  16: "electrical",
  21: "fireSuppression",
  22: "plumbing",
  23: "hvac",
  26: "electrical",
  31: "sitework",
  32: "sitework",
  33: "sitework",
};

function getItemCO2e(item) {
  const div = (item.code || "").substring(0, 2);
  const trade = CO2E_TRADE[div] || "general";
  const factor = CARBON_TRADE_DEFAULTS[trade] || 0.04;
  const matCost = nn(item.material) * nn(item.quantity);
  return matCost * factor;
}

export default function EstimateKPIStrip() {
  const C = useTheme();
  const T = C.T;
  const allItems = useItemsStore(s => s.items);
  const getTotals = useItemsStore(s => s.getTotals);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const projectSF = useProjectStore(s => s.project.projectSF);
  const activeGroupId = useUiStore(s => s.activeGroupId);

  const items = useMemo(
    () => allItems.filter(i => (i.bidContext || "base") === activeGroupId),
    [allItems, activeGroupId],
  );

  getTotals(); // trigger subscription

  // Compute group-filtered grand total
  const groupGrand = useMemo(
    () => items.reduce((sum, item) => sum + getItemTotal(item), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  ); // getItemTotal is a stable Zustand selector

  const pricedCount = useMemo(
    () => items.filter(i => getItemTotal(i) > 0).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  ); // getItemTotal is a stable Zustand selector

  const pricedPct = items.length > 0 ? Math.round((pricedCount / items.length) * 100) : 0;
  const perSF = projectSF > 0 ? groupGrand / projectSF : 0;

  const totalCO2e = useMemo(() => items.reduce((sum, item) => sum + getItemCO2e(item), 0), [items]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: T.space[3],
        padding: `${T.space[4]}px ${T.space[6]}px`,
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        flexShrink: 0,
      }}
    >
      <KPI label="Grand Total" value={fmt(groupGrand)} icon={I.dollar} color={C.accent} accent />
      <KPI label="Items" value={items.length} icon={I.estimate} color={C.blue} />
      <KPI
        label="% Priced"
        value={`${pricedPct}%`}
        icon={I.check}
        color={pricedPct === 100 ? C.green : C.orange}
        sub={`${pricedCount} of ${items.length}`}
      />
      <KPI
        label="$/SF"
        value={projectSF > 0 ? fmt(Math.round(perSF)) : "\u2014"}
        icon={I.ruler}
        color={C.cyan || C.accent}
        sub={projectSF > 0 ? `${nn(projectSF).toLocaleString()} SF` : "Set project SF"}
      />
      <KPI
        label="CO\u2082e"
        value={totalCO2e > 0 ? formatCarbon(totalCO2e) : "\u2014"}
        icon={I.layers}
        color={C.green}
        sub="kg estimated"
      />
    </div>
  );
}
