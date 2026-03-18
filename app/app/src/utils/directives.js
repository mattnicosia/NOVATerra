import { nn } from './format';

export const autoDirective = (mat, lab, equip, sub) => {
  const m = nn(mat), l = nn(lab), e = nn(equip), s = nn(sub);
  const hasMat = m > 0;
  const hasLabor = l > 0 || e > 0;
  const hasSub = s > 0;
  if (hasMat && hasLabor && !hasSub) return "F/I";
  if (hasMat && !hasLabor && !hasSub) return "F/O";
  if (!hasMat && hasLabor && !hasSub) return "I/O";
  return "";
};
