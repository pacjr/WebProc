/** Presentation-only share of registered volume across returned aggregate rows. */
export function sumRegisteredAggregateCounts(rows: { count: number }[]): number {
  return rows.reduce((total, row) => total + (row.count ?? 0), 0);
}

export function formatRegisteredParticipation(count: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (count / total) * 100;
  return `${pct.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })}%`;
}
