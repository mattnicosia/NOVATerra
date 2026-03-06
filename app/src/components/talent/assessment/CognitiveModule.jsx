// ─── BLDG Talent — CognitiveModule ─────────────────────────────────────
// Module 4: 15 fill-in-the-blank cognitive reasoning questions
// Paginated one question at a time with section headers

import { useCallback, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBTAssessmentStore } from "@/stores/btAssessmentStore";
import { BT_COGNITIVE_QUESTIONS, BT_COGNITIVE_SECTIONS } from "@/constants/btCognitive";
import { card, inp, accentButton, bt, sectionLabel } from "@/utils/styles";

export default function CognitiveModule() {
  const C = useTheme();
  const T = C.T;
  const inputRef = useRef(null);

  const currentQuestionIndex = useBTAssessmentStore(s => s.currentQuestionIndex);
  const cognitiveResponses = useBTAssessmentStore(s => s.cognitiveResponses);
  const submitResponse = useBTAssessmentStore(s => s.submitResponse);
  const setCurrentQuestionIndex = useBTAssessmentStore(s => s.setCurrentQuestionIndex);
  const completeModule = useBTAssessmentStore(s => s.completeModule);

  const question = BT_COGNITIVE_QUESTIONS[currentQuestionIndex];
  const total = BT_COGNITIVE_QUESTIONS.length;
  const isFirst = currentQuestionIndex === 0;
  const isLast = currentQuestionIndex === total - 1;

  // Find which section the current question belongs to
  const currentSection = BT_COGNITIVE_SECTIONS.find(s => s.questions.includes(question?.id));
  const sectionIndex = BT_COGNITIVE_SECTIONS.indexOf(currentSection) + 1;

  // Auto-focus input on question change
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [currentQuestionIndex]);

  const handleChange = useCallback(
    e => {
      if (question) submitResponse(question.id, e.target.value);
    },
    [question, submitResponse],
  );

  const goNext = useCallback(() => {
    if (!isLast) setCurrentQuestionIndex(currentQuestionIndex + 1);
  }, [isLast, currentQuestionIndex, setCurrentQuestionIndex]);

  const goPrev = useCallback(() => {
    if (!isFirst) setCurrentQuestionIndex(currentQuestionIndex - 1);
  }, [isFirst, currentQuestionIndex, setCurrentQuestionIndex]);

  const handleKeyDown = useCallback(
    e => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!isLast) goNext();
      }
    },
    [isLast, goNext],
  );

  const handleSubmit = useCallback(() => {
    completeModule("cognitive");
  }, [completeModule]);

  if (!question) return null;

  const currentValue = cognitiveResponses[question.id] ?? "";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
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
        {/* Section header */}
        {currentSection && (
          <div style={sectionLabel(C)}>
            Section {sectionIndex}: {currentSection.label}
          </div>
        )}

        {/* Question number */}
        <div
          style={{
            fontSize: T.fontSize.sm,
            fontWeight: T.fontWeight.medium,
            color: C.textDim,
          }}
        >
          Question {currentQuestionIndex + 1} of {total}
        </div>

        {/* Question text */}
        <div
          style={{
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.medium,
            color: C.text,
            lineHeight: T.lineHeight.relaxed,
            whiteSpace: "pre-wrap",
          }}
        >
          {question.question}
        </div>

        {/* Input field + unit */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[3],
          }}
        >
          <input
            ref={inputRef}
            type="number"
            value={currentValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter your answer"
            style={inp(C, {
              maxWidth: 260,
              fontSize: T.fontSize.md,
              padding: "10px 14px",
            })}
          />
          {question.unit && (
            <span
              style={{
                fontSize: T.fontSize.md,
                fontWeight: T.fontWeight.semibold,
                color: C.textDim,
                whiteSpace: "nowrap",
              }}
            >
              {question.unit}
            </span>
          )}
        </div>

        {/* Calculator note */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[2],
            fontSize: T.fontSize.xs,
            color: C.textDim,
            marginTop: -T.space[2],
          }}
        >
          {/* Calculator icon */}
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.textDim}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="8" y2="10.01" />
            <line x1="12" y1="10" x2="12" y2="10.01" />
            <line x1="16" y1="10" x2="16" y2="10.01" />
            <line x1="8" y1="14" x2="8" y2="14.01" />
            <line x1="12" y1="14" x2="12" y2="14.01" />
            <line x1="16" y1="14" x2="16" y2="14.01" />
            <line x1="8" y1="18" x2="16" y2="18" />
          </svg>
          Calculator allowed
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
          }}
        />

        {/* Navigation buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={goPrev}
            disabled={isFirst}
            style={bt(C, {
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
              color: isFirst ? C.textDim : C.text,
              padding: "8px 20px",
              opacity: isFirst ? 0.4 : 1,
              cursor: isFirst ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
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
            Previous
          </button>

          {isLast ? (
            <button
              onClick={handleSubmit}
              style={accentButton(C, {
                padding: "8px 24px",
                fontFamily: "'DM Sans', sans-serif",
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
              onClick={goNext}
              style={bt(C, {
                background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                color: C.text,
                padding: "8px 20px",
                fontFamily: "'DM Sans', sans-serif",
              })}
            >
              Next
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
          {Object.keys(cognitiveResponses).length} of {total} answered
        </div>
      </div>
    </div>
  );
}
