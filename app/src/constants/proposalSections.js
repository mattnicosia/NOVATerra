import { I } from './icons';

export const PROPOSAL_SECTIONS = [
  { id: "coverLetter", label: "Cover Letter", icon: I.send },
  { id: "letterhead", label: "Letterhead", icon: I.layers, required: true },
  { id: "recipient", label: "Recipient", icon: I.user, required: true },
  { id: "greeting", label: "Greeting", icon: I.send },
  { id: "intro", label: "Introduction", icon: I.plans },
  { id: "scope", label: "Scope of Work", icon: I.estimate, required: true },
  { id: "baseBid", label: "Base Bid", icon: I.dollar, required: true },
  { id: "alternates", label: "Alternates", icon: I.change, conditional: true },
  { id: "exclusions", label: "Exclusions", icon: I.x, conditional: true },
  { id: "allowances", label: "Allowances", icon: I.dollar, conditional: true },
  { id: "clarifications", label: "Clarifications", icon: I.hash, conditional: true },
  { id: "qualifications", label: "Qualifications", icon: I.check },
  { id: "closing", label: "Closing", icon: I.send },
  { id: "signature", label: "Signature", icon: I.user, required: true },
  { id: "acceptance", label: "Acceptance", icon: I.check },
  { id: "sov", label: "Schedule of Values", icon: I.dollar },
];

export const DEFAULT_SECTION_ORDER = PROPOSAL_SECTIONS.map(s => s.id);

export const DEFAULT_SECTION_VISIBILITY = Object.fromEntries(
  PROPOSAL_SECTIONS.map(s => [s.id, s.id === "coverLetter" ? false : true])
);

export function isPageBreak(id) { return id.startsWith("pagebreak_"); }
export function isSpacer(id) { return id.startsWith("spacer_"); }
export function isSpecialSection(id) { return isPageBreak(id) || isSpacer(id); }

export function getSpecialSectionMeta(id) {
  if (isPageBreak(id)) return { id, label: "Page Break", icon: I.pageBreak, special: true, type: "pagebreak" };
  if (isSpacer(id)) return { id, label: "Spacer", icon: I.spacer, special: true, type: "spacer" };
  return null;
}
