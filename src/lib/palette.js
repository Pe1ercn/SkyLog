export const SESSION_COLORS = [
  '#2f6df6',
  '#0ea5a4',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#10b981',
  '#6366f1',
  '#f97316',
  '#06b6d4',
  '#a855f7',
];

export function sessionColor(index) {
  const value = Number(index);
  return SESSION_COLORS[Number.isFinite(value) ? Math.abs(value) % SESSION_COLORS.length : 0];
}
