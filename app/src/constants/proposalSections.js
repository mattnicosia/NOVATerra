import { I } from './icons';

export const PROPOSAL_SECTIONS = [
  { id: "heroImage", label: "Hero Image", icon: I.image, conditional: true },
  { id: "coverLetter", label: "Cover Letter", icon: I.send },
  { id: "letterhead", label: "Letterhead", icon: I.layers, required: true },
  { id: "recipient", label: "Recipient", icon: I.user, required: true },
  { id: "greeting", label: "Greeting", icon: I.send },
  { id: "intro", label: "Introduction", icon: I.plans },
  { id: "projectVision", label: "Project Vision", icon: I.plans, monographDefault: true },
  { id: "siteContext", label: "Site Context", icon: I.plans, monographDefault: true },
  { id: "scope", label: "Scope of Work", icon: I.estimate },
  { id: "costVisualization3D", label: "Cost Intensity Map", icon: I.report },
  { id: "baseBid", label: "Base Bid", icon: I.dollar, required: true },
  { id: "sov", label: "Schedule of Values", icon: I.dollar },
  { id: "designNarrative", label: "Design Narrative", icon: I.estimate, monographDefault: true },
  { id: "alternates", label: "Alternates", icon: I.change, conditional: true },
  { id: "exclusions", label: "Exclusions", icon: I.x, conditional: true },
  { id: "allowances", label: "Allowances", icon: I.dollar, conditional: true },
  { id: "clarifications", label: "Clarifications", icon: I.hash, conditional: true },
  { id: "qualifications", label: "Qualifications", icon: I.check },
  { id: "closing", label: "Closing", icon: I.send },
  { id: "signature", label: "Signature", icon: I.user, required: true },
  { id: "acceptance", label: "Acceptance", icon: I.check },
  { id: "costGraph", label: "Cost Distribution", icon: I.report, conditional: true },
];

export const DEFAULT_SECTION_ORDER = PROPOSAL_SECTIONS.map(s => s.id);

// Monograph-only sections are hidden by default in standard layout
const HIDDEN_BY_DEFAULT = new Set(["coverLetter", "projectVision", "siteContext", "designNarrative"]);

export const DEFAULT_SECTION_VISIBILITY = Object.fromEntries(
  PROPOSAL_SECTIONS.map(s => [s.id, !HIDDEN_BY_DEFAULT.has(s.id)])
);

/** Visibility preset for monograph layout — shows monograph sections, hides some standard ones */
export const MONOGRAPH_SECTION_VISIBILITY = Object.fromEntries(
  PROPOSAL_SECTIONS.map(s => {
    // Hide letterhead, recipient, greeting, intro in monograph (cover letter replaces them)
    const hideInMonograph = new Set(["letterhead", "recipient", "greeting", "intro"]);
    if (hideInMonograph.has(s.id)) return [s.id, false];
    // Show monograph sections
    if (s.monographDefault) return [s.id, true];
    // Show cover letter in monograph
    if (s.id === "coverLetter") return [s.id, true];
    if (s.id === "costVisualization3D") return [s.id, true];
    return [s.id, true];
  })
);

export function isPageBreak(id) { return id.startsWith("pagebreak_"); }
export function isSpacer(id) { return id.startsWith("spacer_"); }
export function isUploadedDoc(id) { return id.startsWith("doc_"); }
export function isSpecialSection(id) { return isPageBreak(id) || isSpacer(id) || isUploadedDoc(id); }

export function getSpecialSectionMeta(id) {
  if (isPageBreak(id)) return { id, label: "Page Break", icon: I.pageBreak, special: true, type: "pagebreak" };
  if (isSpacer(id)) return { id, label: "Spacer", icon: I.spacer, special: true, type: "spacer" };
  if (isUploadedDoc(id)) {
    // Dynamic label — caller should override with actual doc name from store
    return { id, label: "Document", icon: I.file, special: true, type: "doc" };
  }
  return null;
}
