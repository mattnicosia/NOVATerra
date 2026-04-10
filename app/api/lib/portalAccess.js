export function isPortalSubmissionLocked(status) {
  return ["submitted", "parsed", "awarded", "not_awarded"].includes(status);
}

export function isPastDueDate(dueDate) {
  if (!dueDate) return false;
  const due = new Date(`${dueDate}T23:59:59`);
  return Number.isFinite(due.getTime()) && Date.now() > due.getTime();
}
