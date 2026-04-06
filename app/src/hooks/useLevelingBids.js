// useLevelingBids — Extracted from LevelingView.jsx
// Bid cell operations, selection logic, and computed totals
import { useCallback, useMemo } from "react";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { nn } from "@/utils/format";

export function useLevelingBids({ items, getItemTotal, subdivisions, activeCodes }) {
  const bidCells = useBidManagementStore(s => s.bidCells);
  const bidSelections = useBidManagementStore(s => s.bidSelections);
  const setBidSelections = useBidManagementStore(s => s.setBidSelections);
  const bidTotals = useBidManagementStore(s => s.bidTotals);
  const linkedSubs = useBidManagementStore(s => s.linkedSubs);
  const subKeyLabels = useBidManagementStore(s => s.subKeyLabels);

  const getCell = (itemId, subId) => bidCells[`${itemId}_${subId}`] || { status: "blank", value: "" };

  const getCellComputedValue = (item, cell) => {
    if (cell.status === "blank") return 0;
    if (cell.status === "lumpsum" || cell.status === "amount") return nn(cell.value);
    if (cell.status === "unitrate") return nn(cell.value) * nn(item.quantity);
    if (cell.status === "carried") return getItemTotal(item);
    return 0;
  };

  const saveCellWithStatus = useCallback((itemId, subId, status, value) => {
    const bc = useBidManagementStore.getState().bidCells;
    const key = `${itemId}_${subId}`;
    if (status === "blank") {
      useBidManagementStore.getState().setBidCells({ ...bc, [key]: { status: "blank", value: "" } });
    } else if (status === "carried") {
      useBidManagementStore.getState().setBidCells({ ...bc, [key]: { status: "carried", value: "" } });
    } else {
      const numVal = nn(value);
      useBidManagementStore.getState().setBidCells({
        ...bc,
        [key]: { status, value: numVal ? String(numVal) : "" },
      });
    }
  }, []);

  const saveCell = useCallback((itemId, subId, value) => {
    const bc = useBidManagementStore.getState().bidCells;
    const key = `${itemId}_${subId}`;
    const existing = bc[key] || { status: "blank", value: "" };
    const status = existing.status === "unitrate" ? "unitrate" : "lumpsum";
    const numVal = nn(value);
    useBidManagementStore.getState().setBidCells({
      ...bc,
      [key]: numVal ? { status, value: String(numVal) } : { status: "blank", value: "" },
    });
  }, []);

  const autoCarry = useCallback(
    (sk, subId) => {
      const bc = useBidManagementStore.getState().bidCells;
      const newCells = { ...bc };
      const subItems = subdivisions.find(s => s.sk === sk)?.items || [];
      subItems.forEach(item => {
        newCells[`${item.id}_${subId}`] = { status: "carried", value: "" };
      });
      useBidManagementStore.getState().setBidCells(newCells);
    },
    [subdivisions],
  );

  const getSkSubTotal = (sk, subId) => {
    const skItems = subdivisions.find(s => s.sk === sk)?.items || [];
    let cellTotal = 0;
    let hasCells = false;
    skItems.forEach(item => {
      const cell = getCell(item.id, subId);
      if (cell.status !== "blank") {
        cellTotal += getCellComputedValue(item, cell);
        hasCells = true;
      }
    });
    if (hasCells) return cellTotal;
    return nn(bidTotals[subId]);
  };

  const getBidSelection = sk => bidSelections[sk] || { source: "", customValue: "" };
  const setBidSelection = (sk, updates) => {
    setBidSelections({ ...bidSelections, [sk]: { ...getBidSelection(sk), ...updates } });
  };
  const getSelectedBidValue = sk => {
    const sel = getBidSelection(sk);
    if (!sel.source) return 0;
    if (sel.source === "internal") return subdivisions.find(s => s.sk === sk)?.total || 0;
    if (sel.source === "custom") return nn(sel.customValue);
    if (sel.source.startsWith("linked_")) {
      const ls = linkedSubs.find(l => `linked_${l.id}` === sel.source);
      return ls ? nn(ls.totalBid) : 0;
    }
    return getSkSubTotal(sk, sel.source);
  };

  const getSubLabel = sk => {
    const dc = sk.split(".")[0];
    const subName = activeCodes[dc]?.subs?.[sk] || "";
    return subKeyLabels[sk] || `${sk} ${subName}`;
  };

  const getHighlight = (sk, subId) => {
    const allSubs = useBidManagementStore.getState().subBidSubs;
    const subs = allSubs[sk] || [];
    if (subs.length < 2) return null;
    const vals = subs.map(s => getSkSubTotal(sk, s.id)).filter(v => v > 0);
    if (vals.length < 2) return null;
    const v = getSkSubTotal(sk, subId);
    if (v <= 0) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (v === min) return "low";
    if (v === max) return "high";
    return null;
  };

  const totalBidValue = useMemo(
    () => subdivisions.reduce((sum, sub) => sum + getSelectedBidValue(sub.sk), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subdivisions, bidSelections, bidCells, bidTotals, linkedSubs],
  );

  return {
    bidCells,
    bidSelections,
    linkedSubs,
    subKeyLabels,
    getCell,
    getCellComputedValue,
    saveCellWithStatus,
    saveCell,
    autoCarry,
    getSkSubTotal,
    getBidSelection,
    setBidSelection,
    getSelectedBidValue,
    getSubLabel,
    getHighlight,
    totalBidValue,
  };
}
