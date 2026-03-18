// ─── BLDG Talent — BehavioralModule ────────────────────────────────────
// Module 6: 24 Likert-scale personality/work style statements
// Shown in groups of 4, paginated with navigation

import { useState, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBTAssessmentStore } from "@/stores/btAssessmentStore";
import { BT_BEHAVIORAL_ITEMS, BT_LIKERT_LABELS } from "@/constants/btBehavioral";
import { card, accentButton, bt, sectionLabel } from "@/utils/styles";

const GROUP_SIZE = 4;

export default function BehavioralModule() {
  const C = useTheme();
  const T = C.T;

  const behavioralResponses = useBTAssessmentStore(s => s.behavioralResponses);
  const submitResponse = useBTAssessmentStore(s => s.submitResponse);
  const setCurrentQuestionIndex = useBTAssessmentStore(s => s.setCurrentQuestionIndex);
  const completeModule = useBTAssessmentStore(s => s.completeModule);

  const [groupIndex, setGroupIndex] = useState(0);

  const totalItems = BT_BEHAVIORAL_ITEMS.length;
  const totalGroups = Math.ceil(totalItems / GROUP_SIZE);

  // Current group of items
  const currentGroup = useMemo(() => {
    const start = groupIndex * GROUP_SIZE;
    return BT_BEHAVIORAL_ITEMS.slice(start, start + GROUP_SIZE);
  }, [groupIndex]);

  const startItemNum = groupIndex * GROUP_SIZE + 1;
  const endItemNum = Math.min((groupIndex + 1) * GROUP_SIZE, totalItems);
  const isFirstGroup = groupIndex === 0;
  const isLastGroup = groupIndex === totalGroups - 1;

  // Check if all items in current group are answered
  const allGroupAnswered = currentGroup.every(item => behavioralResponses[item.id] != null);

  const handleResponse = useCallback(
    (itemId, value) => {
      submitResponse(itemId, value);
    },
    [submitResponse],
  );

  const goNextGroup = useCallback(() => {
    if (!isLastGroup && allGroupAnswered) {
      const next = groupIndex + 1;
      setGroupIndex(next);
      // Update the store's question index for the shell progress bar
      setCurrentQuestionIndex(next * GROUP_SIZE);
    }
  }, [isLastGroup, allGroupAnswered, groupIndex, setCurrentQuestionIndex]);

  const goPrevGroup = useCallback(() => {
    if (!isFirstGroup) {
      const prev = groupIndex - 1;
      setGroupIndex(prev);
      setCurrentQuestionIndex(prev * GROUP_SIZE);
    }
  }, [isFirstGroup, groupIndex, setCurrentQuestionIndex]);

  const handleSubmit = useCallback(() => {
    completeModule("behavioral");
  }, [completeModule]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        fontFamily: T.font.sans,
      }}
    >
      <div
        style={{
          ...card(C),
          maxWidth: 700,
          width: "100%",
          padding: T.space[7],
          display: "flex",
          flexDirection: "column",
          gap: T.space[5],
        }}
      >
        {/* Group indicator */}
        <div style={sectionLabel(C)}>
          Items {startItemNum}\u2013{endItemNum} of {totalItems}
        </div>

        {/* Info note */}
        <div
          style={{
            fontSize: T.fontSize.sm,
            color: C.textDim,
            lineHeight: T.lineHeight.relaxed,
            fontStyle: "italic",
            padding: `${T.space[2]}px ${T.space[3]}px`,
            background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            borderRadius: T.radius.sm,
            borderLeft: `3px solid ${C.accent}40`,
          }}
        >
          There are no right or wrong answers. Answer based on how you typically behave in a professional setting.
        </div>

        {/* Behavioral items */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: T.space[5],
          }}
        >
          {currentGroup.map((item, idx) => (
            <BehavioralItem
              key={item.id}
              item={item}
              index={startItemNum + idx}
              selectedValue={behavioralResponses[item.id]}
              onSelect={handleResponse}
              C={C}
              T={T}
            />
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
          }}
        />

        {/* Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={goPrevGroup}
            disabled={isFirstGroup}
            style={bt(C, {
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
              color: isFirstGroup ? C.textDim : C.text,
              padding: "8px 20px",
              opacity: isFirstGroup ? 0.4 : 1,
              cursor: isFirstGroup ? "not-allowed" : "pointer",
              fontFamily: T.font.sans,
            })}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
            Previous Group
          </button>

          {isLastGroup ? (
            <button
              onClick={handleSubmit}
              disabled={!allGroupAnswered}
              style={accentButton(C, {
                padding: "8px 24px",
                fontFamily: T.font.sans,
                opacity: allGroupAnswered ? 1 : 0.5,
                cursor: allGroupAnswered ? "pointer" : "not-allowed",
              })}
            >
              Submit Module
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20,6 9,17 4,12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={goNextGroup}
              disabled={!allGroupAnswered}
              style={bt(C, {
                background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                color: allGroupAnswered ? C.text : C.textDim,
                padding: "8px 20px",
                opacity: allGroupAnswered ? 1 : 0.5,
                cursor: allGroupAnswered ? "pointer" : "not-allowed",
                fontFamily: T.font.sans,
              })}
            >
              Next Group
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9,6 15,12 9,18" />
              </svg>
            </button>
          )}
        </div>

        {/* Answered count */}
        <div
          style={{
            textAlign: "center",
            fontSize: T.fontSize.xs,
            color: C.textDim,
          }}
        >
          {Object.keys(behavioralResponses).length} of {totalItems} answered
        </div>
      </div>
    </div>
  );
}

