/**
 * Date utility helpers — extracted from ResourcePage.
 * Pure functions, no state dependencies.
 */

export const toDateStr = dt =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

export const parseDateStr = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const isWeekdayFn = (d, workWeek = "mon-fri") => {
  const day = d.getDay();
  if (workWeek === "mon-sat") return day !== 0; // Sun off only
  return day !== 0 && day !== 6;
};