// ── Single behavioral item with Likert scale ──
function BehavioralItem({ item, index, selectedValue, onSelect, C, T }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: T.space[3],
        padding: `${T.space[4]}px`,
        background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
        borderRadius: T.radius.sm,
        border: `1px solid ${
          selectedValue != null ? `${C.accent}30` : C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
        }`,
        transition: "border-color 200ms ease",
      }}
    >
      {/* Statement text */}
      <div
        style={{
          fontSize: T.fontSize.base,
          fontWeight: T.fontWeight.medium,
          color: C.text,
          lineHeight: T.lineHeight.relaxed,
        }}
      >
        <span
          style={{
            color: C.textDim,
            fontSize: T.fontSize.sm,
            fontWeight: T.fontWeight.semibold,
            marginRight: T.space[2],
          }}
        >
          {index}.
        </span>
        {item.statement}
      </div>

      {/* Likert buttons */}
      <div
        style={{
          display: "flex",
          gap: T.space[1],
          flexWrap: "wrap",
        }}
      >
        {BT_LIKERT_LABELS.map(({ value, label }) => {
          const isSelected = selectedValue === value;
          return (
            <button
              key={value}
              onClick={() => onSelect(item.id, value)}
              style={{
                flex: 1,
                minWidth: 90,
                padding: "8px 4px",
                border: `1px solid ${isSelected ? C.accent : C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                borderRadius: T.radius.sm,
                background: isSelected ? `${C.accent}18` : C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                color: isSelected ? C.accent : C.textDim,
                fontSize: T.fontSize.xs,
                fontWeight: isSelected ? T.fontWeight.bold : T.fontWeight.medium,
                fontFamily: T.font.sans,
                cursor: "pointer",
                textAlign: "center",
                lineHeight: T.lineHeight.tight,
                transition: "all 150ms ease",
                boxShadow: isSelected ? `0 0 0 1px ${C.accent}40` : "none",
              }}
            >
              <div
                style={{
                  fontSize: T.fontSize.md,
                  fontWeight: T.fontWeight.bold,
                  marginBottom: 2,
                  color: isSelected ? C.accent : C.text,
                }}
              >
                {value}
              </div>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
